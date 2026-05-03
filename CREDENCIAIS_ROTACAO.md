# Checklist de Rotação de Credenciais — Barbearia SaaS V4

**Data da detecção:** 2026-05-02  
**Origem:** varredura P0-01 do Prompt Pack — inspeção do pacote `barbearia_saas_pacote_fabrica_v3.zip`  
**Executado por:** engenheiro responsável pela fábrica  

> **Aviso:** A IA não gera nem armazena segredos reais. Os valores abaixo foram encontrados no código-fonte e reportados para ação humana obrigatória. Nenhum valor real é listado aqui — apenas a localização e o risco.

---

## Regra geral

- Toda credencial que apareceu em arquivo versionável (mesmo em zip) deve ser considerada **comprometida** e rotacionada imediatamente.
- Após rotacionar, atualize **apenas o `.env` local** (nunca o `.env.example`).
- Registre a data de rotação na coluna **Concluído em**.

---

## Credenciais encontradas e ação necessária

### 1. JWT_SECRET — CRÍTICO

| Campo | Detalhe |
|---|---|
| **Variável** | `JWT_SECRET` |
| **Encontrada em** | `.env` (raiz) e `.env.example` (raiz) |
| **Risco** | Valor pessoal identificável (`DEUS-FELICIDADE-CAROL-MIGUEL-LUIZA-2026-...`) versionado no pacote zip. Qualquer pessoa com acesso ao zip pode assinar tokens JWT válidos para qualquer tenant. |
| **Ação** | Gerar novo valor aleatório com mínimo 64 caracteres. |
| **Comando** | `openssl rand -base64 64` |
| **Quem rotaciona** | Responsável técnico / DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 2. N8N_API_KEY — CRÍTICO

| Campo | Detalhe |
|---|---|
| **Variável** | `N8N_API_KEY` (usada como `$N8N_KEY` no script) |
| **Encontrada em** | `n8n/create_credentials.ps1` (linha 1) |
| **Risco** | Chave de API do n8n hardcoded no script (`n8n_api_bb4...`). Qualquer pessoa com o arquivo pode criar/deletar credenciais e workflows no n8n. |
| **Ação** | Revogar a chave no painel do n8n (`Settings → API Keys → Revoke`). Gerar nova chave. Definir via variável de ambiente `$env:N8N_API_KEY`. |
| **Quem rotaciona** | Responsável técnico / DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 3. POSTGRES_PASSWORD / DATABASE_URL — ALTO

| Campo | Detalhe |
|---|---|
| **Variáveis** | `POSTGRES_PASSWORD`, `DATABASE_URL` |
| **Encontradas em** | `.env` (raiz) |
| **Risco** | Credenciais de banco de dados (dev) presentes no pacote. Se o mesmo usuário/senha for usado em staging ou produção, a exposição é crítica. |
| **Ação** | Verificar se estas credenciais são usadas em qualquer ambiente além do local. Se sim, rotacionar imediatamente via `ALTER USER ... PASSWORD '...'` no PostgreSQL. |
| **Comando** | `openssl rand -base64 32` para nova senha |
| **Quem rotaciona** | DBA / DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 4. REDIS_PASSWORD — MÉDIO

| Campo | Detalhe |
|---|---|
| **Variável** | `REDIS_PASSWORD` |
| **Encontrada em** | `.env` (raiz) |
| **Risco** | Senha do Redis exposta no pacote. Se o Redis estiver acessível externamente, qualquer um com a senha pode ler/escrever dados de sessão e cache. |
| **Ação** | Gerar nova senha. Reiniciar Redis com nova configuração. Atualizar `.env` local. |
| **Comando** | `openssl rand -base64 32` |
| **Quem rotaciona** | DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 5. N8N_ENCRYPTION_KEY — MÉDIO

| Campo | Detalhe |
|---|---|
| **Variável** | `N8N_ENCRYPTION_KEY` |
| **Encontrada em** | `.env` (raiz), `.env.example` |
| **Risco** | Valor placeholder (`change_me_32_chars_minimum`) presente. Se este valor foi realmente usado em um n8n ativo, as credenciais armazenadas no n8n estão protegidas por uma chave trivial. |
| **Ação** | Verificar se n8n foi inicializado com este valor. Se sim, recriar o volume do n8n e reimportar credenciais com nova chave aleatória. |
| **Comando** | `openssl rand -hex 16` |
| **Quem rotaciona** | DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 6. N8N_BASIC_AUTH_PASSWORD / senha demo — MÉDIO

| Campo | Detalhe |
|---|---|
| **Variáveis** | `N8N_BASIC_AUTH_PASSWORD`, `password` demo |
| **Encontradas em** | `.env`, `n8n/create_credentials.ps1` |
| **Risco** | Senha do painel n8n (`admin_dev_password`) e senha demo (`admin12345`) presentes no pacote. Ambas devem ser consideradas comprometidas se usadas em qualquer ambiente além do local. |
| **Ação** | Alterar senha no painel n8n. Atualizar `.env` local. |
| **Quem rotaciona** | Responsável técnico |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 7. N8N_ENCRYPTION_KEY real em `create_pg_cred.mjs` — CRÍTICO

| Campo | Detalhe |
|---|---|
| **Variável** | Chave de criptografia do n8n (`ujmNQcFsmvXk8l3apBBIFNUITlPeX3Kj`) |
| **Encontrada em** | `n8n/create_pg_cred.mjs` (linha 5) |
| **Risco** | Chave real de criptografia do n8n hardcoded. Permite descriptografar todas as credenciais armazenadas no n8n. Risco máximo. |
| **Ação** | Rotacionar o N8N_ENCRYPTION_KEY, recriar volume do n8n, reimportar credenciais com nova chave. |
| **Quem rotaciona** | DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 8. Senha do banco `evolution_db` em `create_pg_cred.mjs` — CRÍTICO

| Campo | Detalhe |
|---|---|
| **Variável** | `DB_PASS` / senha do usuário `evolution` |
| **Encontrada em** | `n8n/create_pg_cred.mjs` (linhas 10 e 42) |
| **Risco** | Senha `31012009` do usuário `evolution` do banco `evolution_db` hardcoded no código-fonte. |
| **Ação** | Verificar se este banco está em uso. Se sim, rotacionar via `ALTER USER evolution PASSWORD '...'`. |
| **Comando** | `openssl rand -base64 32` |
| **Quem rotaciona** | DBA / DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

### 9. IDs de credenciais n8n em `import_workflows.ps1` — MÉDIO

| Campo | Detalhe |
|---|---|
| **Variáveis** | `HTTP_CRED_ID = "KtxmGyZGai3loGEG"`, `PG_CRED_ID = "OfYLQygBGkK1qMjw"` |
| **Encontradas em** | `n8n/import_workflows.ps1` (linhas 2-3) |
| **Risco** | IDs internos de credenciais n8n. Podem ser usados para tentativas de acesso a credenciais em instâncias expostas. |
| **Ação** | Revogar e recriar as credenciais no n8n. Passar os novos IDs via `$env:N8N_HTTP_CRED_ID` e `$env:N8N_PG_CRED_ID`. |
| **Quem rotaciona** | DevOps |
| **Status** | [ ] Pendente |
| **Concluído em** | ___________________ |

---

## Itens que NÃO requerem rotação

| Item | Motivo |
|---|---|
| `database/seeds/001_demo.sql` — `password_hash` bcrypt | Hash bcrypt do usuário demo. Não é a senha em texto plano; é seguro versionar em seeds de desenvolvimento. A senha `admin12345` documentada no README é de uso exclusivo demo/dev. |
| `database/seeds/001_demo.sql` — `webhook_token = 'demo_webhook_token_change_me'` | Valor de placeholder explícito; não é credencial real. |
| `.github/workflows/ci.yml` — credenciais de teste | Credenciais de banco e JWT são de uso exclusivo do ambiente de CI efêmero. Não representam risco de produção. |
| `.env.staging.example` | Arquivo de exemplo com placeholders `<...>`. Não contém valores reais. |

---

## Verificação pós-rotação

Execute após rotacionar cada credencial:

```bash
# Verificar se nenhum segredo real permanece nos arquivos versionáveis
grep -r "DEUS-FELICIDADE\|n8n_api_bb4\|barbearia_test_pw\|admin12345" \
  --include="*.ts" --include="*.js" --include="*.env*" \
  --include="*.yml" --include="*.yaml" --include="*.ps1" \
  --include="*.sh" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  .

# Resultado esperado: nenhuma saída (zero matches)
```

---

## Histórico de alterações

| Data | Ação | Responsável |
|---|---|---|
| 2026-05-02 | Detecção inicial — P0-01 Prompt Pack | IA + Engenheiro |
| ___________ | Rotação concluída | ___________________ |
