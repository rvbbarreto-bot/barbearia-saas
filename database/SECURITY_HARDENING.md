# Hardening de segurança (backlog)

Contexto atual (DEV validado pela equipe):

- Role `barbearia_app` existe, consegue login e conectar em `barbearia_saas`, sem `CREATEDB`/`CREATEROLE`, com permissões nas tabelas principais incluindo `message_outbox`.
- **Ressalva produção**: a role está ampla (`DELETE` amplas em dados sensíveis).

Itens futuros recomendados:

1. Reduzir `GRANT` da role `barbearia_app` ao mínimo necessário por serviço (princípio do menor privilégio).
2. Remover `DELETE` onde não for obrigatório (ex.: `tenants`, `users`, `audit_logs`, `customers`, `appointments`, `message_outbox`, `tenant_integrations`); preferir rotas/arquivamento controlados só via role/admin separada.
3. Adotar **soft delete** onde fizer sentido de negócio, em vez de apagar registros multitenant diretamente.
4. **Proteger `audit_logs`**: somente INSERT via app (ou apenas role de relatório com SELECT); impedir DELETE/UPDATE indevidos.
5. Auditoria sistemática de **RLS por tenant**: todas as tabelas multitenant devem ter `FORCE ROW LEVEL SECURITY` e políticas com `USING` + `WITH CHECK` alinhados a `app_tenant_id()`.

Este ficheiro é apenas rastreamento de decisões/pendências; não substitui política corporativa nem revisão formal de segurança.
