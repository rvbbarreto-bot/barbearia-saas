import type { PoolClient } from 'pg';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';
import { loadCustomerConsentFlags } from '../notificationJobs/consent.js';
import { resolveWhatsAppOutboundRouting } from '../notificationJobs/routing.js';
import { renderTemplate } from './templates.service.js';
import { blocksPromotionalRecall } from './recall-consent.js';
import { recallTemplateKeyForKind } from './eligibility.js';

type ProcessArgs = {
  tenantId: string;
  customerId: string;
  sourceAppointmentId: string;
  serviceId: string | null;
  /** Se ausente, resolve a partir do agendamento. */
  templateKeyFromPayload?: string;
};

/**
 * Envio de recall promocional: opt-in, template aprovado, outbox e registo em recall_sends.
 * Nenhum envio direto a Evolution.
 */
export async function executeRecallPromotional(
  client: PoolClient,
  a: ProcessArgs,
): Promise<{ result: 'sent' | 'skip' | 'fail'; lastError?: string }> {
  const srcAppt = await client.query<{
    id: string;
    status: string;
    service_id: string | null;
    customer_id: string;
  }>(
    `SELECT id, status::text, service_id, customer_id
       FROM appointments
      WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [a.tenantId, a.sourceAppointmentId],
  );
  const ap = srcAppt.rows[0];
  if (!ap || ap.status !== 'completed') {
    return { result: 'skip', lastError: 'SKIP_APPOINTMENT_NOT_COMPLETED' };
  }

  const serviceId = a.serviceId ?? ap.service_id;
  if (!serviceId) {
    return { result: 'skip', lastError: 'SKIP_NO_SERVICE' };
  }

  const svc = await client.query<{ recall_kind: string | null; name: string }>(
    `SELECT recall_kind, name FROM services WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [a.tenantId, serviceId],
  );
  const srow = svc.rows[0];
  if (!srow) {
    return { result: 'skip', lastError: 'SKIP_SERVICE_NOT_FOUND' };
  }

  const templateKey = a.templateKeyFromPayload ?? recallTemplateKeyForKind(srow.recall_kind);

  const flags = await loadCustomerConsentFlags(client, a.tenantId, a.customerId);
  if (blocksPromotionalRecall(flags.whatsapp_opt_out, flags.latest.recall)) {
    return { result: 'skip', lastError: 'SKIP_RECALL_OPT_IN' };
  }

  const tpl = await client.query<{ id: string; body_template: string }>(
    `SELECT id, body_template
       FROM notification_templates
      WHERE tenant_id = $1
        AND template_key = $2
        AND channel = 'whatsapp'
        AND active = true
        AND approval_status = 'approved'
      LIMIT 1`,
    [a.tenantId, templateKey],
  );
  if (!tpl.rowCount) {
    return { result: 'skip', lastError: 'SKIP_NO_APPROVED_TEMPLATE' };
  }
  const templateRow = tpl.rows[0];

  const claim = await client.query<{ id: string }>(
    `INSERT INTO recall_sends
       (tenant_id, customer_id, source_appointment_id, service_id, template_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      a.tenantId,
      a.customerId,
      a.sourceAppointmentId,
      serviceId,
      templateRow.id,
      `recall_send:${a.sourceAppointmentId}`,
    ],
  );
  if (!claim.rowCount) {
    return { result: 'skip', lastError: 'SKIP_ALREADY_LOGGED' };
  }

  const routing = await resolveWhatsAppOutboundRouting(client, a.tenantId, a.customerId);
  if (!routing) {
    return { result: 'skip', lastError: 'SKIP_NO_ROUTING' };
  }

  const cust = await client.query<{ name: string | null }>(
    `SELECT name FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [a.tenantId, a.customerId],
  );
  const tnt = await client.query<{ trade_name: string }>(
    `SELECT trade_name FROM tenants WHERE id = $1 LIMIT 1`,
    [a.tenantId],
  );

  const text = renderTemplate(templateRow.body_template, {
    customer_name: cust.rows[0]?.name?.trim() || 'Cliente',
    service_name: srow.name,
    trade_name: tnt.rows[0]?.trade_name ?? '',
    source_appointment_short: String(a.sourceAppointmentId).slice(0, 8),
  });

  await enqueueOutboundMessage(
    {
      tenantId: a.tenantId,
      customerId: a.customerId,
      payload: { type: 'text', text },
      metadata: {
        phone: routing.phone,
        instance_name: routing.instance_name,
        provider: 'evolution',
      },
      idempotencyKey: `recall_promo:${a.sourceAppointmentId}`,
      correlationId: a.sourceAppointmentId,
    },
    client,
  );

  await client.query(
    `UPDATE recall_sends
        SET sent_at = now(), template_id = $2, last_error = NULL, updated_at = now()
      WHERE tenant_id = $1
        AND source_appointment_id = $3`,
    [a.tenantId, templateRow.id, a.sourceAppointmentId],
  );

  return { result: 'sent' };
}
