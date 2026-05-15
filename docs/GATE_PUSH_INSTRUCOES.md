# Instruções — Gate remoto (push, PR, CI)

**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**HEAD local (após commits gate):** ver `git rev-parse HEAD`

## 1. Configurar remote (obrigatório — PO)

```powershell
cd barbearia-saas
git remote add origin https://github.com/<ORG>/<REPO>.git
git remote -v
git push -u origin feature/p2-2-web-outbox-whatsapp-operational
```

## 2. Abrir PR

```powershell
gh pr create --base develop --head feature/p2-2-web-outbox-whatsapp-operational `
  --title "feat(p2.2-p2.3): portal UX pt-BR, outbox operacional, evidências MVP piloto" `
  --body-file docs/RELATORIO_FECHAMENTO_MVP_PILOTO.md
```

## 3. CI e secret scan

- Aguardar GitHub Actions (workflow `CI`).
- Capturar print verde → `docs/evidencias/mvp_piloto_aceite/18_ci_verde.png`
- Gitleaks local já executado → `19_secret_scan_limpo.txt` (ou job CI equivalente)

## 4. Evolution

Ver `docs/DECLARACAO_PILOTO_EVOLUTION.md` — piloto homologado **sem WhatsApp real** até staging.
