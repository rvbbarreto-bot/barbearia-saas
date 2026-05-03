import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';

export const HANDOFF_REASON_CODES = [
  'ia_uncertain',
  'customer_angry',
  'payment_failed',
  'payment_refunded',
  'schedule_conflict',
  'customer_restricted',
  'ambiguous_two_turns',
  'out_of_scope',
] as const;

export type HandoffReasonCode = (typeof HANDOFF_REASON_CODES)[number];

const handoffReasonSchema = z.enum(HANDOFF_REASON_CODES);

const createTicketSchema = z.object({
  customer_id: z.string().uuid(),
  subject: z.string().min(1).max(500),
  body: z.string().max(8000).optional(),
  handoff_reason_code: handoffReasonSchema,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  channel: z.string().max(32).optional().default('whatsapp'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sendMessageSchema = z.object({
  text: z.string().min(1).max(4000),
  idempotency_key: z.string().max(200).optional(),
});

const closeTicketSchema = z.object({
  resolution: z.string().min(3).max(8000),
});

const OPEN_STATUSES = ['open', 'in_progress', 'waiting_customer'] as const;

async function resolveWhatsAppOutboxContext(
  client: PoolClient,
  tenantId: string,
  customerId: string | null,
): Promise<{ phone: string; instanceName: string } | null> {
  if (!customerId) return null;
  const phoneRes = await client.query<{ phone: string }>(
    `SELECT phone FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, customerId],
  );
  const phone = phoneRes.rows[0]?.phone?.trim();
  if (!phone) return null;

  const ti = await client.query<{ instance_name: string }>(
    `SELECT config->>'instance_name' AS instance_name
       FROM tenant_integrations
      WHERE tenant_id = $1 AND is_active = true
        AND provider IN ('whatsapp_evolution','evolution','whatsapp')
        AND config->>'instance_name' IS NOT NULL
      LIMIT 1`,
    [tenantId],
  );
  const instanceName = ti.rows[0]?.instance_name?.trim();
  if (!instanceName) return null;
  return { phone, instanceName };
}

function assertTicketOpen(row: { status: string }) {
  if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
    throw new AppError('TICKET_CLOSED', 'Este ticket já está encerrado.', 409);
  }
}

export async function listSupportTickets(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const scope = String(rawQuery.scope ?? 'open').toLowerCase();
  const openOnly = scope !== 'all';

  return withTenant(tenantId, async (client) => {
    const statusCond = openOnly ? `st.status IN ('open','in_progress','waiting_customer')` : 'true';

    const listSql = `
      SELECT st.id, st.customer_id, st.subject, st.body, st.status, st.priority, st.channel,
             st.metadata, st.assigned_to_user_id, st.handoff_reason_code, st.closed_at, st.resolution_notes,
             st.created_at, st.updated_at,
             c.name AS customer_name, c.phone AS customer_phone,
             u.name AS assigned_to_name,
             lm.preview AS last_message_preview, lm.created_at AS last_message_at
        FROM support_tickets st
        LEFT JOIN customers c ON c.tenant_id = st.tenant_id AND c.id = st.customer_id
        LEFT JOIN users u ON u.id = st.assigned_to_user_id
        LEFT JOIN LATERAL (
          SELECT (mo.payload->>'text') AS preview, mo.created_at
            FROM message_outbox mo
           WHERE mo.tenant_id = st.tenant_id AND mo.correlation_id = st.id::text
           ORDER BY mo.created_at DESC
           LIMIT 1
        ) lm ON true
       WHERE st.tenant_id = $1 AND ${statusCond}
       ORDER BY st.updated_at DESC
       LIMIT $2 OFFSET $3`;

    const countSql = `SELECT COUNT(*)::int AS total FROM support_tickets st WHERE st.tenant_id = $1 AND ${statusCond}`;

    const [data, count] = await Promise.all([
      client.query(listSql, [tenantId, limit, offset]),
      client.query(countSql, [tenantId]),
    ]);

    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function getSupportTicket(tenantId: string, ticketId: string) {
  return withTenant(tenantId, async (client) => {
    const t = await client.query(
      `SELECT st.id, st.customer_id, st.subject, st.body, st.status, st.priority, st.channel,
              st.metadata, st.assigned_to_user_id, st.handoff_reason_code, st.closed_at, st.resolution_notes,
              st.created_at, st.updated_at,
              c.name AS customer_name, c.phone AS customer_phone,
              u.name AS assigned_to_name
         FROM support_tickets st
         LEFT JOIN customers c ON c.tenant_id = st.tenant_id AND c.id = st.customer_id
         LEFT JOIN users u ON u.id = st.assigned_to_user_id
        WHERE st.tenant_id = $1 AND st.id = $2
        LIMIT 1`,
      [tenantId, ticketId],
    );
    if (!t.rowCount) throw new AppError('TICKET_NOT_FOUND', 'Ticket não encontrado', 404);

    const msgs = await client.query(
      `SELECT id, status, payload, created_at, sent_at
         FROM message_outbox
        WHERE tenant_id = $1 AND correlation_id = $2
        ORDER BY created_at ASC
        LIMIT 100`,
      [tenantId, ticketId],
    );

    return { ticket: t.rows[0], outbox_messages: msgs.rows };
  });
}

/** Insert dentro de transação já aberta (`withTenant` ou outro fluxo). */
export async function createSupportTicketWithClient(
  client: PoolClient,
  tenantId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
  ip: string | null,
) {
  const body = createTicketSchema.parse(rawBody);

  const cust = await client.query(
    `SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, body.customer_id],
  );
  if (!cust.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);

  const meta = { ...(body.metadata ?? {}), handoff_reason_code: body.handoff_reason_code };

  const ins = await client.query(
    `INSERT INTO support_tickets (
       tenant_id, customer_id, subject, body, status, priority, channel,
       metadata, created_by_user_id, handoff_reason_code
     ) VALUES ($1,$2,$3,$4,'open',$5,$6,$7::jsonb,$8,$9)
     RETURNING *`,
    [
      tenantId,
      body.customer_id,
      body.subject,
      body.body ?? null,
      body.priority,
      body.channel,
      JSON.stringify(meta),
      actorUserId ?? null,
      body.handoff_reason_code,
    ],
  );
  const row = ins.rows[0];

  await writeAuditLog(client, {
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'support_ticket.create',
    entity: 'support_ticket',
    entityId: row.id,
    before: null,
    after: { id: row.id, handoff_reason_code: body.handoff_reason_code, customer_id: body.customer_id },
    ip,
  });

  return row;
}

export async function createSupportTicket(
  tenantId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
  ip: string | null,
) {
  return withTenant(tenantId, async (client) =>
    createSupportTicketWithClient(client, tenantId, rawBody, actorUserId, ip),
  );
}

export async function claimSupportTicket(
  tenantId: string,
  ticketId: string,
  actorUserId: string,
  ip: string | null,
) {
  return withTenant(tenantId, async (client) => {
    const lock = await client.query(
      `SELECT id, status, assigned_to_user_id FROM support_tickets
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, ticketId],
    );
    if (!lock.rowCount) throw new AppError('TICKET_NOT_FOUND', 'Ticket não encontrado', 404);
    const cur = lock.rows[0] as { id: string; status: string; assigned_to_user_id: string | null };
    assertTicketOpen(cur);

    if (cur.assigned_to_user_id && cur.assigned_to_user_id !== actorUserId) {
      throw new AppError('TICKET_CLAIMED', 'Este ticket já está atribuído a outro utilizador.', 409);
    }

    const upd = await client.query(
      `UPDATE support_tickets
          SET assigned_to_user_id = $3,
              status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
              updated_by_user_id = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, ticketId, actorUserId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId,
      action: 'support_ticket.claim',
      entity: 'support_ticket',
      entityId: ticketId,
      before: { assigned_to_user_id: cur.assigned_to_user_id },
      after: { assigned_to_user_id: actorUserId, status: upd.rows[0].status },
      ip,
    });

    return upd.rows[0];
  });
}

export async function sendSupportTicketMessage(
  tenantId: string,
  ticketId: string,
  rawBody: unknown,
  actorUserId: string,
  ip: string | null,
) {
  const body = sendMessageSchema.parse(rawBody);

  return withTenant(tenantId, async (client) => {
    const t = await client.query(
      `SELECT id, customer_id, status, assigned_to_user_id FROM support_tickets
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, ticketId],
    );
    if (!t.rowCount) throw new AppError('TICKET_NOT_FOUND', 'Ticket não encontrado', 404);
    const row = t.rows[0] as {
      id: string;
      customer_id: string | null;
      status: string;
      assigned_to_user_id: string | null;
    };
    assertTicketOpen(row);

    if (row.assigned_to_user_id !== actorUserId) {
      throw new AppError(
        'TICKET_NOT_ASSIGNED_TO_YOU',
        'Assuma o ticket antes de enviar mensagem ao cliente.',
        403,
      );
    }

    const ctx = await resolveWhatsAppOutboxContext(client, tenantId, row.customer_id);
    if (!ctx) {
      throw new AppError(
        'WHATSAPP_ROUTE_UNAVAILABLE',
        'Telefone do cliente ou integração WhatsApp não configurada.',
        422,
      );
    }

    const idem = body.idempotency_key?.trim() || `support_ticket_msg:${ticketId}:${randomUUID()}`;

    await enqueueOutboundMessage(
      {
        tenantId,
        customerId: row.customer_id,
        payload: { type: 'text', text: body.text },
        metadata: {
          phone: ctx.phone,
          instance_name: ctx.instanceName,
          provider: 'evolution',
        },
        idempotencyKey: idem,
        correlationId: ticketId,
      },
      client,
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId,
      action: 'support_ticket.message',
      entity: 'support_ticket',
      entityId: ticketId,
      before: null,
      after: { preview: body.text.slice(0, 120) },
      ip,
    });

    return { ok: true, idempotency_key: idem };
  });
}

export async function closeSupportTicket(
  tenantId: string,
  ticketId: string,
  rawBody: unknown,
  actorUserId: string,
  ip: string | null,
) {
  const body = closeTicketSchema.parse(rawBody);

  return withTenant(tenantId, async (client) => {
    const t = await client.query(
      `SELECT id, customer_id, status, assigned_to_user_id FROM support_tickets
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, ticketId],
    );
    if (!t.rowCount) throw new AppError('TICKET_NOT_FOUND', 'Ticket não encontrado', 404);
    const row = t.rows[0] as {
      id: string;
      customer_id: string | null;
      status: string;
      assigned_to_user_id: string | null;
    };
    assertTicketOpen(row);

    if (row.assigned_to_user_id !== actorUserId) {
      throw new AppError('TICKET_NOT_ASSIGNED_TO_YOU', 'Apenas quem assumiu o ticket pode encerrá-lo.', 403);
    }

    const notify =
      `Encerrámos o seu pedido de apoio. Resumo: ${body.resolution}\n` +
      `(Ref. ticket ${String(ticketId).slice(0, 8)}…)`;

    const ctx = await resolveWhatsAppOutboxContext(client, tenantId, row.customer_id);
    if (ctx) {
      await enqueueOutboundMessage(
        {
          tenantId,
          customerId: row.customer_id,
          payload: { type: 'text', text: notify },
          metadata: {
            phone: ctx.phone,
            instance_name: ctx.instanceName,
            provider: 'evolution',
          },
          idempotencyKey: `support_ticket_close_notify:${ticketId}`,
          correlationId: ticketId,
        },
        client,
      );
    }

    const upd = await client.query(
      `UPDATE support_tickets
          SET status = 'closed',
              closed_at = now(),
              resolution_notes = $3,
              updated_by_user_id = $2,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $4
        RETURNING *`,
      [tenantId, actorUserId, body.resolution, ticketId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId,
      action: 'support_ticket.close',
      entity: 'support_ticket',
      entityId: ticketId,
      before: { status: row.status },
      after: { status: 'closed', resolution: body.resolution.slice(0, 200) },
      ip,
    });

    return upd.rows[0];
  });
}
