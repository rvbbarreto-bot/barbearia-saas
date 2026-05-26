# QA Júnior — Cenários pendentes (passo a passo)

**PO:** Piloto Staging 07 · PS-07.4  
**Web:** `http://localhost:3001` (preferencial) ou `http://localhost:5173`  
**Evidências:** `docs/evidencias/piloto_staging_07/prints/`  
**Matriz:** atualizar `rodada3/07_resultados_browser.json`

---

## A. Testes já executados (registo PO)

Informados pelo QA no anexo “Documento sem título”. **Ação PO:** validar prints e marcar OK na matriz.

| Cenário | Print esperado | Onde guardar |
|---------|----------------|--------------|
| **19** Dashboard gerencial | `P07_04_dashboard_gestao.png` (novo, sem erro 500) | `prints/` |
| **20** Export CSV | CSV baixado + nota no relatório | relatório |
| **2** Bloqueio atendente | `P07_18_forbidden.png` | `prints/` |
| **21** Cliente 360 | `P07_03_cliente_360.png` | `prints/` |

> **Nota:** Se os ficheiros estão em outro projeto (`cobranca-saas-api/docs/evidencias`), **copiar** para a pasta `prints/` deste repositório antes do aceite PO.

### Checklist rápido de aceite PO (19, 20, 2, 21)

- [ ] C19: título **Dashboard gerencial**, KPIs visíveis, **sem** “Erro ao carregar dashboard”
- [ ] C20: ficheiro CSV com linhas `gross_revenue_cents` e `outbox_status`
- [ ] C2: login **atendente**; `/gestao/dashboard` → forbidden ou 403 na API
- [ ] C21: página **Cliente 360** com secções Cadastro, Agendamentos, Veículos (se car_wash)

---

## B. Mapa do menu lateral (referência)

Ordem típica após login (**admin**):

| Ícone / rótulo | Rota |
|----------------|------|
| Dashboard | `/dashboard` |
| Agenda | `/agenda` |
| Conversas | `/conversas` |
| Clientes | `/clientes` |
| Serviços | `/servicos` |
| Profissionais **ou** Boxes/equipes | `/profissionais` |
| Lista de espera | `/lista-espera` |
| **Gestão** | `/gestao/dashboard` |
| Financeiro | `/operacao/financeiro` |
| Mensagens | `/operacao/mensagens` |
| Auditoria operacional | `/operacao/auditoria` |
| Comissões | `/operacao/comissao` |
| Configurações | `/configuracoes` |
| *(só car_wash)* **Veículos** | `/veiculos` |
| *(só car_wash)* **Pátio** | `/operacao/lava-rapido` |

**Sair:** ícone de porta no **canto superior direito** (barra superior), não no menu lateral.

---

## C. Cenários pendentes — passo a passo

### Pré-requisito lava-rápido

Antes dos cenários 9–18, o tenant deve estar em `car_wash` (pedir ao QA pleno o SQL do roteiro §5 ou executar `.\scripts\qa-seed-car-wash-patio.ps1` — PS-08.2). No pátio/agenda lava-rápido usar data **`2026-06-16`**.

Para **C26** (retry outbox): `.\scripts\qa-seed-outbox-failed.ps1` (PS-08.3).

---

### Cenário 15 — Pátio: Chegou → Lavando

**Dado** login `admin@demo.local` / `admin12345`

1. Menu lateral → clique em **Pátio**
2. No campo de data (topo), digite ou selecione **`2026-06-16`**
3. Na coluna **Agendados**, localize um card (ex.: placa ABC1D73)
4. Se existir botão **Checklist**, preencha e **Salvar checklist** (ver C14) antes de continuar
5. No mesmo card → clique **Chegou**
6. **Então:** toast de sucesso; card passa para coluna **Chegaram**
7. No card em Chegaram → clique **Iniciar**
8. **Então:** card passa para coluna **Lavando**
9. Menu lateral → **Agenda** → data **2026-06-16** → clique no bloco do agendamento → confirme status coerente (check-in/em atendimento)

**Evidência:** print do pátio com job em **Lavando** (opcional: `P07_07b_patio_lavando.png`)

---

### Cenário 16 — Pátio: Conferência → Pronto

**Dado** job em **Lavando** (após C15)

1. Menu **Pátio** → data **2026-06-16**
2. No card em Lavando → clique **Conferência**
3. **Então:** coluna **Conferência**
4. Clique **Pronto**
5. **Então:** coluna **Prontos**
6. Menu **Mensagens** → verifique se há mensagem nova (opcional; N/A se cliente sem opt-in)

**Evidência:** print pátio em Prontos; pode reutilizar P07_09 se outbox tiver linha nova

---

### Cenário 17 — Entregar + Financeiro + Comissão

**Dado** job em **Prontos**

1. **Pátio** → card em Prontos → clique **Entregar**
2. **Então:** coluna **Entregues**; toast OK
3. Menu **Agenda** → **2026-06-16** → abra agendamento → status **Concluído**
4. Menu **Financeiro** (ver C22 abaixo) → filtre período com 16/06/2026
5. Menu **Comissões** (ver C23) → mesma data

**Evidência:** `P07_11_financeiro.png`, `P07_12_comissao.png`

---

### Cenário 18 — Transição inválida

**Opção UI (se não houver atalho):** pedir ao QA pleno executar C18 via API (Rodada 3 já validou).

**Opção exploratória júnior:** em **Pátio**, job ainda em **Agendados** sem passar por Chegou — confirmar que **não** existe botão **Pronto** direto.

**Evidência:** nota no relatório + resposta API 4xx se pleno anexar log

---

### Cenário 9 — Veículo sem placa

1. Menu **Veículos**
2. Botão **+ Novo Veículo** (canto superior direito)
3. No modal: dropdown **Cliente** → selecione um cliente
4. Deixe **Placa** vazia; preencha marca/modelo se quiser
5. Clique **Salvar** (ou equivalente no rodapé do modal)
6. **Então:** validação impede OU toast de erro; lista **não** ganha linha nova

---

### Cenário 10 — Placa duplicada

1. Menu **Veículos** → anote placa existente (ex. ABC1D73)
2. **+ Novo Veículo** → mesmo cliente ou outro → mesma placa
3. Salvar
4. **Então:** toast de erro de duplicidade; contagem na lista inalterada

---

### Cenário 12 — Agendamento sem veículo (car_wash)

1. Confirmar tenant `car_wash`
2. Menu **Agenda**
3. Botão **+ Novo agendamento** (topo da página)
4. Passo **Cliente** → selecione cliente → **Próximo** (seta)
5. Passo **Veículo** → **não** selecione veículo → tente avançar
6. **Então:** não avança OU erro ao finalizar; sem novo job no **Pátio** para hoje

---

### Cenário 4 — Data passada (barbearia)

**Pré:** tenant `barbershop` (pedir SQL ao pleno se necessário)

1. Menu **Agenda** → **+ Novo agendamento**
2. Percorra passos até **Horário**
3. Escolha data/hora **no passado**
4. Conclua wizard
5. **Então:** erro na UI; agendamento não aparece na agenda

---

### Cenário 5 — Conflito de slot (barbearia)

1. Crie ou use agendamento confirmado num horário (ex. 10:00, profissional João)
2. **+ Novo agendamento** → mesmo profissional, mesmo horário
3. **Então:** mensagem de conflito; segundo agendamento não criado

---

### Cenário 6 — Cancelar agendamento (barbearia)

1. Menu **Agenda** → clique num bloco de agendamento **confirmado**
2. Painel lateral **Detalhes do agendamento** abre à direita
3. Clique **Cancelar agendamento**
4. Confirme em **Confirmar cancelamento** (se pedir confirmação)
5. **Então:** status **Cancelado**; bloco some ou muda cor
6. Menu **Auditoria operacional** → procure evento de cancelamento

---

### Cenário 22 — Financeiro

1. Login **admin**
2. Menu lateral → **Financeiro**
3. **Então:** título da página com tabela (ou vazio sem erro 500)
4. Campos **De** / **Até** (topo) → inclua **2026-06-16** → aguarde recarregar
5. Opcional: dropdown **Profissional** / filtros se visíveis

**Evidência:** `P07_11_financeiro.png` (página inteira)

---

### Cenário 23 — Comissões

1. Menu **Comissões**
2. Ajuste **De** / **Até** para últimos 30 dias ou 16/06/2026
3. **Então:** tabela com colunas Concluído, Comissão, Estado (ou vazio)
4. **Teste RBAC:** ícone **Sair** (topo direito) → login **atendente** → tente **Comissões**
5. **Então:** menu pode ocultar **Comissões** (só manager+) OU página forbidden

**Evidência:** `P07_12_comissao.png` como admin

---

### Cenário 24 — Lista de espera

1. Menu **Lista de espera**
2. Botão **Nova entrada** (canto superior direito da área de filtros)
3. Modal **Nova entrada na fila:**
   - **Cliente** → selecione (ex. Cliente QA A)
   - **Serviço** → selecione (ex. Corte masculino)
   - **Profissional** → Qualquer ou João
   - **De** / **Até** → datas futuras (ex. 2026-06-20 a 2026-06-25)
   - **Turno preferido** → Manhã/Tarde/Qualquer
4. Botão **Criar** / **Salvar** no rodapé do modal
5. **Então:** linha na tabela com estado **active**
6. Repita **Nova entrada** com **mesmos** cliente + serviço + datas
7. **Então:** erro de duplicidade (toast)

**Evidência:** `P07_13_waitlist.png`

---

### Cenário 26 — Retry outbox (admin)

1. Menu **Mensagens**
2. Filtro **Status** → **Falhou** ou **Encerrada (dead)**
3. Se lista vazia → marcar **PEND MASSA** no relatório
4. Clique numa **linha** da tabela → abre painel/modal de detalhe
5. Botão **Reenviar** / **Retry** (`data-testid="outbox-retry-button"`)
6. Diálogo de confirmação → confirmar
7. **Então:** status volta para pendente/processando; toast OK
8. Menu **Auditoria operacional** → evento de retry

---

### Cenário 27 — Retry bloqueado (atendente)

1. **Sair** (ícone topo direito) → login **atendente@demo.local**
2. Menu **Mensagens** → abrir detalhe de mensagem failed (se existir)
3. **Então:** **sem** botão Retry OU 403 se forçar

**Evidência:** print sem botão ou print Network 403

---

### Cenário 30 — Portal (revalidar conteúdo)

1. Abra **aba anónima** (Ctrl+Shift+N)
2. URL: copiar de `rodada3/_portal_token.txt` → `http://localhost:3001/portal/<token>`
3. **Então:** card com nome do estabelecimento, serviço, data/hora, profissional
4. **Não** pode ficar página em branco

**Evidência:** atualizar `P07_14_portal_token_valido.png` se necessário

---

### Cenário 31 — Confirmar pelo portal

**Pré:** agendamento em `awaiting_confirmation` com token válido (pedir ao pleno gerar novo token se necessário)

1. Abrir portal (aba anónima)
2. Botão **Confirmar** (verde, rodapé do card)
3. **Então:** status atualizado; botões podem desaparecer ou mudar
4. Login admin → **Auditoria operacional** → filtrar por data → evento de confirmação

---

### Cenário 32 — Cancelar pelo portal

1. Portal com token válido e `can_cancel=true`
2. Botão **Cancelar** (outline)
3. **Então:** mensagem de sucesso ou estado cancelado
4. Admin → **Agenda** → agendamento cancelado

---

### Cenário 33 — Token inválido

1. Aba anónima → `http://localhost:3001/portal/token-invalido-qa-staging07`
2. **Então:** título **Não foi possível abrir** ou **Link inválido** (EmptyState)
3. Sem dados de cliente/agendamento

**Evidência:** já existe `P07_15` — revalidar se necessário

---

### Cenário 34 — Importar n8n

1. Browser → `http://localhost:5679` → login basic auth (`.env`: `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`)
2. Menu n8n → **Workflows** → **Import from file**
3. Importar na ordem do roteiro §7.2 (`docs/n8n/*.json`)
4. **Então:** 4 workflows listados; todos **Inactive**
5. Sem pinData fixo nos nós

**Evidência:** `P07_16_n8n_workflows_importados.png`

---

### Cenário 35 / 36 — n8n + Evolution

**BLOCKED** se Evolution (`:8081`) não estiver up.

1. Abrir workflow `03_QA_Barbearia_Evolution_SendText_Smoke`
2. **Execute workflow** → **Manual Trigger**
3. Verificar nós de validação e Evolution
4. Print do resultado **sem** API keys visíveis

**Evidência:** `P07_17_n8n_execucao.png` ou status BLOCKED documentado

---

### Cenários 37–38 — Cross-tenant

**Somente com QA pleno:** scripts API ou dois tenants de teste.

---

### P07_19 — CI verde

1. Abrir PR no GitHub
2. Aba **Checks** → todos verdes
3. Print ou link no relatório

---

## D. Automação browser (QA Sênior / Lead tech)

Com autorização do lead tech, executar:

```powershell
cd barbearia-saas
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts/qa-browser/run-doc10.mjs
```

**Saídas:** `rodada3/11_relatorio_qa_senior_doc10_browser.md` · prints em `prints/` · matriz `rodada3/07_resultados_browser.json` atualizada.

O júnior complementa manualmente: **C20** (conteúdo CSV), **C26** (massa failed), **C31–C32** (portal confirm/cancel), **C34** (import n8n), **C15–C17** se pátio sem jobs em `2026-06-16`.

---

## E. Como preencher a matriz

Após cada cenário, editar `rodada3/07_resultados_browser.json`:

```json
{ "id": "P07_11", "scenario": "Financeiro", "status": "OK", "evidence": "prints/P07_11_financeiro.png" }
```

Status: `OK` | `FAIL` | `PEND` | `BLOCKED` | `N/A`

---

*Documento para execução manual QA júnior — Piloto Staging 07.*
