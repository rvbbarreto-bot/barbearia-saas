# Pacote de evidências — MVP piloto (01–19)

**Commit base:** `e138de8` — `fix(web): pt-BR UX, friendly outbox errors, and pilot acceptance docs`  
**Captura:** 2026-05-15 — Docker `http://localhost:3001`, tenant `00000000-0000-0000-0000-000000000001`.

Artefatos presentes nesta pasta: PNGs de portal + JSON/TXT de API. Ver matriz em `docs/RELATORIO_FECHAMENTO_MVP_PILOTO.md`.

| Ficheiro | Perfil | Tenant | Resultado esperado |
|----------|--------|--------|-------------------|
| `01_login_multitenant_admin.png` | admin@demo.local | `00000000-0000-0000-0000-000000000001` | Login OK, dashboard |
| `02_login_multitenant_atendente.png` | atendente@demo.local | idem | Login OK, menu restrito |
| `03_agenda_admin_com_botao_bloqueio.png` | admin | idem | Botão "Bloquear horário" visível |
| `04_agenda_atendente_sem_botao_bloqueio_se_aplicavel.png` | atendente | idem | Sem botão bloqueio (se RBAC UI) |
| `05_bloqueio_modal_campos_validos.png` | admin | idem | Confirmar desabilitado até motivo ≥3 chars |
| `06_bloqueio_criado_sucesso.png` | admin | idem | Toast sucesso |
| `07_slot_bloqueado_erro_amigavel.png` | admin | idem | Toast "Horário indisponível..." (409) |
| `08_agendamento_slot_livre_sucesso.png` | admin | idem | Agendamento criado |
| `09_outbox_lista_sem_scroll_critico.png` | admin/manager | idem | Colunas principais legíveis |
| `10_outbox_detalhe_sanitizado_admin.png` | admin | idem | Erro amigável + diagnóstico técnico |
| `11_outbox_retry_admin_antes.png` | manager+ | idem | Estado failed/dead |
| `12_outbox_retry_admin_depois.png` | manager+ | idem | pending ou tentativa++ |
| `13_outbox_retry_atendente_sem_botao.png` | atendente | idem | Sem botão retry |
| `14_rbac_api_retry_atendente_403.png` | atendente | idem | Resposta API 403 (curl/Postman) |
| `15_cross_tenant_api_negado.png` | admin A | tenant B | 403/404 |
| `16_health_api_ok.png` | — | — | `GET /health` |
| `17_database_health_ok.png` | — | — | `GET /database/health` |
| `18_ci_verde.png` | — | — | GitHub Actions |
| `19_secret_scan_limpo.png` | — | — | gitleaks/CI |

Relatório mestre: `docs/RELATORIO_ENTREGA_MVP_PILOTO_ACEITE.md`.
