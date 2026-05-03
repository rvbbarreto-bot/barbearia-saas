# ─────────────────────────────────────────────────────────────────────────────
#  import_workflows.ps1 — Importa workflows no n8n via API
#
#  ATENÇÃO: NÃO coloque chaves reais neste arquivo.
#  Defina as variáveis de ambiente abaixo antes de executar:
#
#    $env:N8N_API_KEY      = "sua_chave_n8n_api"
#    $env:N8N_HTTP_CRED_ID = "id_da_credencial_http_bearer"
#    $env:N8N_PG_CRED_ID   = "id_da_credencial_postgres"
#    $env:N8N_URL          = "http://localhost:5678"  (opcional, default abaixo)
#
#  Obtenha os IDs das credenciais após executar create_credentials.ps1
#  Uso: PowerShell -ExecutionPolicy Bypass -File import_workflows.ps1
# ─────────────────────────────────────────────────────────────────────────────

$N8N_KEY      = $env:N8N_API_KEY
$HTTP_CRED_ID = $env:N8N_HTTP_CRED_ID
$PG_CRED_ID   = $env:N8N_PG_CRED_ID
$N8N_URL      = $env:N8N_URL ?? "http://localhost:5678"

if (-not $N8N_KEY)      { Write-Error "N8N_API_KEY não definido"; exit 1 }
if (-not $HTTP_CRED_ID) { Write-Error "N8N_HTTP_CRED_ID não definido (execute create_credentials.ps1 primeiro)"; exit 1 }
if (-not $PG_CRED_ID)   { Write-Error "N8N_PG_CRED_ID não definido (execute create_credentials.ps1 primeiro)"; exit 1 }

$headers = @{ "X-N8N-API-KEY" = $N8N_KEY; "Content-Type" = "application/json" }

# ============================================================
# WORKFLOW 01 — Router WhatsApp Multi-Tenant
# ============================================================
$wf01 = @{
  name   = "SaaS Barbearia - 01 Router WhatsApp Multi-Tenant"
  active = $false
  settings = @{ executionOrder = "v1" }
  nodes  = @(
    @{
      id         = "webhook-inbound"
      name       = "Webhook Evolution Inbound"
      type       = "n8n-nodes-base.webhook"
      typeVersion = 2
      position   = @(0, 0)
      parameters = @{
        path         = "saas/barbearia/whatsapp/inbound"
        httpMethod   = "POST"
        responseMode = "responseNode"
      }
    },
    @{
      id         = "normalize"
      name       = "Normalizar Entrada"
      type       = "n8n-nodes-base.code"
      typeVersion = 2
      position   = @(260, 0)
      parameters = @{
        jsCode = "const body = `$json; const phone = body?.data?.key?.remoteJid?.replace('@s.whatsapp.net','') || body.phone || ''; const text = body?.data?.message?.conversation || body?.data?.message?.extendedTextMessage?.text || body.message || ''; const instance = body.instance || body.tenant_slug || 'barbearia-demo'; return [{json:{tenant_slug:instance, phone, text, payload:body}}];"
      }
    },
    @{
      id         = "api-upsert"
      name       = "Registrar entrada no Core API"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(520, 0)
      parameters = @{
        method      = "POST"
        url         = "={{ `$env.API_BASE_URL }}/webhooks/whatsapp/inbound"
        sendBody    = $true
        specifyBody = "json"
        jsonBody    = '={"tenant_id":"{{ $env.DEFAULT_TENANT_ID }}","phone":"{{ $json.phone }}","message":"{{ $json.text }}","external_message_id":"{{ $json.payload.data?.key?.id ?? \"\" }}"}'
        authentication = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    },
    @{
      id         = "call-agent"
      name       = "Chamar Agente Multi-Tenant"
      type       = "n8n-nodes-base.executeWorkflow"
      typeVersion = 1
      position   = @(780, 0)
      parameters = @{
        workflowId = "={{ `$workflow.id }}"
        options    = @{}
      }
    },
    @{
      id         = "respond"
      name       = "Responder Webhook"
      type       = "n8n-nodes-base.respondToWebhook"
      typeVersion = 1
      position   = @(1040, 0)
      parameters = @{
        respondWith  = "json"
        responseBody = '={"ok":true}'
      }
    }
  )
  connections = @{
    "Webhook Evolution Inbound" = @{
      main = @(@(@{ node = "Normalizar Entrada"; type = "main"; index = 0 }))
    }
    "Normalizar Entrada" = @{
      main = @(@(@{ node = "Registrar entrada no Core API"; type = "main"; index = 0 }))
    }
    "Registrar entrada no Core API" = @{
      main = @(@(@{ node = "Chamar Agente Multi-Tenant"; type = "main"; index = 0 }))
    }
    "Chamar Agente Multi-Tenant" = @{
      main = @(@(@{ node = "Responder Webhook"; type = "main"; index = 0 }))
    }
  }
} | ConvertTo-Json -Depth 15

# ============================================================
# WORKFLOW 02 — Agente IA Agendamento Multi-Tenant
# ============================================================
$wf02 = @{
  name   = "SaaS Barbearia - 02 Agente Agenda Multi-Tenant"
  active = $false
  settings = @{ executionOrder = "v1" }
  nodes  = @(
    @{
      id         = "trigger"
      name       = "When Executed by Another Workflow"
      type       = "n8n-nodes-base.executeWorkflowTrigger"
      typeVersion = 1
      position   = @(0, 0)
      parameters = @{}
    },
    @{
      id         = "get-context"
      name       = "Buscar Contexto Agenda Core API"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(260, 0)
      parameters = @{
        method          = "GET"
        url             = "={{ `$env.API_BASE_URL }}/api/v1/appointments?from={{ `$now.toISO() }}&to={{ `$now.plus({days:7}).toISO() }}"
        authentication  = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    },
    @{
      id         = "get-services"
      name       = "Buscar Servicos Disponiveis"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(260, 120)
      parameters = @{
        method          = "GET"
        url             = "={{ `$env.API_BASE_URL }}/api/v1/services"
        authentication  = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    },
    @{
      id         = "get-professionals"
      name       = "Buscar Profissionais"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(260, 240)
      parameters = @{
        method          = "GET"
        url             = "={{ `$env.API_BASE_URL }}/api/v1/professionals"
        authentication  = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    },
    @{
      id         = "switch-intent"
      name       = "Intencao Criar?"
      type       = "n8n-nodes-base.if"
      typeVersion = 2
      position   = @(780, 0)
      parameters = @{
        conditions = @{
          string = @(@{
            value1    = "={{ `$json.intent }}"
            operation = "equals"
            value2    = "criar_agendamento"
          })
        }
      }
    },
    @{
      id         = "create-appt"
      name       = "Criar Agendamento Core API"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(1040, -80)
      parameters = @{
        method          = "POST"
        url             = "={{ `$env.API_BASE_URL }}/api/v1/appointments"
        sendBody        = $true
        specifyBody     = "json"
        jsonBody        = "={{ `$json.appointment_payload }}"
        authentication  = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    },
    @{
      id         = "send-message"
      name       = "Enviar Resposta WhatsApp"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(1300, 0)
      parameters = @{
        method      = "POST"
        url         = "={{ `$env.EVOLUTION_API_URL }}/message/sendText/{{ `$json.tenant_slug || `$env.DEFAULT_TENANT_SLUG }}"
        sendBody    = $true
        specifyBody = "json"
        jsonBody    = '={"number":"{{ $json.phone }}","text":"{{ $json.response_text }}"}'
        sendHeaders = $true
        headerParameters = @{
          parameters = @(@{ name = "apikey"; value = "={{ `$env.EVOLUTION_API_KEY }}" })
        }
      }
    }
  )
  connections = @{
    "When Executed by Another Workflow" = @{
      main = @(@(@{ node = "Buscar Contexto Agenda Core API"; type = "main"; index = 0 }))
    }
    "Buscar Contexto Agenda Core API" = @{
      main = @(@(@{ node = "Intencao Criar?"; type = "main"; index = 0 }))
    }
    "Intencao Criar?" = @{
      main = @(
        @(@{ node = "Criar Agendamento Core API"; type = "main"; index = 0 }),
        @(@{ node = "Enviar Resposta WhatsApp";   type = "main"; index = 0 })
      )
    }
    "Criar Agendamento Core API" = @{
      main = @(@(@{ node = "Enviar Resposta WhatsApp"; type = "main"; index = 0 }))
    }
  }
} | ConvertTo-Json -Depth 15

# ============================================================
# WORKFLOW 03 — Recall 30 Dias Multi-Tenant
# ============================================================
$wf03 = @{
  name   = "SaaS Barbearia - 03 Recall 30 Dias Multi-Tenant"
  active = $false
  settings = @{ executionOrder = "v1"; timezone = "America/Sao_Paulo" }
  nodes  = @(
    @{
      id         = "schedule"
      name       = "A cada 6 horas"
      type       = "n8n-nodes-base.scheduleTrigger"
      typeVersion = 1.2
      position   = @(0, 0)
      parameters = @{
        rule = @{
          interval = @(@{ field = "hours"; hoursInterval = 6 })
        }
      }
    },
    @{
      id         = "query"
      name       = "Buscar Candidatos Recall"
      type       = "n8n-nodes-base.postgres"
      typeVersion = 2.5
      position   = @(260, 0)
      parameters = @{
        operation = "executeQuery"
        query     = "SELECT customer_name, phone, tenant_slug, professional_name, last_visit_at, due_at, message FROM v_recall_candidates WHERE due_at <= now() LIMIT 200"
      }
      credentials = @{
        postgres = @{ id = $PG_CRED_ID; name = "Barbearia Postgres" }
      }
    },
    @{
      id         = "batch"
      name       = "Loop Clientes"
      type       = "n8n-nodes-base.splitInBatches"
      typeVersion = 3
      position   = @(520, 0)
      parameters = @{
        batchSize = 1
        options   = @{}
      }
    },
    @{
      id         = "send"
      name       = "Enviar Recall WhatsApp"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(780, 0)
      parameters = @{
        method      = "POST"
        url         = "={{ `$env.EVOLUTION_API_URL }}/message/sendText/{{ `$json.tenant_slug }}"
        sendBody    = $true
        specifyBody = "json"
        jsonBody    = '={"number":"{{ $json.phone }}","text":"{{ $json.message }}"}'
        sendHeaders = $true
        headerParameters = @{
          parameters = @(@{ name = "apikey"; value = "={{ `$env.EVOLUTION_API_KEY }}" })
        }
      }
    },
    @{
      id         = "audit"
      name       = "Auditar Envio Recall"
      type       = "n8n-nodes-base.httpRequest"
      typeVersion = 4
      position   = @(1040, 0)
      parameters = @{
        method          = "POST"
        url             = "={{ `$env.API_BASE_URL }}/api/v1/customers"
        sendBody        = $true
        specifyBody     = "json"
        jsonBody        = '={"_note":"recall_sent","phone":"{{ $json.phone }}","tenant_slug":"{{ $json.tenant_slug }}"}'
        authentication  = "genericCredentialType"
        genericAuthType = "httpHeaderAuth"
        continueOnFail  = $true
      }
      credentials = @{
        httpHeaderAuth = @{ id = $HTTP_CRED_ID; name = "Barbearia API - Bearer JWT" }
      }
    }
  )
  connections = @{
    "A cada 6 horas" = @{
      main = @(@(@{ node = "Buscar Candidatos Recall"; type = "main"; index = 0 }))
    }
    "Buscar Candidatos Recall" = @{
      main = @(@(@{ node = "Loop Clientes"; type = "main"; index = 0 }))
    }
    "Loop Clientes" = @{
      main = @(@(@{ node = "Enviar Recall WhatsApp"; type = "main"; index = 0 }))
    }
    "Enviar Recall WhatsApp" = @{
      main = @(@(@{ node = "Auditar Envio Recall"; type = "main"; index = 0 }))
    }
    "Auditar Envio Recall" = @{
      main = @(@(@{ node = "Loop Clientes"; type = "main"; index = 0 }))
    }
  }
} | ConvertTo-Json -Depth 15

# ============================================================
# IMPORTAR OS 3 WORKFLOWS
# ============================================================
$results = @{}
foreach ($pair in @(("WF01", $wf01), ("WF02", $wf02), ("WF03", $wf03))) {
  $label = $pair[0]; $body = $pair[1]
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:5678/api/v1/workflows" -Method POST -Headers $headers -Body $body
    Write-Output ("IMPORT_" + $label + "_ID=" + $r.id)
    Write-Output ("IMPORT_" + $label + "_NAME=" + $r.name)
    $results[$label] = $r.id
  } catch {
    Write-Output ("IMPORT_" + $label + "_ERROR=" + $_.ErrorDetails.Message)
  }
}
Write-Output "IMPORT_DONE"
$results | ConvertTo-Json
