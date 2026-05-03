import type { PoolClient } from 'pg';

/**
 * Regras V4: opt-out e consentimentos por finalidade bloqueiam recall e marketing;
 * lembretes (D-1 / H-2) exigem opt-in ativo e consentimento transacional.
 */

export type LatestPurposeMap = Partial<Record<'transactional' | 'marketing' | 'recall', boolean>>;

export function blocksMarketingOrRecall(
  whatsappOptOut: boolean,
  purpose: 'marketing' | 'recall',
  latestGranted: boolean | undefined,
): boolean {
  if (whatsappOptOut) return true;
  if (latestGranted === false) return true;
  return false;
}

/** Lembretes D-1 / H-2: opt-in no canal + revogação explícita de transactional bloqueia. */
export function blocksTransactionalReminders(
  whatsappOptIn: boolean,
  whatsappOptOut: boolean,
  transactionalGranted: boolean | undefined,
): boolean {
  if (whatsappOptOut || !whatsappOptIn) return true;
  if (transactionalGranted === false) return true;
  return false;
}

export async function loadCustomerConsentFlags(
  client: PoolClient,
  tenantId: string,
  customerId: string,
): Promise<{
  whatsapp_opt_in: boolean;
  whatsapp_opt_out: boolean;
  latest: LatestPurposeMap;
}> {
  const cust = await client.query<{
    whatsapp_opt_in: boolean;
    whatsapp_opt_out: boolean;
  }>(
    `SELECT whatsapp_opt_in, whatsapp_opt_out FROM customers
      WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, customerId],
  );
  const row = cust.rows[0];
  if (!row) {
    return { whatsapp_opt_in: false, whatsapp_opt_out: true, latest: {} };
  }

  const cons = await client.query<{ purpose: string; granted: boolean }>(
    `SELECT DISTINCT ON (purpose)
            purpose,
            granted
       FROM consents
      WHERE tenant_id = $1
        AND customer_id = $2
        AND channel = 'whatsapp'
      ORDER BY purpose, created_at DESC`,
    [tenantId, customerId],
  );

  const latest: LatestPurposeMap = {};
  for (const r of cons.rows) {
    if (r.purpose === 'transactional') latest.transactional = r.granted;
    if (r.purpose === 'marketing') latest.marketing = r.granted;
    if (r.purpose === 'recall') latest.recall = r.granted;
  }

  return {
    whatsapp_opt_in: row.whatsapp_opt_in,
    whatsapp_opt_out: row.whatsapp_opt_out,
    latest,
  };
}
