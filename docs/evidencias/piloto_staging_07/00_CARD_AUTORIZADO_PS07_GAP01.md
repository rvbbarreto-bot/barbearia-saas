# Card autorizado — PS-07.2 · Fecho GAP-01 (RBAC professional × balcão)

**Data:** 2026-05-19  
**PO:** Autorizado (retomada desenvolvimento)  
**Tech Lead:** Autorizado  
**Release track:** `piloto_staging_07` → candidata `piloto-staging-01`  
**Prioridade:** P0 (bloqueador aceite funcional rodada 2)

---

## 1. Decisão PO

| Item | Decisão |
|------|---------|
| Linha activa | **Piloto staging 07** (não abrir features V4 fora de card) |
| GAP-01 | **Corrigir antes** de Rodada 3 (lava-rápido / n8n) |
| Escopo deste card | Apenas RBAC API + testes + evidência F08 |
| Merge `main` | **Não** — integrar em branch piloto após CI verde |
| Próximo card (após este) | **PS-07.3** — QA regressivo barbearia + car_wash (ver §4) |

---

## 2. Problema (GAP-01)

O papel `professional` (nível RBAC 30) herdava permissões de `attendant` (20) por comparação numérica, permitindo `POST /api/v1/appointments` e outras mutações de balcão via API, enquanto a UI já bloqueava.

**Critério de aceite F08:** `POST /api/v1/appointments` com JWT `role=professional` → **403** `FORBIDDEN`, sem chamar o serviço de criação.

---

## 3. Implementação autorizada

- `apps/api/src/middlewares/rbac.ts` — conjunto `APPOINTMENTS_BALCAO_ACTIONS` nega `professional` em: create, confirm, cancel, reschedule, checkIn, start, noShow, walkIn.
- Mantém **read** (viewer+) e **complete** (professional+).
- Testes: `rbac.test.ts`, `authorization-routes.integration.test.ts` (F08 + cancel negado).

---

## 4. Próxima demanda autorizada (PS-07.3)

**Título:** QA regressivo barbearia + lava-rápido (Rodada 3)

**Entrada:** GAP-01 fechado + CI local verde (`typecheck`, `test:unit`, testes auth).

**Escopo:**

1. Reexecutar matriz F01–F11 + B01–B02 + P01–P02 (`rodada2` scripts / checklist).
2. Executar cenários 7–18 do `05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md` (vertical car_wash).
3. Atualizar `08_resultados_aceite.json` e prints em `rodada3/`.
4. Cobertura vitest nos módulos PS-06 alterados (meta ≥82% no escopo tocado).

**Fora de escopo:** Pix, recall produção, novas telas, n8n novos workflows sem card separado.

---

## 5. DoD deste card (PS-07.2)

- [x] Código RBAC
- [x] Testes unitários/integração leves (auth routes)
- [ ] `npm run test:unit` API verde (executar na máquina fábrica)
- [ ] Revalidar F08 em ambiente Docker (aceite rodada 2 actualizado)
- [ ] PR para `piloto-staging-01` com referência a este card

---

## 6. Comandos de verificação (fábrica)

```powershell
Set-Location barbearia-saas\apps\api
npm run test:unit -- --run src/middlewares/rbac.test.ts src/modules/auth/authorization-routes.integration.test.ts
npm run typecheck
```

Revalidação F08 (com stack Docker):

```powershell
# Login professional → POST /appointments → esperar 403
# Ver scripts em docs/evidencias/piloto_staging_07/rodada2/
```

---

*Documento gerado na retomada PO/Tech Lead — Agent mode.*
