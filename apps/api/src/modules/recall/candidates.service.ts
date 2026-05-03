import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import {
  daysBetweenUtc,
  effectiveRecallWindow,
  isInRecallWindow,
  recallTemplateKeyForKind,
  type ServiceRecallRow,
} from './eligibility.js';
import { blocksPromotionalRecall } from './recall-consent.js';
import { loadCustomerConsentFlags } from '../notificationJobs/consent.js';

export type RecallCandidateRow = {
  source_appointment_id: string;
  customer_id: string;
  service_id: string;
  service_name: string;
  recall_kind: string | null;
  recall_min_days: number | null;
  recall_max_days: number | null;
  last_visit_at: string;
  days_since_visit: number;
  window_min: number | null;
  window_max: number | null;
  template_key: string;
  blockers: string[];
  can_send_promotional: boolean;
};

async function rowBlockers(
  client: PoolClient,
  tenantId: string,
  customerId: string,
  templateKey: string,
): Promise<string[]> {
  const blockers: string[] = [];
  const flags = await loadCustomerConsentFlags(client, tenantId, customerId);
  if (blocksPromotionalRecall(flags.whatsapp_opt_out, flags.latest.recall)) {
    blockers.push('recall_opt_out');
  }
  const tpl = await client.query(
    `SELECT 1 FROM notification_templates
      WHERE tenant_id = $1 AND template_key = $2 AND channel = 'whatsapp'
        AND active = true AND approval_status = 'approved' LIMIT 1`,
    [tenantId, templateKey],
  );
  if (!tpl.rowCount) blockers.push('no_approved_template');
  return blockers;
}

/** Para uso dentro de transação já existente (ex.: sweep). */
export async function listRecallCandidatesWithClient(
  client: PoolClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<RecallCandidateRow[]> {
  const base = await client.query<{
    source_appointment_id: string;
    customer_id: string;
    service_id: string;
    service_name: string;
    recall_kind: string | null;
    recall_min_days: number | null;
    recall_max_days: number | null;
    last_visit_at: Date;
  }>(
    `SELECT DISTINCT ON (a.customer_id, a.service_id)
            a.id AS source_appointment_id,
            a.customer_id,
            a.service_id,
            s.name AS service_name,
            s.recall_kind,
            s.recall_min_days,
            s.recall_max_days,
            a.starts_at AS last_visit_at
       FROM appointments a
       JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
        AND a.status = 'completed'
        AND a.service_id IS NOT NULL
        AND s.active = true
      ORDER BY a.customer_id, a.service_id, a.starts_at DESC`,
    [tenantId],
  );

  const out: RecallCandidateRow[] = [];

  for (const row of base.rows) {
    const win = effectiveRecallWindow(row as ServiceRecallRow);
    if (!win) continue;

    const lastVisit = new Date(row.last_visit_at);
    if (!isInRecallWindow(lastVisit, now, win)) continue;

    const daysSince = daysBetweenUtc(lastVisit, now);

    const existsSend = await client.query(
      `SELECT 1 FROM recall_sends
        WHERE tenant_id = $1 AND source_appointment_id = $2 LIMIT 1`,
      [tenantId, row.source_appointment_id],
    );
    if (existsSend.rowCount) continue;

    const templateKey = recallTemplateKeyForKind(row.recall_kind);
    const blockers = await rowBlockers(client, tenantId, row.customer_id, templateKey);
    const canSend = blockers.length === 0;

    out.push({
      source_appointment_id: row.source_appointment_id,
      customer_id: row.customer_id,
      service_id: row.service_id,
      service_name: row.service_name,
      recall_kind: row.recall_kind,
      recall_min_days: row.recall_min_days,
      recall_max_days: row.recall_max_days,
      last_visit_at: new Date(row.last_visit_at).toISOString(),
      days_since_visit: daysSince,
      window_min: win.min,
      window_max: win.max,
      template_key: templateKey,
      blockers,
      can_send_promotional: canSend,
    });
  }

  return out;
}

/**
 * Última visita concluída por (cliente, serviço), com janela de recall aplicável.
 */
export async function listRecallCandidates(
  tenantId: string,
  options: { now?: Date } = {},
): Promise<RecallCandidateRow[]> {
  const now = options.now ?? new Date();
  return withTenant(tenantId, async (client) => listRecallCandidatesWithClient(client, tenantId, now));
}
