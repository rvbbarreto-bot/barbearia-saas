import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { loadTenantVerticalContextWithClient } from '../vertical/tenant-vertical.service.js';

export async function getCustomerOverview(tenantId: string, customerId: string) {
  return withTenant(tenantId, async (client) => {
    const cust = await client.query(
      `SELECT id, name, phone, email, whatsapp_opt_in, whatsapp_opt_out, is_vip,
              last_interaction_at, created_at, updated_at
         FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, customerId],
    );
    if (!cust.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);

    const appointments = await client.query(
      `SELECT a.id::text AS id, a.status::text AS status, a.starts_at::text AS starts_at,
              a.ends_at::text AS ends_at,
              s.name AS service_name, p.name AS professional_name
         FROM appointments a
         LEFT JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
         LEFT JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
        WHERE a.tenant_id = $1 AND a.customer_id = $2
        ORDER BY a.starts_at DESC
        LIMIT 50`,
      [tenantId, customerId],
    );

    const financials = await client.query(
      `SELECT f.*, a.starts_at::text AS appointment_starts_at, a.status::text AS appointment_status
         FROM appointment_financials f
         JOIN appointments a ON a.tenant_id = f.tenant_id AND a.id = f.appointment_id
        WHERE f.tenant_id = $1 AND a.customer_id = $2
        ORDER BY a.starts_at DESC
        LIMIT 30`,
      [tenantId, customerId],
    );

    const outbox = await client.query(
      `SELECT id::text,
              status::text,
              channel,
              created_at::text,
              correlation_id,
              last_error,
              payload->>'template_key' AS template_key,
              payload->>'appointment_id' AS appointment_id
         FROM message_outbox
        WHERE tenant_id = $1 AND customer_id = $2
        ORDER BY created_at DESC
        LIMIT 30`,
      [tenantId, customerId],
    );

    const audit = await client.query(
      `SELECT id::text,
              event_type AS action,
              entity_type AS entity,
              entity_id::text,
              created_at::text,
              correlation_id
         FROM operational_audit_events
        WHERE tenant_id = $1
          AND (
            (entity_type = 'customer' AND entity_id = $2::uuid)
            OR metadata->>'customer_id' = $2::text
          )
        ORDER BY created_at DESC
        LIMIT 30`,
      [tenantId, customerId],
    );

    const recentServices = await client.query(
      `SELECT a.service_id::text, s.name, MAX(a.starts_at)::text AS last_at
         FROM appointments a
         JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
        WHERE a.tenant_id = $1 AND a.customer_id = $2 AND a.status = 'completed'
        GROUP BY a.service_id, s.name
        ORDER BY MAX(a.starts_at) DESC
        LIMIT 10`,
      [tenantId, customerId],
    );

    let vehicles: unknown[] = [];
    const vertical = await loadTenantVerticalContextWithClient(client, tenantId);
    if (vertical.vertical === 'car_wash') {
      const v = await client.query(
        `SELECT id::text, plate, model, color, is_active AS active, created_at::text
           FROM customer_vehicles
          WHERE tenant_id = $1 AND customer_id = $2
          ORDER BY created_at DESC`,
        [tenantId, customerId],
      );
      vehicles = v.rows;
    }

    return {
      customer: cust.rows[0],
      vertical: vertical.vertical,
      appointments: appointments.rows,
      vehicles,
      outbox_messages: outbox.rows,
      audit_events: audit.rows,
      financials: financials.rows,
      recent_services: recentServices.rows,
      whatsapp_opt_in: Boolean(cust.rows[0].whatsapp_opt_in) && !cust.rows[0].whatsapp_opt_out,
    };
  });
}
