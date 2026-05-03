# Relatório complementar — homologação final (DEV oficial)

**Objetivo:** fechar homologação do escopo `010_service_buffers.sql` e regras associadas após execução no **DEV oficial**, conforme decisão do PO.

**Instruções:** preencher cada secção no DEV oficial. **Não** colar senhas reais, URLs completas com credenciais nem outputs de `pg_dump` com segredos.

### Preparação (checklist antes de tocar no DEV oficial)

- [ ] Confirmar que o clone contém `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf` (ou MD validado) e `docs/README.md`.
- [ ] `.\scripts\verify-v4-baseline.ps1` (opcionalmente `-Strict` em CI).
- [ ] Confirmar `DATABASE_URL` / host / nome da base **do ambiente DEV** (valores reais só em `.env` local, nunca em relatório).
- [ ] Confirmar roles: aplicação `barbearia_app`, migrações conforme política interna.
- [ ] **Backup** (`pg_dump` ou equivalente) com nome de ficheiro e timestamp registados.
- [ ] Aplicar migrations em ordem até `database/migrations/010_service_buffers.sql`; guardar log com `COMMIT` final e sem `ERROR` / `ROLLBACK` / transação abortada.
- [ ] Executar testes de integração acordados (catálogo, disponibilidade, agendamento, buffers, erros funcionais).

---

## 1. Evidência do V4 no workspace

| Verificação | Sim / Não | Notas |
|-------------|-----------|--------|
| PDF presente em `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf` (caminho oficial PO) | | |
| Alternativa: MD validado pelo PO em `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md` | | |
| `docs/README.md` presente (índice baseline) | | |
| Commit / tag / link interno ao artefato | | |

---

## 2. Ambiente DEV oficial

| Campo | Valor (mascarado onde aplicável) |
|--------|-----------------------------------|
| Nome lógico do ambiente | DEV oficial |
| Host (sem credenciais) | |
| Porta | |
| Nome da base de dados | |
| `DATABASE_URL` mascarada | `postgresql://barbearia_app:***@HOST:PORT/DBNAME` |
| Role da aplicação | `barbearia_app` |
| Role usada para migrations | |
| `rolcanlogin` / privilégios verificados | |

---

## 3. Backup

| Campo | Valor |
|--------|--------|
| Realizado | sim / não |
| Comando resumido (ex.: `pg_dump …`) | |
| Caminho ou nome do ficheiro de backup | |
| Data/hora (timezone) | |
| Tamanho aproximado / checksum (opcional) | |

---

## 4. Migrations até `010_service_buffers.sql`

| Migration | Aplicada | Observações |
|-----------|----------|-------------|
| `001` … `009` | | |
| `010_service_buffers.sql` | | |

**Evidência de execução da 010:**

- Início da transação: `BEGIN`
- Fim: `COMMIT` (obrigatório)
- Ausência de: `ERROR`, `ROLLBACK`, `current transaction is aborted`

(Colar excerto sanitizado do log ou da consola.)

---

## 5. Estrutura final — `services` (buffers)

Executar no DEV (exemplo):

```sql
\d+ public.services
-- ou
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'services'
  AND column_name LIKE 'buffer%';
```

| Coluna | Tipo | NOT NULL | Default | CHECK |
|--------|------|----------|---------|-------|
| `buffer_before_minutes` | | | | |
| `buffer_after_minutes` | | | | |

---

## 6. Testes de integração

Comando utilizado (exemplo):

```bash
cd apps/api
npx vitest run --include "**/*.integration.test.ts"
# ou o alvo definido pelo time QA
```

| Suite / ficheiro | Passou | Falhou | Notas |
|------------------|--------|--------|-------|
| Serviços / catálogo | | | |
| Disponibilidade | | | |
| Agendamento | | | |
| Vínculo profissional/serviço | | | |
| Buffers | | | |
| `SERVICE_NOT_BOOKABLE` | | | |
| `SERVICE_PRICE_MISMATCH` | | | |

**Resumo:** ___ passou / ___ falhou

---

## 7. Pendências remanescentes

| ID | Descrição | Owner |
|----|------------|-------|
| | `outbox.service.test.ts` (card separado) | |
| | Análise GIST/buffer (card separado, sem implementação) | |
| | Outras | |

---

## 8. Recomendação técnica para aceite final do PO

(Texto livre: riscos aceitáveis, condições, follow-up obrigatório antes de produção.)

---

**Assinatura técnica:** __________________  
**Data:** __________________  
**Aceite PO (final):** ☐ Sim ☐ Não — data: __________
