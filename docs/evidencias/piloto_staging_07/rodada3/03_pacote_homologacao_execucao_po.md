# Pacote de homologacao — Piloto Staging 07 (execucao 2026-05-19)

**Papeis:** PO Senior · Analista de requisitos · QA Lead · Arquiteto · Analista funcional · Rastreabilidade · Miro (estrutura)

**Ambiente publicado (Web):** `http://localhost:5173` (Vite build de producao em dev — proxy para API `:3000`)  
**API:** Docker `barbearia-api` healthy em `:3000`

---

## 1. Sumario executivo

| Camada | Resultado | Evidencia |
|--------|-----------|-----------|
| API Rodada 3 (26 casos) | **OK** | `rodada3/08_resultados_aceite.json` |
| F08 GAP-01 (RBAC) | **OK** — HTTP 403 | `revalidate-f08-gap01.ps1` |
| P1 regressao negativa | **1 cenario** a rever (CT-101) | `docs/QA_API_NEGATIVE_BATTERY_RESULTS.csv` |
| Web navegacao (amostra P07) | **Parcial** | `prints/P07_*.png` |
| Dashboard gestao | **FAIL** — HTTP 500 na UI | print `P07_04_dashboard_gestao.png` |
| Portal token valido | **PEND** — tela vazia no browser (validar API F03-F05 OK) | `rodada3/_portal_token.txt` |

**Recomendacao PO:** aceitar **API + RBAC** para merge condicionado; abrir debito **GESTAO-500** e completar prints restantes (veiculos, patio, n8n).

---

## 2. Rastreabilidade (amostra)

| ID BDD | Requisito / criterio | API (Rodada 3) | Web |
|--------|----------------------|----------------|-----|
| F08 | Professional nao cria appointment | OK (403) | C05 OK (rodada 1) |
| F01-F07 | Agenda core | OK | P07_02 agenda |
| F03-F05 | Portal tokenizado | OK | PEND portal UI |
| C07-C18 | Lava-rapido API | OK | PEND prints 05-08 |
| C25-C28 | Outbox / auditoria | API coberta | P07_09, P07_10 |
| C19 | Dashboard gestao | — | **500** |

---

## 3. Comandos executados

```powershell
. .\scripts\devops-env.ps1 -InstallNodeIfMissing
docker compose up -d postgres redis api
cd apps\web; npm run dev   # :5173

.\scripts\revalidate-f08-gap01.ps1
.\scripts\qa-piloto-staging-07-rodada3.ps1
.\scripts\qa-piloto-staging-07-browser-evidence.ps1
.\scripts\qa-api-negative-battery.ps1
```

---

## 4. Estrutura sugerida Miro (board)

Colunas: **Backlog PO** → **Em execucao** → **Evidencia QA** → **Aceite PO** → **Producao**

Swimlanes: API · Web · Integracoes (n8n/Evolution) · Debitos

Cards abertos:

- **GESTAO-500** — GET dashboard gestao retorna 500 na UI (:5173)
- **PORTAL-UI** — validar render portal publico no browser (API OK)
- **PRINTS-P07** — completar P07_05 a P07_08, P07_11-13, P07_16-17

---

## 5. Artefatos

- `rodada3/08_resultados_aceite.json`
- `rodada3/01_relatorio_qa_regressivo.md`
- `rodada3/02_browser_manifest.json`
- `prints/P07_02_agenda_barbearia.png`, `P07_04`, `P07_09`, `P07_10`, `P07_15`, etc.
- `apps/web/.dockerignore` (otimiza build Docker web)

---

*Gerado apos execucao automatizada + navegacao browser MCP.*
