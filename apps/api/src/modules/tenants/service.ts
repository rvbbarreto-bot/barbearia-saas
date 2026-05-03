import { z } from 'zod';
import { pool } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';

const createTenantSchema = z.object({
  legal_name: z.string().min(2).max(200),
  trade_name: z.string().min(2).max(200),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  document: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  plan_code: z.string().default('trial'),
  timezone: z.string().default('America/Sao_Paulo'),
});

const updateTenantSchema = z.object({
  trade_name: z.string().min(2).max(200).optional(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  plan_code: z.string().optional(),
  plan_limits: z.record(z.string(), z.unknown()).optional(),
  timezone: z.string().optional(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(),
});

export async function listTenants(rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const status = rawQuery.status as string | undefined;

  const whereClause = status ? 'WHERE status = $3' : '';
  const mainParams: unknown[] = [limit, offset];
  if (status) mainParams.push(status);

  const [data, count] = await Promise.all([
    pool.query(
      `SELECT id, legal_name, trade_name, slug, plan_code, status, timezone, created_at
         FROM tenants ${whereClause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      mainParams,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM tenants ${whereClause}`,
      status ? [status] : [],
    ),
  ]);

  return { data: data.rows, total: count.rows[0].total as number, page, limit };
}

export async function getTenantById(tenantId: string) {
  const result = await pool.query(
    `SELECT id, legal_name, trade_name, slug, document, plan_code, plan_limits,
            contact_email, contact_phone, status, timezone, created_at, updated_at
       FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  if (!result.rowCount) throw new AppError('TENANT_NOT_FOUND', 'Tenant não encontrado', 404);
  return result.rows[0];
}

export async function createTenant(input: z.infer<typeof createTenantSchema>) {
  const data = createTenantSchema.parse(input);
  const result = await pool.query(
    `INSERT INTO tenants (legal_name, trade_name, slug, document, contact_email,
                          contact_phone, plan_code, timezone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, legal_name, trade_name, slug, plan_code, status, timezone, created_at`,
    [
      data.legal_name, data.trade_name, data.slug ?? null, data.document ?? null,
      data.contact_email ?? null, data.contact_phone ?? null, data.plan_code, data.timezone,
    ],
  );
  return result.rows[0];
}

export async function updateTenant(tenantId: string, input: z.infer<typeof updateTenantSchema>) {
  const data = updateTenantSchema.parse(input);

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fields: Array<[string, unknown]> = [
    ['trade_name', data.trade_name], ['slug', data.slug],
    ['contact_email', data.contact_email], ['contact_phone', data.contact_phone],
    ['plan_code', data.plan_code], ['timezone', data.timezone], ['status', data.status],
    ['plan_limits', data.plan_limits ? JSON.stringify(data.plan_limits) : undefined],
  ];

  for (const [col, val] of fields) {
    if (val !== undefined) {
      setClauses.push(`${col} = $${idx++}`);
      params.push(val);
    }
  }

  if (setClauses.length === 0) throw new AppError('NO_CHANGES', 'Nenhum campo para atualizar', 400);

  params.push(tenantId);
  const result = await pool.query(
    `UPDATE tenants SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (!result.rowCount) throw new AppError('TENANT_NOT_FOUND', 'Tenant não encontrado', 404);
  return result.rows[0];
}
