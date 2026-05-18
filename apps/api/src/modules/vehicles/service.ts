import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeOperationalAuditEvent, effectiveCorrelationId } from '../../shared/operational-audit.js';
import { normalizePlate } from './plate.js';
import { createVehicleSchema, updateVehicleSchema } from './schemas.js';

export type VehicleCaller = {
  sub?: string;
  role?: string;
  requestId?: string;
  correlationId?: string;
};

function mapPgVehicleError(e: unknown): never {
  const err = e as { code?: string; constraint?: string };
  if (err.code === '23505' && err.constraint?.includes('normalized_plate')) {
    throw new AppError('VEHICLE_PLATE_ALREADY_EXISTS', 'Placa já cadastrada neste tenant.', 409);
  }
  throw e;
}

export async function listVehicles(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const search = (rawQuery.search as string | undefined)?.trim();
  const customerId = rawQuery.customer_id as string | undefined;
  const activeOnly = rawQuery.active !== 'false';

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (customerId) {
      filters.push(`customer_id = $${i++}`);
      params.push(customerId);
    }
    if (activeOnly) {
      filters.push('is_active = true');
    }
    if (search) {
      filters.push(
        `(normalized_plate ILIKE $${i} OR model ILIKE $${i} OR brand ILIKE $${i} OR plate ILIKE $${i})`,
      );
      params.push(`%${search.replace(/[\s-]/g, '').toUpperCase()}%`);
      i++;
    }

    const where = filters.join(' AND ');
    const [data, count] = await Promise.all([
      client.query(
        `SELECT id, customer_id, plate, brand, model, color, vehicle_type, notes, is_active, created_at, updated_at
           FROM customer_vehicles WHERE ${where}
          ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM customer_vehicles WHERE ${where}`, params),
    ]);
    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function getVehicleById(tenantId: string, vehicleId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, customer_id, plate, brand, model, color, vehicle_type, notes, is_active, created_at, updated_at
         FROM customer_vehicles WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, vehicleId],
    );
    if (!r.rowCount) throw new AppError('VEHICLE_NOT_FOUND', 'Veículo não encontrado.', 404);
    return r.rows[0];
  });
}

export async function createVehicle(
  tenantId: string,
  input: unknown,
  caller?: VehicleCaller,
) {
  const data = createVehicleSchema.parse(input);
  const normalized = normalizePlate(data.plate);

  return withTenant(tenantId, async (client) => {
    const cust = await client.query(
      `SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, data.customer_id],
    );
    if (!cust.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);

    let result;
    try {
      result = await client.query(
        `INSERT INTO customer_vehicles
           (tenant_id, customer_id, plate, normalized_plate, brand, model, color, vehicle_type, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          tenantId,
          data.customer_id,
          data.plate ?? null,
          normalized,
          data.brand ?? null,
          data.model ?? null,
          data.color ?? null,
          data.vehicle_type,
          data.notes ?? null,
        ],
      );
    } catch (e) {
      mapPgVehicleError(e);
    }

    const row = result!.rows[0];
    const correlationId = effectiveCorrelationId(caller?.correlationId, row.id as string);
    await writeOperationalAuditEvent(client, {
      tenantId,
      entityType: 'vehicle',
      entityId: row.id as string,
      eventType: 'vehicle_created',
      actorUserId: caller?.sub ?? null,
      actorRole: caller?.role ?? null,
      requestId: caller?.requestId ?? null,
      correlationId,
      metadata: {
        customer_id: data.customer_id,
        plate: row.plate,
        vehicle_type: row.vehicle_type,
      },
    });
    return row;
  });
}

export async function updateVehicle(
  tenantId: string,
  vehicleId: string,
  input: unknown,
  caller?: VehicleCaller,
) {
  const patch = updateVehicleSchema.parse(input);

  return withTenant(tenantId, async (client) => {
    const cur = await client.query(
      `SELECT * FROM customer_vehicles WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, vehicleId],
    );
    if (!cur.rowCount) throw new AppError('VEHICLE_NOT_FOUND', 'Veículo não encontrado.', 404);

    const normalized =
      patch.plate !== undefined ? normalizePlate(patch.plate) : (cur.rows[0].normalized_plate as string | null);

    let updated;
    try {
      updated = await client.query(
        `UPDATE customer_vehicles SET
            plate = COALESCE($3, plate),
            normalized_plate = $4,
            brand = COALESCE($5, brand),
            model = COALESCE($6, model),
            color = COALESCE($7, color),
            vehicle_type = COALESCE($8, vehicle_type),
            notes = COALESCE($9, notes),
            is_active = COALESCE($10, is_active),
            updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING *`,
        [
          tenantId,
          vehicleId,
          patch.plate ?? null,
          normalized,
          patch.brand ?? null,
          patch.model ?? null,
          patch.color ?? null,
          patch.vehicle_type ?? null,
          patch.notes ?? null,
          patch.is_active ?? null,
        ],
      );
    } catch (e) {
      mapPgVehicleError(e);
    }

    const row = updated!.rows[0];
    await writeOperationalAuditEvent(client, {
      tenantId,
      entityType: 'vehicle',
      entityId: vehicleId,
      eventType: 'vehicle_updated',
      actorUserId: caller?.sub ?? null,
      actorRole: caller?.role ?? null,
      requestId: caller?.requestId ?? null,
      correlationId: effectiveCorrelationId(caller?.correlationId, vehicleId),
      metadata: {
        is_active: row.is_active,
        plate: row.plate,
      },
    });
    return row;
  });
}

export async function assertVehicleBelongsToCustomer(
  client: PoolClient,
  tenantId: string,
  vehicleId: string,
  customerId: string,
): Promise<Record<string, unknown>> {
  const r = await client.query(
    `SELECT * FROM customer_vehicles
      WHERE tenant_id = $1 AND id = $2 AND customer_id = $3 AND is_active = true
      LIMIT 1`,
    [tenantId, vehicleId, customerId],
  );
  if (!r.rowCount) {
    throw new AppError(
      'VEHICLE_NOT_FOUND',
      'Veículo não encontrado, inativo ou não pertence ao cliente.',
      404,
    );
  }
  return r.rows[0];
}
