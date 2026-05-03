import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';
import {
  CreateServiceBody,
  createServiceBodySchema,
  UpdateServiceBody,
  updateServiceBodySchema,
} from '../catalog/dto.js';

/** Lista serviços. Painel público / bot: apenas ativos (`allowInactiveListing` falso para viewer/operador). */
export async function listServices(
  tenantId: string,
  rawQuery: Record<string, unknown>,
  options: { allowInactiveListing?: boolean } = {},
) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const inactiveRequested =
    typeof rawQuery.active === 'string' && rawQuery.active.toLowerCase() === 'false';

  if (inactiveRequested && !options.allowInactiveListing) {
    throw new AppError(
      'OPERATIONAL_CATALOG_ONLY',
      'Apenas perfis gerenciais podem listar serviços inativos. O catálogo operacional só expõe ativos.',
      400,
    );
  }

  const activeOnly = !inactiveRequested;

  return withTenant(tenantId, async (client) => {
    const filter = activeOnly ? 'AND s.active = true' : '';
    const [data, count] = await Promise.all([
      client.query(
        `SELECT s.id, s.name, s.duration_minutes, s.price_cents, s.active,
                s.created_at, s.updated_at, s.category_id,
                s.recall_kind, s.recall_min_days, s.recall_max_days,
                COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
                COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes,
                sc.name AS category_name
           FROM services s
           LEFT JOIN service_categories sc
             ON sc.id = s.category_id AND sc.tenant_id = s.tenant_id AND sc.active = true
          WHERE s.tenant_id = $1 ${filter}
          ORDER BY sc.sort_order ASC NULLS LAST, sc.name ASC NULLS LAST, s.name ASC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM services s WHERE s.tenant_id = $1 ${filter}`, [tenantId]),
    ]);
    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function getServiceById(
  tenantId: string,
  serviceId: string,
  options: { allowInactiveDetail?: boolean } = {},
) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT s.id, s.name, s.duration_minutes, s.price_cents, s.active, s.created_at, s.updated_at,
              s.category_id, s.recall_kind, s.recall_min_days, s.recall_max_days,
              COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
              COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes,
              sc.name AS category_name
         FROM services s
         LEFT JOIN service_categories sc
           ON sc.id = s.category_id AND sc.tenant_id = s.tenant_id AND sc.active = true
        WHERE s.tenant_id = $1 AND s.id = $2
        LIMIT 1`,
      [tenantId, serviceId],
    );
    if (!result.rowCount) throw new AppError('SERVICE_NOT_FOUND', 'Serviço não encontrado', 404);
    const row = result.rows[0] as Record<string, unknown>;
    if (row.active === false && !options.allowInactiveDetail) {
      throw new AppError('SERVICE_NOT_FOUND', 'Serviço não encontrado', 404);
    }
    return row;
  });
}

export async function createService(
  tenantId: string,
  input: CreateServiceBody,
  actorUserId?: string,
) {
  const data = createServiceBodySchema.parse(input);
  return withTenant(tenantId, async (client) => {
    if (data.recall_kind === 'estetica_quimica') {
      if (data.recall_min_days == null || data.recall_max_days == null) {
        throw new AppError(
          'RECALL_WINDOW_REQUIRED',
          'Serviços estética/química exigem recall_min_days e recall_max_days no cadastro.',
          422,
        );
      }
    }
    if (data.recall_min_days != null && data.recall_max_days != null && data.recall_min_days > data.recall_max_days) {
      throw new AppError('RECALL_WINDOW_INVALID', 'recall_min_days não pode ser maior que recall_max_days', 422);
    }
    if (data.category_id) {
      const cat = await client.query(
        `SELECT 1 FROM service_categories WHERE tenant_id = $1 AND id = $2 AND active = true LIMIT 1`,
        [tenantId, data.category_id],
      );
      if (!cat.rowCount) {
        throw new AppError('CATEGORY_NOT_FOUND', 'Categoria inexistente ou inativa.', 404);
      }
    }

    const result = await client.query(
      `INSERT INTO services (
          tenant_id, name, duration_minutes, price_cents, active, category_id,
          buffer_before_minutes, buffer_after_minutes,
          recall_kind, recall_min_days, recall_max_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, name, duration_minutes, price_cents, active, category_id,
                 buffer_before_minutes, buffer_after_minutes,
                 recall_kind, recall_min_days, recall_max_days, created_at`,
      [
        tenantId,
        data.name,
        data.duration_minutes,
        data.price_cents,
        data.active,
        data.category_id ?? null,
        data.buffer_before_minutes ?? 0,
        data.buffer_after_minutes ?? 0,
        data.recall_kind ?? null,
        data.recall_min_days ?? null,
        data.recall_max_days ?? null,
      ],
    );
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'SERVICE_CREATED',
      entity: 'service',
      entityId: result.rows[0].id as string,
      after: { name: data.name, duration_minutes: data.duration_minutes, price_cents: data.price_cents },
    });
    return result.rows[0];
  });
}

export async function updateService(
  tenantId: string,
  serviceId: string,
  input: UpdateServiceBody,
  actorUserId?: string,
) {
  const data = updateServiceBodySchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT id, name, recall_kind, recall_min_days, recall_max_days
         FROM services WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, serviceId],
    );
    if (!current.rowCount) throw new AppError('SERVICE_NOT_FOUND', 'Serviço não encontrado', 404);
    const cur = current.rows[0] as {
      recall_kind: string | null;
      recall_min_days: number | null;
      recall_max_days: number | null;
    };

    const nextKind = data.recall_kind !== undefined ? data.recall_kind : cur.recall_kind;
    const nextMin = data.recall_min_days !== undefined ? data.recall_min_days : cur.recall_min_days;
    const nextMax = data.recall_max_days !== undefined ? data.recall_max_days : cur.recall_max_days;

    if (nextKind === 'estetica_quimica') {
      if (nextMin == null || nextMax == null) {
        throw new AppError(
          'RECALL_WINDOW_REQUIRED',
          'Serviços estética/química exigem recall_min_days e recall_max_days no cadastro.',
          422,
        );
      }
    }
    if (nextMin != null && nextMax != null && nextMin > nextMax) {
      throw new AppError('RECALL_WINDOW_INVALID', 'recall_min_days não pode ser maior que recall_max_days', 422);
    }

    if (data.category_id !== undefined && data.category_id !== null) {
      const cat = await client.query(
        `SELECT 1 FROM service_categories WHERE tenant_id = $1 AND id = $2 AND active = true LIMIT 1`,
        [tenantId, data.category_id],
      );
      if (!cat.rowCount) {
        throw new AppError('CATEGORY_NOT_FOUND', 'Categoria inexistente ou inativa.', 404);
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.duration_minutes !== undefined) {
      setClauses.push(`duration_minutes = $${idx++}`);
      params.push(data.duration_minutes);
    }
    if (data.price_cents !== undefined) {
      setClauses.push(`price_cents = $${idx++}`);
      params.push(data.price_cents);
    }
    if (data.active !== undefined) {
      setClauses.push(`active = $${idx++}`);
      params.push(data.active);
    }
    if (data.category_id !== undefined) {
      setClauses.push(`category_id = $${idx++}`);
      params.push(data.category_id);
    }
    if (data.buffer_before_minutes !== undefined) {
      setClauses.push(`buffer_before_minutes = $${idx++}`);
      params.push(data.buffer_before_minutes);
    }
    if (data.buffer_after_minutes !== undefined) {
      setClauses.push(`buffer_after_minutes = $${idx++}`);
      params.push(data.buffer_after_minutes);
    }
    if (data.recall_kind !== undefined) {
      setClauses.push(`recall_kind = $${idx++}`);
      params.push(data.recall_kind);
    }
    if (data.recall_min_days !== undefined) {
      setClauses.push(`recall_min_days = $${idx++}`);
      params.push(data.recall_min_days);
    }
    if (data.recall_max_days !== undefined) {
      setClauses.push(`recall_max_days = $${idx++}`);
      params.push(data.recall_max_days);
    }

    if (setClauses.length === 0) throw new AppError('NO_CHANGES', 'Nenhum campo para atualizar', 400);

    params.push(tenantId, serviceId);
    const result = await client.query(
      `UPDATE services SET ${setClauses.join(', ')}, updated_at = now()
        WHERE tenant_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      params,
    );
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'SERVICE_UPDATED',
      entity: 'service',
      entityId: serviceId,
      before: { name: current.rows[0].name },
      after: data,
    });
    return result.rows[0];
  });
}
