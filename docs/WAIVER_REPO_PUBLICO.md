# Waiver — Repositório GitHub público (pendente assinatura)

**Status API GitHub (2026-05-15):** `"private": false`, `"visibility": "public"`  
**Repositório:** https://github.com/rvbbarreto-bot/barbearia-saas

## Recomendação PO

Alterar visibilidade para **Private** em:  
Settings → General → Danger Zone → Change repository visibility.

## Se permanecer Public

O proprietário do produto deve assinar:

| Campo | Valor |
|-------|-------|
| Aceito risco de exposição do código-fonte | ☐ Sim |
| Confirmado: nenhum `.env`, secret ou credencial no histórico | ☐ Sim (Gitleaks CI verde em `a379e11`) |
| Responsável | _________________________ |
| Data | _________________________ |
| Assinatura | _________________________ |

## Validação fábrica (sem segredos versionados)

- `.env` no `.gitignore`
- `.env.example` / `.env.staging.example` apenas placeholders
- Gitleaks: no leaks found (CI #9)
- npm audit: sem crítica bloqueante no CI
