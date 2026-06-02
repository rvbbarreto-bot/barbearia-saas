# Card autorizado — PS-08.4 · Evolution API local (`:8081`)

**Data:** 2026-05-27  
**PO:** Autorizar após merge PR #15 (hardening)  
**Tech Lead:** Time sênior full stack  
**Prioridade:** P2 (Sprint 2 PS-08)  
**Referência:** `docs/evidencias/piloto_staging_07/12_demandas_po_proxima_release_fabrica.md` § PS-08.4

---

## 1. Decisão PO

| Item | Decisão |
|------|---------|
| Problema | Cenários **C35–C36** e P07_17 **BLOCKED** — Evolution `:8081` ausente no stack local |
| Objetivo | QA homologar smoke WhatsApp sem instalar Evolution manualmente fora do Compose |
| Merge `main` | **Não** — integrar em `piloto-staging-01` após CI verde |
| Fora deste card | PS-08.5 (import n8n), PS-08.9 (CI browser), produção Evolution |

---

## 2. Estado atual (baseline técnica)

| Artefato | Situação |
|----------|----------|
| `docker-compose.yml` | API e n8n esperam `EVOLUTION_API_URL` (default `host.docker.internal:8081`) — **não** sobe container Evolution |
| `docker-compose.evolution-local.yml` | Override de env para API/n8n apontarem ao host — **pré-requisito:** Evolution já a correr no host |
| `.env.example` | `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `QA_WHATSAPP_NUMBER` documentados |
| `docs/PILOTO_STAGING_01_N8N.md` | Runbook recreate n8n + validação env |
| Workflow smoke | `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` |
| Evidência E2E | `docs/evidencias/piloto_staging_01/28_evolution_e2e.md` |

**Gap:** não existe serviço Docker versionado que exponha Evolution em `localhost:8081` para Windows/macOS (Docker Desktop).

---

## 3. Escopo autorizado (implementação)

### 3.1 Compose — profile `evolution` (recomendado)

Adicionar serviço opcional (não sobe no `docker compose up` default):

```yaml
# docker-compose.yml (proposta — validar imagem/tag com operador)
services:
  evolution:
    profiles: ["evolution"]
    image: atendai/evolution-api:v2.2.3   # pin explícito — ver docs/N8N_VERSION_PIN.md
    container_name: barbearia-evolution
    ports:
      - "8081:8080"
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY:?EVOLUTION_API_KEY required for profile evolution}
      # Variáveis mínimas v2 — completar conforme doc oficial Evolution v2
    volumes:
      - evolution_data:/evolution/instances
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/ || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 8
      start_period: 60s
```

**Rede:** quando profile activo, API/n8n devem usar `http://evolution:8080` (nome de serviço) em vez de `host.docker.internal`.

Novo ficheiro opcional: `docker-compose.evolution-stack.yml` com overrides:

```yaml
services:
  api:
    environment:
      EVOLUTION_API_URL: http://evolution:8080
  n8n:
    environment:
      EVOLUTION_API_URL: http://evolution:8080
```

### 3.2 Scripts operacionais

| Script | Função |
|--------|--------|
| `scripts/qa-evolution-up.ps1` | `docker compose --profile evolution up -d evolution` + wait health + curl raiz |
| `scripts/qa-evolution-smoke.ps1` | Ping `GET /` + instruções criar instância (QR) — **sem** imprimir API key |

### 3.3 Documentação

- Actualizar `docs/PILOTO_STAGING_01_N8N.md` — secção “Evolution no Compose (profile)”
- Actualizar `docs/QA_AMBIENTE_LOCAL.md` (se existir) — portas `8081` / `5679`
- `docs/evidencias/piloto_staging_08/prints/PS08_04_evolution_health.png` — evidência QA

### 3.4 Variáveis (`.env.example`)

Manter placeholders; documentar:

| Modo | `EVOLUTION_API_URL` (host) | `EVOLUTION_API_URL` (container api/n8n) |
|------|----------------------------|----------------------------------------|
| Evolution no host | `http://host.docker.internal:8081` | idem (compose actual) |
| Profile `evolution` | `http://localhost:8081` | `http://evolution:8080` |

---

## 4. Fora de escopo

- Evolution em produção / multi-instância tenant
- Credenciais WhatsApp reais em Git ou prints
- Automatizar QR code pairing no CI
- Substituir outbox worker por envio directo (manter arquitectura actual)

---

## 5. DoD (aceite PO / QA)

- [ ] `docker compose --profile evolution up -d` sobe Evolution healthy em `:8081`
- [ ] `curl -sS -o /dev/null -w "%{http_code}" http://localhost:8081/` → `200` (ou código documentado)
- [ ] `docker compose exec n8n` — `EVOLUTION_API_URL` resolve e `EVOLUTION_API_KEY=SET`
- [ ] Workflow **03_QA** executado manualmente no n8n — 2xx ou erro classificado (401/404) **sem** expor key
- [ ] C35–C36 no doc 10 passam de **BLOCKED** para **OK** ou **PEND** com motivo documentado
- [ ] Print evidência em `piloto_staging_08/prints/`

---

## 6. Testes (time sênior)

```powershell
# Stack completo piloto + Evolution
docker compose --profile evolution -f docker-compose.yml -f docker-compose.evolution-stack.yml up -d
.\scripts\qa-evolution-up.ps1

# Recriar n8n com URL interna
docker compose -f docker-compose.yml -f docker-compose.evolution-stack.yml up -d --force-recreate n8n api

# Validar env
docker compose exec n8n sh -lc 'echo EVOLUTION_API_URL=$EVOLUTION_API_URL; [ -n "$EVOLUTION_API_KEY" ] && echo KEY=SET'

# Smoke manual n8n UI :5679 — workflow 03
```

Regressão API inalterada: `.\scripts\qa-piloto-staging-07-rodada3.ps1` (CI usa mock `http://evolution.test`).

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Imagem Evolution muda breaking | Pin de tag + doc upgrade |
| QR pairing manual | Documentar; não bloquear merge — C35 pode ficar PEND até instância `open` |
| Volume pesado / licença | Profile opcional; não activar em CI |
| Windows firewall porta 8081 | Documentar em `docs/QA_AMBIENTE_LOCAL.md` |

---

## 8. Estimativa (Tech Lead)

| Tarefa | Esforço |
|--------|---------|
| Compose profile + healthcheck | 0,5–1 d |
| Override rede api/n8n | 0,25 d |
| Scripts PS1 + doc | 0,5 d |
| QA smoke + print | 0,5 d |
| **Total** | **~1,5–2 d** |

---

## 9. Branch sugerida

`feature/ps08-4-evolution-compose` → PR base `piloto-staging-01` (após merge #15).

---

## 10. Rastreabilidade

| Artefato | Uso |
|----------|-----|
| `02_kickoff_ps08_sprint2_p2.md` | Ordem sprint (PS-08.4 primeiro no P2) |
| `00_CARD_AUTORIZADO_PS08_4_EVOLUTION.md` | **Este card** |
| `rodada3/11_relatorio_qa_senior_doc10_browser.md` | Baseline C35 BLOCKED |

**PO:** Autorizar desenvolvimento após CI verde PR #15.  
**QA:** Executar C35–C36 com instância Evolution `connectionStatus=open`.
