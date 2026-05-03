# Homologação etapa 011 — `users.professional_id` e agenda do profissional (DEV oficial)

**Objetivo:** fechar a etapa **aprovada com ressalvas** com evidências no **DEV oficial** (não substitui a baseline V4 em `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf`).

Preencher no ambiente real. **Não** colar senhas, tokens nem `DATABASE_URL` completa com credenciais.

**Ordem obrigatória (PO):** executar e registrar neste documento os itens **1–10** abaixo, nesta sequência. Somente após conclusão com evidências a etapa 011 pode ser considerada **homologada no DEV oficial**; até lá permanece em ressalvas.

| # | Etapa | Secção deste ficheiro |
|---|--------|------------------------|
| — | Identificar ambiente (contexto) | §1 |
| 1 | Backup do banco DEV oficial | §2 |
| 2 | Aplicar `011_user_professional_link.sql` | §3 |
| 3 | Validar `COMMIT` | §3 |
| 4 | Validar ausência de `ERROR`, `ROLLBACK`, `current transaction is aborted` | §3 |
| 5 | Seed `002_demo_professional_users.sql` só DEV/demo, se PO aprovar | §4 |
| 6 | Validar utilizadores profissionais ↔ `professional_id` | §4 |
| 7 | Smoke test casos 1–5 | §5 |
| 8 | Typecheck API e Web | §6 |
| 9 | Testes com `DATABASE_URL` real do DEV | §6 |
| 10 | Conclusão + **commit** deste ficheiro preenchido no repositório | §7 |

**Após homologação 011:** autorizado o bloco **012 — Operação real da agenda**; proposta técnica de entrada em `docs/PROPOSTA_TECNICA_012_OPERACAO_AGENDA.md`.

---

## 1. Ambiente

| Campo | Valor (mascarado) |
|--------|-------------------|
| Nome lógico | DEV oficial |
| Host / porta | |
| Base de dados | |
| `DATABASE_URL` | `postgresql://user:***@host:port/db` |
| Role aplicação | ex. `barbearia_app` |
| Role / utilizador para migrations | |

---

## 2. Backup (obrigatório antes da 011)

| Campo | Valor |
|--------|--------|
| Comando (resumo) | ex. `pg_dump -Fc …` |
| Ficheiro gerado | caminho + nome |
| Data/hora (TZ) | |
| Tamanho / verificação | ex. ficheiro existe, `pg_restore -l` opcional |

---

## 3. Migration `011_user_professional_link.sql`

| Verificação | Sim / Não | Evidência (trecho de log) |
|-------------|-----------|----------------------------|
| Aplicada com sucesso | | `BEGIN` … `COMMIT` |
| Sem `ERROR` / `ROLLBACK` / transação abortada | | |
| Coluna `users.professional_id` presente | | `\d users` ou `information_schema` |
| FK para `professionals(id)` | | |
| Índice `idx_users_tenant_professional` (ou equivalente) | | |

---

## 4. Seed `002_demo_professional_users.sql` (opcional)

Aplicar **só** se o PO aprovar e-mails demo como massa de teste no DEV.

| Verificação | Sim / Não | Notas |
|-------------|-----------|--------|
| Seed executado | | |
| E-mails aceites pelo PO | | `fred/joao/robson@demo.local` |
| Vínculos `users.professional_id` → `professionals.slug` | | Fred→fred, etc. |

**Alternativa:** `UPDATE` manual documentado (sem apagar linhas) com o mesmo critério `tenant_id` + correspondência profissional.

---

## 5. Smoke test — casos 1 a 5

Registo por caso: **ferramenta** (curl / Postman / painel), **utilizador/role**, **resultado esperado**, **resultado obtido** (HTTP + corpo resumido).

| # | Caso | Passou |
|---|------|--------|
| 1 | `professional` com vínculo: `GET /api/v1/appointments` retorna **só** agendamentos do `users.professional_id` | ☐ |
| 2 | Mesmo user com `?professional_id=<outro UUID>`: resposta **ainda só** do vínculo (sem dados do outro) | ☐ |
| 3 | `professional` **sem** `professional_id`: `403` e código `PROFESSIONAL_NOT_LINKED` (ou equivalente) | ☐ |
| 4 | `tenant_admin` / `manager` (ou perfil autorizado): agenda **ampla** ou filtro por profissional conforme política | ☐ |
| 5 | Isolamento **tenant**: user tenant A **não** vê dados de tenant B (RLS + `X-Tenant-Id` + JWT) | ☐ |

**Evidência adicional (opcional):** print do painel (agenda barbeiro vs gerente), com dados mascarados.

---

## 6. Comandos de validação técnica

Executar a partir da raiz do monorepo `barbearia-saas/` (ajustar caminhos).

**Variáveis:** garantir `DATABASE_URL` apontando ao **DEV oficial** nos testes de integração (ficheiro `.env` local não versionado ou CI secreto).

Linux / macOS:

```bash
cd apps/api
set -a && source ../../.env 2>/dev/null; set +a
npm run typecheck
npx vitest run

cd ../web
npm run typecheck
npx vitest run
```

Windows (PowerShell), exemplo (`.env` na raiz `barbearia-saas/`):

```powershell
cd apps/api
if (Test-Path ..\..\.env) { Get-Content ..\..\.env | ForEach-Object { if ($_ -match '^([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim().Trim('"') } } }
npm run typecheck
npx vitest run

cd ..\web
npm run typecheck
npx vitest run
```

*(Alternativa: definir `$env:DATABASE_URL = 'postgresql://…'` só na sessão atual, sem gravar segredos no repositório.)*

| Job | Passou | Notas |
|-----|--------|--------|
| typecheck API | | |
| typecheck Web | | |
| testes unitários (incl. `appointments-list-professional.test.ts`) | | |
| testes integração (com `DATABASE_URL` real) | | |

---

## 7. Conclusão para o PO

| Campo | Valor |
|--------|--------|
| **Status proposto** | ☐ Homologado no DEV oficial ☐ Ainda com ressalvas (descrever) |
| **Data** | |
| **Responsável técnico** | |

**Ressalvas remanescentes (se houver):**


---

## 8. Fora de escopo (confirmar)

- [ ] Não foi iniciado: Pix, recall, financeiro, comissão, n8n, outbox-worker, tela de conversas, relatórios avançados, tela `platform_admin`, novas funcionalidades fora do card 011.
