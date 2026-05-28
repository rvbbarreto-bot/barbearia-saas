# Prints — PILOTO-05 Bloco 1 Outbox

Capturas **PNG/JPG** reais do portal Web (não substituir por `.txt`).

| Ficheiro | Conteúdo |
|----------|----------|
| `P01_listagem_outbox.png` | Lista com colunas incl. Classe erro |
| `P02_filtro_status_failed.png` | Filtro estado = failed |
| `P03_filtro_customer_id.png` | Campo customer_id preenchido + resultado |
| `P04_filtro_error_class_auth.png` | Classe erro = Autenticação |
| `P05_detalhe_sanitizado.png` | Modal detalhe sem segredos |
| `P06_retry_manager.png` | Botão «Tentar novamente» visível (manager) |
| `P07_retry_ausente_attendant.png` | Detalhe atendente sem botão retry |
| `P08_estado_vazio.png` | Empty state |
| `P09_estado_erro.png` | Banner erro (API indisponível) |
| `P10_pr_ci_verde.png` | PR P05 checks verdes no GitHub |

**Gerar:** seguir `04_roteiro_qa_bloco1_outbox.md` após deploy da branch `feature/piloto-staging-05-operacao-gestao-automacao`.

---

## Bloco 2 — Auditoria operacional

| Ficheiro | Conteúdo |
|----------|----------|
| `P11_listagem_auditoria_operacional.png` | Lista manager, colunas completas |
| `P12_filtro_event_type.png` | Filtro ação + resultados |
| `P13_filtro_correlation_id.png` | correlation_id aplicado |
| `P14_link_correlation_outbox.png` | Deep-link para Mensagens |
| `P15_metadata_sanitizada.png` | Metadata truncada/sanitizada |
| `P16_estado_vazio_auditoria.png` | Empty state |
| `P17_attendant_sem_acesso.png` | Atendente sem acesso |
| `P18_estado_erro_auditoria.png` | API down em `/operacao/auditoria` — banner erro, sem «Sem resultados» |
| `P12b_filtro_event_type_tabela.png` | Complemento P12 — tabela filtrada |
| `P19_pr_bloco2_ci_verde.png` | PR Bloco 2 CI verde |

**Gerar:** `04_roteiro_qa_bloco2_auditoria.md` — Vite `:5173` ou Docker rebuild `:3001`.
