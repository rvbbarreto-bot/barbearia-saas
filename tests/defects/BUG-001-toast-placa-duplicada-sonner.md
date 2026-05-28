# BUG-001 — Toast de placa duplicada não visível (Sonner)

| Campo | Valor |
|-------|--------|
| **ID** | BUG-001 |
| **Título** | Toast Sonner permanece hidden ao cadastrar placa duplicada |
| **Severidade** | Média |
| **Prioridade** | P2 |
| **Ambiente** | Local Docker — web :3001, api :3000, tenant demo |
| **Módulo** | Veículos / UX feedback |
| **Tela** | `/veiculos` — modal Novo Veículo |
| **URL** | http://localhost:3001/veiculos |

## Pré-condições

- Tenant com vertical `car_wash`
- Veículo com placa `PSQ8A16` já cadastrado (seed ou cadastro prévio)
- Usuário `admin@demo.local` autenticado

## Passos para reproduzir

1. Acessar **Veículos**
2. Clicar **Novo Veículo**
3. Selecionar um cliente
4. Informar placa já existente (ex.: `PSQ8A16`)
5. Clicar **Salvar**

## Comportamento esperado

- Toast de erro visível informando placa já cadastrada (`VEHICLE_PLATE_ALREADY_EXISTS` ou mensagem amigável)
- Veículo não duplicado na listagem

## Comportamento atual

- Elemento `[data-sonner-toaster]` presente no DOM mas com estado **hidden**
- Automação Playwright/Robot aguarda visibilidade e expira timeout
- Usuário pode não perceber feedback claro do erro

## Evidências

- Screenshot: `tests/evidence/screenshots/` (execução doc10 / VEI-02)
- Spec: `tests/specs/vertical/veiculos.robot` — tag `defect-candidate`
- Relatório browser: `docs/evidencias/piloto_staging_07/rodada3/11_relatorio_qa_senior_doc10_browser.md`

## BDD reproduzível

```gherkin
Dado que já existe veículo com placa PSQ8A16 no tenant
Quando tento cadastrar outro veículo com a mesma placa
E confirmo o salvamento
Então devo ser informado que a placa já está cadastrada
```

## Logs relevantes

- API esperada: HTTP 409/400 com `error: VEHICLE_PLATE_ALREADY_EXISTS`
- UI: verificar integração Sonner + handler de erro em `VeiculosPage` / drawer
