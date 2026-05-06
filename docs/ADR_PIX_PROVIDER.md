# ADR — Escolha de PSP (PIX) para Barbearia SaaS

**Status:** decisão **pendente** do PO/gestão.  
**Ambiente:** DEV/QA — não constitui compromisso comercial nem homologação regulatória.

## Contexto

O produto precisa de um PSP para cobranças PIX com webhooks, sandbox e modelo compatível com **multi-tenant** (isolamento por tenant, idempotência, auditoria). Sem decisão explícita, **não** se implementa integração real nem se usa mock como se fosse produção.

Variável de ambiente: `PIX_REAL_PROVIDER_ENABLED` (default **false**) — gate explícito para qualquer caminho que fale com PSP real.

## Opções avaliadas

### Asaas

- **API / docs:** REST amplamente documentada; comunidade ativa em PT-BR.
- **Sandbox:** disponível; fluxos de cobrança e webhook testáveis.
- **Webhooks:** suportados; verificar assinatura/HMAC na documentação vigente.
- **Multi-tenant:** contas/subcontas e permissões devem ser desenhadas (subconta por tenant ou agregador com metadados); risco médio de modelagem.
- **Custos / liquidação:** tabela comercial variável; validar contrato e DRE.
- **Riscos:** KYC por tenant; conciliação e chargeback políticas Asaas; dependência de disponibilidade da API.

### Efí (Gerencianet)

- **API / docs:** madura no mercado BR; PIX desde cedo.
- **Sandbox:** ambiente de homologação clássico.
- **Webhooks:** com assinatura; bem descrito historicamente.
- **Multi-tenant:** semelhante ao Asaas — exige desenho de subcontas ou chaves por tenant.
- **Riscos:** curva de integração e versioning; suporte comercial em horário BR.

### OpenPix

- **Foco:** PIX / Open Finance; orientado a desenvolvedores.
- **Sandbox / webhooks:** presentes; validar limites de volume e roadmap.
- **Multi-tenant:** avaliar modelo de aplicação vs. múltiplos merchants.
- **Riscos:** menor pegada histórica que Asaas/Efí em alguns segmentos; validar SLA e suporte para operação B2B2C.

## Critérios de decisão

| Critério | Peso |
|----------|------|
| Qualidade de sandbox + paridade com produção | Alto |
| Webhook com assinatura verificável | Alto |
| Documentação e exemplos | Alto |
| Encaixe multi-tenant (subcontas / metadados / segregação) | Alto |
| Custo variável + previsibilidade | Médio |
| Suporte e incidentes | Médio |
| Esforço de integração vs. time disponível | Médio |

## Comparação resumida

| | Asaas | Efí | OpenPix |
|---|--------|-----|---------|
| Maturidade PIX BR | Alta | Alta | Boa |
| Sandbox | Sim | Sim | Sim |
| DevEx | Boa | Boa | Boa |
| Modelo multi-tenant | Exige desenho | Exige desenho | Exige desenho |
| Risco jurídico/contratual | Médio | Médio | Médio |

## Recomendação técnica (pré-PO)

1. **Curto prazo (homologação):** priorizar **Asaas** ou **Efí** pela combinação documentação + mercado BR + histórico de PIX, **desde que** o PO confirme custo e modelo de subconta/conciliação.
2. **OpenPix** como alternativa forte se a estratégia de produto privilegiar stack “PIX-first” e o time validar SLA/comercial.

## Recomendação de produto

- Fixar **um** PSP piloto com sandbox antes de prometer data a clientes.
- Definir dono do relacionamento comercial + checklist KYC por tenant (ou modelo agregador).

## Riscos se não houver decisão

- Retrabalho de adapters e de modelo de dados (`pix_payments`, webhooks).
- Bloqueio de piloto comercial real (sem PSP não há cobrança homologada).

## Decisão pendente do PO

- Provider escolhido: **Asaas | Efí | OpenPix | outro**.
- Conta sandbox criada e credenciais guardadas fora do Git.
- Política de assinatura de webhook e rotação de segredos.

## Impacto técnico até lá

- Manter **interface** `IPixProvider` (ou equivalente) + implementação **mock** apenas em `NODE_ENV=test` / contratos de teste.
- **Não** ligar `PIX_REAL_PROVIDER_ENABLED` sem decisão escrita.

---

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
