import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { isCommissionEnabledInSettingsJson } from './tenant-commission-flag.js';
import { writeAuditLog } from '../../shared/audit.js';
import { loadTenantTimeZone } from '../notificationJobs/schedule.js';
import {
  createCommissionRuleSchema,
  patchCommissionEntryStatusSchema,
  patchCommissionRuleSchema,
  dateRangeQuerySchema,
} from './schemas.js';
import {
  computeCommissionCentsFromRule,
  resolveBestCommissionRule,
  type CommissionRuleRow,
} from './rule-resolution.js';

export type { CommissionRuleRow } from './rule-resolution.js';
export { computeCommissionCentsFromRule, resolveBestCommissionRule } from './rule-resolution.js';

async function loadCommissionEnabledFromTenantSettings(
  client: PoolClient,
  tenantId: string,
): Promise<boolean> {
  const r = await client.query<{ settings: unknown }>(
    `SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  if (!r.rowCount) return false;
  return isCommissionEnabledInSettingsJson(r.rows[0].settings);
}

/** Garante branch/profissional/serviço pertencentes ao tenant (RLS não substitui validação na escrita). */
async function assertCommissionRuleReferencesBelongToTenant(
  client: PoolClient,
  tenantId: string,
  branchId: string | null | undefined,
  professionalId: string | null | undefined,
  serviceId: string | null | undefined,
): Promise<void> {
  if (branchId) {
    const b = await client.query(`SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      branchId,
      tenantId,
    ]);
    if (!b.rowCount) {
      throw new AppError('COMMISSION_RULE_BRANCH_INVALID', 'Unidade (branch) não pertence ao tenant.', 422);
    }
  }
  if (professionalId) {
    const p = await client.query(`SELECT 1 FROM professionals WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      professionalId,
      tenantId,
    ]);
    if (!p.rowCount) {
      throw new AppError(
        'COMMISSION_RULE_PROFESSIONAL_INVALID',
        'Profissional não pertence ao tenant.',
        422,
      );
    }
  }
  if (serviceId) {
    const s = await client.query(`SELECT 1 FROM services WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      serviceId,
      tenantId,
    ]);
    if (!s.rowCount) {
      throw new AppError('COMMISSION_RULE_SERVICE_INVALID', 'Serviço não pertence ao tenant.', 422);
    }
  }
}

async function loadServiceCatalogPrice(
  client: PoolClient,
  tenantId: string,
  serviceId: string,
): Promise<number> {
  const r = await client.query<{ price_cents: string }>(
    `SELECT price_cents::text FROM services WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, serviceId],
  );
  if (!r.rowCount) return 0;
  return Number(r.rows[0].price_cents);
}

/**
 * Chamado apenas na transição para completed (fluxo de completeAppointment).
 * Idempotente: ON CONFLICT DO NOTHING por (tenant_id, appointment_id).
 */
export async function createCommissionEntryForCompletedAppointment(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const enabled = await loadCommissionEnabledFromTenantSettings(client, tenantId);
  if (!enabled) return;

  const appt = await client.query<{
    status: string;
    professional_id: string;
    branch_id: string | null;
    service_id: string | null;
  }>(
    `SELECT status::text AS status, professional_id::text, branch_id::text, service_id::text
       FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  if (!appt.rowCount) return;
  const row = appt.rows[0];
  if (row.status !== 'completed') return;
  if (!row.service_id) return;

  const fin = await client.query<{ service_price_cents: string }>(
    `SELECT service_price_cents::text FROM appointment_financials
      WHERE tenant_id = $1 AND appointment_id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  const base =
    fin.rowCount && fin.rows[0]
      ? Number(fin.rows[0].service_price_cents)
      : await loadServiceCatalogPrice(client, tenantId, row.service_id);

  const rulesRes = await client.query<CommissionRuleRow>(
    `SELECT id::text, branch_id::text, professional_id::text, service_id::text,
            rule_kind::text AS rule_kind,
            percent_basis_points, fixed_cents, priority
       FROM commission_rules
      WHERE tenant_id = $1 AND active = true`,
    [tenantId],
  );
  const rules = rulesRes.rows.map((r) => ({
    ...r,
    rule_kind: r.rule_kind as 'percent' | 'fixed_cents',
  }));

  const best = resolveBestCommissionRule(
    {
      branch_id: row.branch_id,
      professional_id: row.professional_id,
      service_id: row.service_id,
    },
    rules,
  );

  const commissionCents = best ? computeCommissionCentsFromRule(base, best) : 0;
  const ruleId = best?.id ?? null;

  await client.query(
    `INSERT INTO commission_entries (
       tenant_id, appointment_id, professional_id, branch_id, service_id,
       commission_rule_id, base_amount_cents, commission_cents, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
     ON CONFLICT (tenant_id, appointment_id) DO NOTHING`,
    [
      tenantId,
      appointmentId,
      row.professional_id,
      row.branch_id,
      row.service_id,
      ruleId,
      base,
      commissionCents,
    ],
  );
}

export async function listCommissionRules(tenantId: string, activeOnly?: boolean) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM commission_rules
        WHERE tenant_id = $1
          AND ($2::boolean IS DISTINCT FROM true OR active = true)
        ORDER BY priority DESC, created_at DESC`,
      [tenantId, activeOnly === true],
    );
    return r.rows;
  });
}

export async function createCommissionRule(tenantId: string, raw: unknown, actorUserId: string | undefined) {
  const data = createCommissionRuleSchema.parse(raw);
  return withTenant(tenantId, async (client) => {
    await assertCommissionRuleReferencesBelongToTenant(
      client,
      tenantId,
      data.branch_id ?? null,
      data.professional_id ?? null,
      data.service_id ?? null,
    );

    const ins = await client.query(
      `INSERT INTO commission_rules (
         tenant_id, branch_id, professional_id, service_id,
         rule_kind, percent_basis_points, fixed_cents, priority, active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        tenantId,
        data.branch_id ?? null,
        data.professional_id ?? null,
        data.service_id ?? null,
        data.rule_kind,
        data.rule_kind === 'percent' ? data.percent_basis_points ?? null : null,
        data.rule_kind === 'fixed_cents' ? data.fixed_cents ?? null : null,
        data.priority,
        data.active,
      ],
    );
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'COMMISSION_RULE_CREATED',
      entity: 'commission_rule',
      entityId: (ins.rows[0] as { id: string }).id,
      after: ins.rows[0] as Record<string, unknown>,
    });
    return ins.rows[0];
  });
}

export async function patchCommissionRule(
  tenantId: string,
  ruleId: string,
  raw: unknown,
  actorUserId: string | undefined,
) {
  const data = patchCommissionRuleSchema.parse(raw);
  return withTenant(tenantId, async (client) => {
    const cur = await client.query(`SELECT * FROM commission_rules WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [
      tenantId,
      ruleId,
    ]);
    if (!cur.rowCount) throw new AppError('COMMISSION_RULE_NOT_FOUND', 'Regra não encontrada', 404);
    const b = cur.rows[0] as Record<string, unknown>;

    const ruleKind = (data.rule_kind ?? b.rule_kind) as string;
    const branchId = data.branch_id !== undefined ? data.branch_id : (b.branch_id as string | null);
    const professionalId =
      data.professional_id !== undefined ? data.professional_id : (b.professional_id as string | null);
    const serviceId = data.service_id !== undefined ? data.service_id : (b.service_id as string | null);
    const priority = data.priority !== undefined ? data.priority : Number(b.priority);
    const active = data.active !== undefined ? data.active : Boolean(b.active);

    let percentBp: number | null;
    let fixedCents: number | null;
    if (ruleKind === 'percent') {
      percentBp =
        data.percent_basis_points !== undefined
          ? data.percent_basis_points!
          : Number(b.percent_basis_points);
      fixedCents = null;
      if (percentBp == null || Number.isNaN(percentBp)) {
        throw new AppError('COMMISSION_RULE_INVALID', 'percent_basis_points obrigatório para percent.', 422);
      }
    } else {
      fixedCents =
        data.fixed_cents !== undefined ? data.fixed_cents! : Number(b.fixed_cents);
      percentBp = null;
      if (fixedCents == null || Number.isNaN(fixedCents)) {
        throw new AppError('COMMISSION_RULE_INVALID', 'fixed_cents obrigatório para fixed_cents.', 422);
      }
    }

    await assertCommissionRuleReferencesBelongToTenant(client, tenantId, branchId, professionalId, serviceId);

    const upd = await client.query(
      `UPDATE commission_rules SET
         branch_id = $3,
         professional_id = $4,
         service_id = $5,
         rule_kind = $6,
         percent_basis_points = $7,
         fixed_cents = $8,
         priority = $9,
         active = $10,
         updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        ruleId,
        branchId,
        professionalId,
        serviceId,
        ruleKind,
        percentBp,
        fixedCents,
        priority,
        active,
      ],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'COMMISSION_RULE_UPDATED',
      entity: 'commission_rule',
      entityId: ruleId,
      before: b,
      after: upd.rows[0] as Record<string, unknown>,
    });
    return upd.rows[0];
  });
}

export async function listCommissionEntries(
  tenantId: string,
  query: Record<string, unknown>,
) {
  const professionalId = query.professional_id ? String(query.professional_id) : null;
  const status = query.status ? String(query.status) : null;
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
  const offset = Math.max(0, Number(query.offset ?? 0));

  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT ce.*, a.completed_at
         FROM commission_entries ce
         INNER JOIN appointments a ON a.tenant_id = ce.tenant_id AND a.id = ce.appointment_id
        WHERE ce.tenant_id = $1
          AND ($2::uuid IS NULL OR ce.professional_id = $2)
          AND ($3::text IS NULL OR ce.status = $3)
        ORDER BY ce.created_at DESC
        LIMIT $4 OFFSET $5`,
      [tenantId, professionalId, status, limit, offset],
    );
    return r.rows;
  });
}

function assertCommissionStatusTransition(from: string, to: string) {
  const ok =
    (from === 'pending' && (to === 'approved' || to === 'cancelled')) ||
    (from === 'approved' && (to === 'paid' || to === 'cancelled')) ||
    from === to;
  if (!ok) {
    throw new AppError(
      'COMMISSION_STATUS_INVALID',
      `Transição de estado inválida: ${from} → ${to}`,
      409,
    );
  }
}

export async function patchCommissionEntryStatus(
  tenantId: string,
  entryId: string,
  raw: unknown,
  actorUserId: string | undefined,
) {
  const { status } = patchCommissionEntryStatusSchema.parse(raw);

  return withTenant(tenantId, async (client) => {
    const cur = await client.query<{ status: string }>(
      `SELECT status::text AS status FROM commission_entries WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, entryId],
    );
    if (!cur.rowCount) throw new AppError('COMMISSION_ENTRY_NOT_FOUND', 'Lançamento não encontrado', 404);
    const prev = String(cur.rows[0].status);
    assertCommissionStatusTransition(prev, status);
    if (prev === status) {
      const row = await client.query(`SELECT * FROM commission_entries WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        entryId,
      ]);
      return row.rows[0];
    }
    if (prev === 'paid' || prev === 'cancelled') {
      throw new AppError('COMMISSION_STATUS_FINAL', 'Estado final não pode ser alterado.', 409);
    }

    const upd = await client.query(
      `UPDATE commission_entries SET status = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, entryId, status],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'COMMISSION_ENTRY_STATUS',
      entity: 'commission_entry',
      entityId: entryId,
      before: { status: prev },
      after: { status },
    });

    return upd.rows[0];
  });
}

export async function computeCashClosingForDate(tenantId: string, dateStr: string) {
  return withTenant(tenantId, async (client) => {
    const tz = await loadTenantTimeZone(client, tenantId);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(dateStr)) throw new AppError('INVALID_DATE', 'Use YYYY-MM-DD.', 422);

    await client.query(`DELETE FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`, [
      tenantId,
      dateStr,
    ]);

    await client.query(
      `INSERT INTO cash_closings (
         tenant_id, branch_id, professional_id, closing_date,
         appointments_completed_count, revenue_service_cents,
         commission_pending_cents, commission_approved_cents, commission_paid_cents
       )
       SELECT
         a.tenant_id,
         a.branch_id,
         a.professional_id,
         $2::date,
         COUNT(*)::int,
         COALESCE(SUM(f.service_price_cents), 0)::bigint,
         COALESCE(SUM(CASE WHEN ce.status = 'pending' THEN ce.commission_cents ELSE 0 END), 0)::bigint,
         COALESCE(SUM(CASE WHEN ce.status = 'approved' THEN ce.commission_cents ELSE 0 END), 0)::bigint,
         COALESCE(SUM(CASE WHEN ce.status = 'paid' THEN ce.commission_cents ELSE 0 END), 0)::bigint
       FROM appointments a
       LEFT JOIN appointment_financials f ON f.tenant_id = a.tenant_id AND f.appointment_id = a.id
       LEFT JOIN commission_entries ce ON ce.tenant_id = a.tenant_id AND ce.appointment_id = a.id
       WHERE a.tenant_id = $1
         AND a.status::text = 'completed'
         AND a.completed_at IS NOT NULL
         AND (a.completed_at AT TIME ZONE $3)::date = $2::date
       GROUP BY a.tenant_id, a.branch_id, a.professional_id`,
      [tenantId, dateStr, tz],
    );

    const list = await client.query(`SELECT * FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`, [
      tenantId,
      dateStr,
    ]);
    return { date: dateStr, timezone: tz, rows: list.rows };
  });
}

export async function listCashClosings(tenantId: string, query: Record<string, unknown>) {
  const from = query.from ? String(query.from) : null;
  const to = query.to ? String(query.to) : null;
  if (!from || !to) throw new AppError('CLOSING_RANGE_REQUIRED', 'Informe from e to (YYYY-MM-DD).', 422);
  dateRangeQuerySchema.parse({ from, to });

  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM cash_closings
        WHERE tenant_id = $1 AND closing_date >= $2::date AND closing_date <= $3::date
        ORDER BY closing_date DESC, professional_id::text`,
      [tenantId, from, to],
    );
    return r.rows;
  });
}

/** Totais por profissional no intervalo (datas por completed_at no fuso do tenant). */
export async function reportCommissionTotalsByProfessional(
  tenantId: string,
  query: Record<string, unknown>,
) {
  const from = String(query.from ?? '');
  const to = String(query.to ?? '');
  dateRangeQuerySchema.parse({ from, to });

  return withTenant(tenantId, async (client) => {
    const tz = await loadTenantTimeZone(client, tenantId);
    const r = await client.query<{
      professional_id: string;
      professional_name: string;
      entries_count: string;
      pending_cents: string;
      approved_cents: string;
      paid_cents: string;
      cancelled_cents: string;
      total_accrued_cents: string;
    }>(
      `SELECT
         ce.professional_id::text,
         p.name AS professional_name,
         COUNT(*)::text AS entries_count,
         COALESCE(SUM(CASE WHEN ce.status = 'pending' THEN ce.commission_cents ELSE 0 END), 0)::text AS pending_cents,
         COALESCE(SUM(CASE WHEN ce.status = 'approved' THEN ce.commission_cents ELSE 0 END), 0)::text AS approved_cents,
         COALESCE(SUM(CASE WHEN ce.status = 'paid' THEN ce.commission_cents ELSE 0 END), 0)::text AS paid_cents,
         COALESCE(SUM(CASE WHEN ce.status = 'cancelled' THEN ce.commission_cents ELSE 0 END), 0)::text AS cancelled_cents,
         COALESCE(SUM(CASE WHEN ce.status <> 'cancelled' THEN ce.commission_cents ELSE 0 END), 0)::text AS total_accrued_cents
       FROM commission_entries ce
       INNER JOIN appointments a ON a.tenant_id = ce.tenant_id AND a.id = ce.appointment_id
       INNER JOIN professionals p ON p.tenant_id = ce.tenant_id AND p.id = ce.professional_id
       WHERE ce.tenant_id = $1
         AND a.completed_at IS NOT NULL
         AND (a.completed_at AT TIME ZONE $4)::date >= $2::date
         AND (a.completed_at AT TIME ZONE $4)::date <= $3::date
       GROUP BY ce.professional_id, p.name
       ORDER BY p.name ASC`,
      [tenantId, from, to, tz],
    );

    return {
      from,
      to,
      timezone: tz,
      professionals: r.rows.map((row) => ({
        professional_id: row.professional_id,
        professional_name: row.professional_name,
        entries_count: Number(row.entries_count),
        pending_cents: Number(row.pending_cents),
        approved_cents: Number(row.approved_cents),
        paid_cents: Number(row.paid_cents),
        cancelled_cents: Number(row.cancelled_cents),
        total_accrued_cents: Number(row.total_accrued_cents),
      })),
    };
  });
}
