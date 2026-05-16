# QA operacional — cenários alto nível PILOTO-STAGING-04

Tudo marcado inicialmente **`PEND`**.

Smoke futuros:

1. Criar agendamento fluxo novo timeline completo até complete.
2. No-show marcação estado + relatório KPI.
3. Outbox erro forçado (env flag similar OUTBOX_FORCE_SEND_FAILURE) → UI classifica timeout/fetch falha/etc.
4. Waitlist ocupar slot quando cancelamento paralelo cliente distinto deve falhar apenas um (transação Postgres).
5. Portal tokenizado ação cancel remarc válida expira após TTL.
