import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';

const approveSchema = z.object({
  approval_status: z.enum(['approved', 'rejected', 'draft']),
});

/** Renderização simples — sem Evolution direto; texto vai para o outbox. */
export function renderTemplate(
  body: string,
  vars: Record<string, string | undefined>,
): string {
  let out = body;
  for (const [key, val] of Object.entries(vars)) {
    if (val === undefined) continue;
    out = out.split(`{{${key}}}`).join(val);
  }
  return out;
}

export async function upsertNotificationTemplate(
  tenantId: string,
  input: {
    template_key: string;
    body_template: string;
    approval_status?: 'draft' | 'approved' | 'rejected';
    active?: boolean;
  },
) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_templates
         (tenant_id, template_key, channel, body_template, approval_status, active)
       VALUES ($1, $2, 'whatsapp', $3, COALESCE($4, 'draft'), COALESCE($5, true))
       ON CONFLICT (tenant_id, template_key, channel)
       DO UPDATE SET
         body_template = EXCLUDED.body_template,
         approval_status = COALESCE(EXCLUDED.approval_status, notification_templates.approval_status),
         active = COALESCE(EXCLUDED.active, notification_templates.active),
         updated_at = now()
       RETURNING *`,
      [
        tenantId,
        input.template_key,
        input.body_template,
        input.approval_status ?? null,
        input.active ?? null,
      ],
    );
    return r.rows[0];
  });
}

export async function listNotificationTemplates(tenantId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, template_key, channel, body_template, approval_status, active, created_at, updated_at
         FROM notification_templates
        WHERE tenant_id = $1
        ORDER BY template_key ASC`,
      [tenantId],
    );
    return r.rows;
  });
}

export async function patchTemplateApproval(tenantId: string, templateId: string, body: unknown) {
  const data = approveSchema.parse(body ?? {});
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE notification_templates
          SET approval_status = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, templateId, data.approval_status],
    );
    if (!r.rowCount) throw new AppError('TEMPLATE_NOT_FOUND', 'Template não encontrado', 404);
    return r.rows[0];
  });
}
