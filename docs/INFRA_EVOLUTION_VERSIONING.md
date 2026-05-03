# Evolution API — versionamento e política de upgrade (Barbearia SaaS V4)

## Onde a Evolution roda

Este repositório **não** inclui um serviço `docker-compose` para a Evolution API. Em ambientes típicos ela é implantada **à parte** (VM, outro compose, Kubernetes ou SaaS) e é referenciada apenas por variáveis:

- `EVOLUTION_API_URL` — base URL da instância Evolution (workflows n8n, worker de outbox na API).
- `EVOLUTION_API_KEY` — chave de autenticação (apenas Secret Manager / `.env` local, nunca em JSON de workflow versionado).

## Versão mínima recomendada

- Fixar uma **tag semver explícita** da imagem Evolution acordada com o time (ex. `atendai/evolution-api:v2.x.y` ou imagem interna equivalente).
- **Proibido** usar `latest` em **staging** e **produção** para a Evolution (mesma regra que para a imagem da API).

## Política de upgrade

1. **DEV** — pode testar candidata a release com dados sintéticos.
2. **Staging** — promover a mesma tag semver validada em DEV; smoke webhook + inbound.
3. **Produção** — promover apenas após janela de mudança, backup e rollback documentado.

Registre no change log da implantação: tag anterior, tag nova, data e responsável.

## Relação com n8n e Core API

- Fluxos aprovados não devem chamar Evolution “solta” sem política API/outbox (ver governança no consolidado V4).
- Workflows **02** e **03** permanecem **desativados** até remediação formal; o export JSON no repo define `"active": false` como padrão seguro na importação.

## Referências internas

- `apps/api` — env `EVOLUTION_*` em `config/env`.
- `n8n/workflows/*.json` — URLs construídas com `$env.EVOLUTION_API_URL`.
