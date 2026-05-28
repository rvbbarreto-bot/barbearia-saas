# Rodada 3 — PS-07.3 QA regressivo (autorizado)

**Status:** Autorizado PO/Tech Lead — **2026-05-19**  
**Pré-requisito:** PS-07.2 (GAP-01) mergeado ou presente na branch de trabalho.

---

## Objetivo

Fechar aceite funcional **completo** do piloto staging 07 e preparar merge condicionado do PR #12.

---

## Checklist de execução

### A. Baseline ambiente

```powershell
Set-Location <raiz barbearia-saas>
docker compose build api
docker compose up -d --force-recreate api
npm run db:migrate
curl http://localhost:3000/health/ready
```

### B. Revalidar rodada 2 (barbearia core)

1. Reexecutar cenários F01–F11, B01–B02, P01–P02 (ver `rodada2/08_aceite_funcional_rodada2_po.md`).
2. **F08 obrigatório:** login `fred.barbeiro@demo.local` → `POST /api/v1/appointments` → **403**.
3. Actualizar `rodada2/08_resultados_aceite.json` com `actual: HTTP 403` após corrida real.

### C. Regressivo ampliado

Roteiro: `05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md`

- Cenários **7–18** (lava-rápido)
- Outbox retry RBAC (se no roteiro)
- n8n smoke (se ambiente Evolution/n8n configurado)

### D. CI local

```powershell
cd apps\api
npm run typecheck
npm run test:unit
npm test   # integração — requer Docker postgres/redis
cd ..\web
npm run typecheck
npm run lint
npm test
npm run build
```

### E. Entregáveis

- `rodada3/08_resultados_aceite.json`
- `rodada3/prints/` (se aplicável)
- `rodada3/01_relatorio_qa_regressivo.md` (resumo PASS/FAIL)

---

## Critério de fecho PO

- F08 **PASS** em Docker
- Zero FAIL críticos na matriz barbearia
- CI verde ou justificativa documentada
- Decisão merge PR #12 registada na pauta §10
