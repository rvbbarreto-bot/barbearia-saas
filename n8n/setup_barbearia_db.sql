-- =============================================
-- SETUP BARBEARIA DB PARA N8N
-- =============================================

-- 1. Slug do tenant demo
UPDATE tenants
SET slug = 'barbearia-demo'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND slug IS NULL;

-- Confirmar
SELECT id, slug, trade_name, status FROM tenants;

-- 2. View v_recall_candidates usada pelo workflow 03
-- Retorna clientes com agendamentos entre 25 e 35 dias atrás (janela recall "30 dias")
CREATE OR REPLACE VIEW v_recall_candidates AS
SELECT
    a.tenant_id,
    t.slug           AS tenant_slug,
    c.id             AS customer_id,
    c.name           AS customer_name,
    c.phone,
    a.id             AS last_appointment_id,
    a.ends_at        AS last_visit_at,
    (a.ends_at + INTERVAL '30 days') AS due_at,
    p.name           AS professional_name,
    s.name           AS service_name,
    'Ola ' || c.name || '! Faz 30 dias desde sua ultima visita. Que tal agendar com a gente novamente?' AS message
FROM appointments a
JOIN customers    c ON c.id = a.customer_id    AND c.tenant_id = a.tenant_id
JOIN tenants      t ON t.id = a.tenant_id
LEFT JOIN professionals p ON p.id = a.professional_id AND p.tenant_id = a.tenant_id
LEFT JOIN services      s ON s.id = a.service_id      AND s.tenant_id = a.tenant_id
WHERE a.status = 'completed'
  AND a.ends_at BETWEEN now() - INTERVAL '35 days' AND now() - INTERVAL '25 days'
  -- garantir que não há agendamento mais recente (ativo) do mesmo cliente
  AND NOT EXISTS (
    SELECT 1 FROM appointments a2
     WHERE a2.customer_id = a.customer_id
       AND a2.tenant_id   = a.tenant_id
       AND a2.status IN ('confirmed', 'offered')
       AND a2.starts_at > now()
  )
  -- evitar recall duplicado: sem completed/no_show nos últimos 5 dias
  AND NOT EXISTS (
    SELECT 1 FROM appointments a3
     WHERE a3.customer_id = a.customer_id
       AND a3.tenant_id   = a.tenant_id
       AND a3.ends_at > now() - INTERVAL '5 days'
       AND a3.status IN ('completed', 'no_show')
       AND a3.id <> a.id
  )
  AND c.phone IS NOT NULL
  AND t.slug IS NOT NULL;

-- 3. Grants de leitura para o usuário da barbearia (usado pelo n8n via Postgres credential)
GRANT SELECT ON v_recall_candidates TO barbearia_test;

-- Verificar view
SELECT count(*) AS recall_candidates FROM v_recall_candidates;

-- 4. Inserir um agendamento completed de 30 dias atrás para teste do recall
-- (apenas se não houver candidatos)
DO $$
DECLARE
    v_count INT;
    v_customer_id UUID := '1b03b3e5-3965-4192-a1ec-01cc6951e85e';
    v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001';
    v_prof_id     UUID;
    v_svc_id      UUID;
BEGIN
    SELECT count(*) INTO v_count FROM v_recall_candidates;
    IF v_count = 0 THEN
        SELECT id INTO v_prof_id FROM professionals WHERE tenant_id = v_tenant_id LIMIT 1;
        SELECT id INTO v_svc_id  FROM services      WHERE tenant_id = v_tenant_id LIMIT 1;
        INSERT INTO appointments
          (tenant_id, customer_id, professional_id, service_id,
           starts_at, ends_at, status, source, idempotency_key)
        VALUES
          (v_tenant_id, v_customer_id, v_prof_id, v_svc_id,
           now() - INTERVAL '30 days',
           now() - INTERVAL '30 days' + INTERVAL '30 minutes',
           'completed', 'manual',
           'recall-seed-' || gen_random_uuid());
        RAISE NOTICE 'Seed recall appointment inserted';
    ELSE
        RAISE NOTICE 'Already % recall candidates, no seed needed', v_count;
    END IF;
END $$;

-- Resultado final
SELECT
    customer_name, phone, tenant_slug, professional_name,
    last_visit_at::date AS last_visit,
    due_at::date        AS due_date,
    LEFT(message, 80)   AS msg_preview
FROM v_recall_candidates;
