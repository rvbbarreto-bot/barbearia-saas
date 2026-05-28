# Testes E2E — Robot Framework + Playwright

Arquitetura Page Object / Resource Pattern para a Web Barbearia SaaS.

## Estrutura

```
tests/
├── specs/                    # Suites por domínio
│   ├── auth/
│   ├── smoke/
│   └── vertical/
├── resources/
│   ├── variables/            # env, routes
│   ├── locators/             # seletores centralizados
│   ├── pages/                # Page Objects (keywords)
│   └── keywords/             # browser, auth, navigation, assertions
├── data/                     # massa (users, inválidos)
├── evidence/                 # screenshots, traces, videos
├── defects/                  # BUG-XXX.md
├── reports/                  # qa-execution-report.md, robot-output/
├── robot/                    # regressivo PS-08 legado
└── requirements.txt
```

## Documentação de análise

| Documento | Conteúdo |
|-----------|----------|
| [docs/test-coverage-matrix.md](../docs/test-coverage-matrix.md) | Inventário de rotas |
| [docs/test-analysis.md](../docs/test-analysis.md) | Análise funcional |
| [docs/bdd-scenarios.md](../docs/bdd-scenarios.md) | Cenários BDD |

## Pré-requisitos

```powershell
docker compose up -d postgres redis api web
.\scripts\qa-seed-viewer.ps1
```

## Instalação (uma vez)

```powershell
cd tests
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
rfbrowser init
```

**Windows + OneDrive:** use `$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\playwright-browsers-barbearia'` (o script `qa-e2e-suite.ps1` já define).

## Executar

```powershell
# Smoke (CI / rápido)
npm run test:e2e:smoke

# Suíte completa specs/ (headless)
npm run test:e2e

# Browser visível
npm run test:e2e:headed

# Paralelo (Pabot)
.\scripts\qa-e2e-suite.ps1 -Pabot 2 -Tags smoke

# Regressivo PS-08 legado
npm run test:robot:nightly
```

## Variáveis de ambiente

| Variável | Default |
|----------|---------|
| `QA_WEB_BASE` | http://localhost:3001 |
| `QA_API_BASE` | http://localhost:3000 |
| `QA_HEADLESS` | False (headed) / True no npm test:e2e |

## Tags

`smoke` · `auth` · `rbac` · `critico` · `car_wash` · `veiculos` · `defect-candidate`
