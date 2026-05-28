# Robot Framework — Regressivo PS-08 / Doc 10

Suite **Keyword-Driven** com [Browser Library](https://marketsquare.github.io/robotframework-browser/) (Playwright).

## 1. Cenários BDD

Ver: [`docs/01_cenarios_bdd_ps08_doc10.md`](docs/01_cenarios_bdd_ps08_doc10.md)

## 2. Setup — comandos (PowerShell / Cursor)

### 2.1 Ambiente de aplicação

```powershell
cd barbearia-saas
docker compose build api web
docker compose up -d --force-recreate --no-deps api web postgres

# Redis: se porta 6380 ocupada, ver scripts/README-QA-PS08-SPRINT1.md

.\scripts\qa-seed-car-wash-patio.ps1
.\scripts\qa-seed-outbox-failed.ps1
```

### 2.2 Python + Robot + Browser

```powershell
cd tests\robot

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r requirements.txt

# Binários Playwright (obrigatório, uma vez por máquina/venv)
rfbrowser init
```

### 2.3 Executar regressivo + relatório HTML

```powershell
cd tests\robot
.\.venv\Scripts\Activate.ps1

# Headed (ver navegador): altere BROWSER_HEADLESS em resources/variables/env.robot para ${False}

robot -d results tests\regressivo_ps08_doc10.robot
```

**Relatórios gerados:**

| Arquivo | Uso |
|---------|-----|
| `results/report.html` | Sumário executivo |
| `results/log.html` | Timeline com screenshots embutidos |
| `results/evidencias/*.png` | Prints explícitos (`Take Screenshot`) |

Abrir no navegador:

```powershell
start results\report.html
```

### 2.4 Filtros por tag

```powershell
robot -d results --include critico tests\regressivo_ps08_doc10.robot
robot -d results --include ps-08-1 tests\regressivo_ps08_doc10.robot
```

## 3. Estrutura

```
tests/robot/
  docs/01_cenarios_bdd_ps08_doc10.md
  resources/
    variables/env.robot
    keywords/common.robot
    keywords/veiculos_keywords.robot
    keywords/patio_keywords.robot
    keywords/outbox_keywords.robot
  tests/regressivo_ps08_doc10.robot
  results/          # gerado pelo robot -d results
    evidencias/
```

## 4. Manutenção

- URLs e credenciais: `resources/variables/env.robot`
- Novos fluxos: nova keyword em `resources/keywords/` + caso em `tests/regressivo_ps08_doc10.robot`
- Alinhar com `scripts/qa-browser/qa-junior-doc10.mjs` (mesmos seletores `data-testid`)
