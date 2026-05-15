import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(8).max(30),
  email: z.string().email().optional(),
  whatsapp_opt_in: z.boolean().default(false),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  whatsapp_opt_in: z.boolean().optional(),
  whatsapp_opt_out: z.boolean().optional(),
  /** Prioridade na fila de espera (política do tenant). */
  is_vip: z.boolean().optional(),
});

export async function listCustomers(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const search = rawQuery.search as string | undefined;

  return withTenant(tenantId, async (client) => {
    const searchPattern = search ? `%${search}%` : undefined;
    const listSearchFilter = searchPattern
      ? `AND (name ILIKE $4 OR phone ILIKE $4 OR email ILIKE $4)`
      : '';
    const countSearchFilter = searchPattern
      ? `AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`
      : '';
    const listParams: unknown[] = [tenantId, limit, offset];
    if (searchPattern) listParams.push(searchPattern);

    const [data, count] = await Promise.all([
      client.query(
        `SELECT id, name, phone, email, whatsapp_opt_in, whatsapp_opt_out, is_vip, last_interaction_at, created_at
           FROM customers WHERE tenant_id = $1 ${listSearchFilter}
          ORDER BY name ASC NULLS LAST LIMIT $2 OFFSET $3`,
        listParams,
      ),
      client.query(
        `SELECT COUNT(*)::int AS total FROM customers WHERE tenant_id = $1 ${countSearchFilter}`,
        searchPattern ? [tenantId, searchPattern] : [tenantId],
      ),
    ]);
    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function getCustomerById(tenantId: string, customerId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, name, phone, email, whatsapp_opt_in, whatsapp_opt_out,
              last_interaction_at, created_at, updated_at
         FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, customerId],
    );
    if (!result.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);
    return result.rows[0];
  });
}

export async function createCustomer(
  tenantId: string,
  input: z.infer<typeof createCustomerSchema>,
  actorUserId?: string,
) {
  const data = createCustomerSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO customers (tenant_id, name, phone, email, whatsapp_opt_in)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, phone) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, customers.name),
             email = COALESCE(EXCLUDED.email, customers.email),
             updated_at = now()
       RETURNING id, name, phone, email, whatsapp_opt_in, created_at`,
      [tenantId, data.name ?? null, data.phone, data.email ?? null, data.whatsapp_opt_in],
    );
    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CUSTOMER_UPSERTED',
      entity: 'customer', entityId: result.rows[0].id as string,
      after: { phone: data.phone },
    });
    return result.rows[0];
  });
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  input: z.infer<typeof updateCustomerSchema>,
  actorUserId?: string,
) {
  const data = updateCustomerSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, customerId],
    );
    if (!current.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(data.name); }
    if (data.email !== undefined) { setClauses.push(`email = $${idx++}`); params.push(data.email); }
    if (data.whatsapp_opt_in !== undefined) { setClauses.push(`whatsapp_opt_in = $${idx++}`); params.push(data.whatsapp_opt_in); }
    if (data.whatsapp_opt_out !== undefined) {
      setClauses.push(`whatsapp_opt_out = $${idx++}`);
      params.push(data.whatsapp_opt_out);
      if (data.whatsapp_opt_out) {
        setClauses.push(`whatsapp_opt_in = false`);
      }
    }
    if (data.is_vip !== undefined) {
      setClauses.push(`is_vip = $${idx++}`);
      params.push(data.is_vip);
    }

    if (setClauses.length === 0) throw new AppError('NO_CHANGES', 'Nenhum campo para atualizar', 400);

    params.push(tenantId, customerId);
    const result = await client.query(
      `UPDATE customers SET ${setClauses.join(', ')}, updated_at = now()
        WHERE tenant_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      params,
    );
    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CUSTOMER_UPDATED',
      entity: 'customer', entityId: customerId, after: data,
    });
    return result.rows[0];
  });
}
