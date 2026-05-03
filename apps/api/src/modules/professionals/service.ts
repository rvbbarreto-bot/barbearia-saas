import { z } from 'zod';
import { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';
import {
  addProfessionalServicesBodySchema,
  replaceProfessionalServicesBodySchema,
} from '../catalog/dto.js';

export const createProfessionalSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  phone: z.string().optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  service_ids: z.array(z.string().uuid()).optional(),
});

export const updateProfessionalSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  active: z.boolean().optional(),
  service_ids: z.array(z.string().uuid()).optional(),
});

async function validateActiveServiceIdsForTenant(
  client: PoolClient,
  tenantId: string,
  serviceIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(serviceIds)];
  if (!uniqueIds.length) return;

  const r = await client.query(
    `SELECT id FROM services
      WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND active = true`,
    [tenantId, uniqueIds],
  );

  if (r.rows.length !== uniqueIds.length) {
    throw new AppError(
      'INVALID_SERVICE_IDS',
      'Todos os serviços vinculados devem existir no tenant e estar ativos.',
      422,
    );
  }
}

export async function listProfessionals(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const activeOnly = rawQuery.active !== 'false';

  return withTenant(tenantId, async (client) => {
    const filter = activeOnly ? 'AND p.active = true' : '';
    const [data, count] = await Promise.all([
      client.query(
        `SELECT p.id, p.name, p.slug, p.phone, p.timezone, p.active, p.created_at,
                COALESCE(json_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '[]') AS service_ids
           FROM professionals p
           LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.tenant_id = $1
          WHERE p.tenant_id = $1 ${filter}
          GROUP BY p.id
          ORDER BY p.name ASC LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      client.query(
        `SELECT COUNT(*)::int AS total FROM professionals p WHERE p.tenant_id = $1 ${filter}`,
        [tenantId],
      ),
    ]);
    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function getProfessionalById(tenantId: string, professionalId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT p.id, p.name, p.slug, p.phone, p.timezone, p.active,
              p.calendar_provider, p.created_at, p.updated_at,
              COALESCE(json_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '[]') AS service_ids
         FROM professionals p
         LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.tenant_id = $1
        WHERE p.tenant_id = $1 AND p.id = $2
        GROUP BY p.id LIMIT 1`,
      [tenantId, professionalId],
    );
    if (!result.rowCount) throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado', 404);
    return result.rows[0];
  });
}

export async function createProfessional(
  tenantId: string,
  input: z.infer<typeof createProfessionalSchema>,
  actorUserId?: string,
) {
  const data = createProfessionalSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    if (data.service_ids?.length) await validateActiveServiceIdsForTenant(client, tenantId, data.service_ids);

    const result = await client.query(
      `INSERT INTO professionals (tenant_id, name, slug, phone, timezone)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, slug, phone, timezone, active, created_at`,
      [tenantId, data.name, data.slug, data.phone ?? null, data.timezone],
    );
    const professional = result.rows[0];

    if (data.service_ids?.length) {
      for (const serviceId of data.service_ids) {
        await client.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [tenantId, professional.id, serviceId],
        );
      }
    }

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_CREATED',
      entity: 'professional',
      entityId: professional.id as string,
      after: { name: data.name, slug: data.slug },
    });
    return { ...professional, service_ids: data.service_ids ?? [] };
  });
}

export async function updateProfessional(
  tenantId: string,
  professionalId: string,
  input: z.infer<typeof updateProfessionalSchema>,
  actorUserId?: string,
) {
  const data = updateProfessionalSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT id FROM professionals WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, professionalId],
    );
    if (!current.rowCount) throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado', 404);

    if (data.service_ids !== undefined) await validateActiveServiceIdsForTenant(client, tenantId, data.service_ids);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.slug !== undefined) {
      setClauses.push(`slug = $${idx++}`);
      params.push(data.slug);
    }
    if (data.phone !== undefined) {
      setClauses.push(`phone = $${idx++}`);
      params.push(data.phone);
    }
    if (data.timezone !== undefined) {
      setClauses.push(`timezone = $${idx++}`);
      params.push(data.timezone);
    }
    if (data.active !== undefined) {
      setClauses.push(`active = $${idx++}`);
      params.push(data.active);
    }

    if (setClauses.length > 0) {
      params.push(tenantId, professionalId);
      await client.query(
        `UPDATE professionals SET ${setClauses.join(', ')}, updated_at = now()
          WHERE tenant_id = $${idx} AND id = $${idx + 1} RETURNING *`,
        params,
      );
    }

    if (data.service_ids !== undefined) {
      await client.query(`DELETE FROM professional_services WHERE tenant_id = $1 AND professional_id = $2`, [
        tenantId,
        professionalId,
      ]);
      for (const serviceId of data.service_ids) {
        await client.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [tenantId, professionalId, serviceId],
        );
      }
    }

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_UPDATED',
      entity: 'professional',
      entityId: professionalId,
      after: data,
    });

    const refreshed = await client.query(
      `SELECT p.id, p.name, p.slug, p.phone, p.timezone, p.active,
              p.calendar_provider, p.created_at, p.updated_at,
              COALESCE(json_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '[]') AS service_ids
         FROM professionals p
         LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.tenant_id = $1
        WHERE p.tenant_id = $1 AND p.id = $2
        GROUP BY p.id LIMIT 1`,
      [tenantId, professionalId],
    );
    return refreshed.rows[0];
  });
}

/** Substitui o conjunto professional_services inteiro pelo payload. */
export async function replaceProfessionalServices(
  tenantId: string,
  professionalId: string,
  body: unknown,
  actorUserId?: string,
) {
  const parsed = replaceProfessionalServicesBodySchema.parse(body);
  return updateProfessional(tenantId, professionalId, { service_ids: parsed.service_ids }, actorUserId);
}

/** Adiciona vínculos (idempotente; ignora já existentes). */
export async function addProfessionalServices(
  tenantId: string,
  professionalId: string,
  body: unknown,
  actorUserId?: string,
) {
  const parsed = addProfessionalServicesBodySchema.parse(body);

  return withTenant(tenantId, async (client) => {
    const prof = await client.query(`SELECT id FROM professionals WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [
      tenantId,
      professionalId,
    ]);
    if (!prof.rowCount) throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado', 404);

    const uniqueIds = [...new Set(parsed.service_ids)];
    await validateActiveServiceIdsForTenant(client, tenantId, uniqueIds);

    for (const serviceId of uniqueIds) {
      await client.query(
        `INSERT INTO professional_services (tenant_id, professional_id, service_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [tenantId, professionalId, serviceId],
      );
    }

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_SERVICES_ADDED',
      entity: 'professional',
      entityId: professionalId,
      after: { added_service_ids: uniqueIds },
    });

    const refreshed = await client.query(
      `SELECT p.id, p.name, p.slug, p.phone, p.timezone, p.active,
              p.calendar_provider, p.created_at, p.updated_at,
              COALESCE(json_agg(ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL), '[]') AS service_ids
         FROM professionals p
         LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.tenant_id = $1
        WHERE p.tenant_id = $1 AND p.id = $2
        GROUP BY p.id LIMIT 1`,
      [tenantId, professionalId],
    );
    return refreshed.rows[0];
  });
}
