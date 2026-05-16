import { withTenant } from '../../infra/db/pool.js';
import { mapOutboxRow, type OutboxMessageRowDb } from '../outbox/outbox-row-mapper.js';
import type { OperationalStatusQuery } from './operational-status-query.js';
import { probeEvolution, probeN8n } from './probe-external.js';
import {
  classifyOutboxError,
  sanitizeInfraError,
  sanitizeLastErrorForOperator,
  type HealthState,
} from './sanitize-error.js';

export type { HealthState };

export type OperationalStatusResponse = {
  generated_at: string;
  infrastructure: {
    api: 'ok';
    database: HealthState;
    redis: HealthState;
    outbox_worker: HealthState;
    n8n: HealthState;
    evolution: HealthState;
    errors: {
      database: string | null;
      redis: string | null;
      n8n: string | null;
      evolution: string | null;
    };
  };
  outbox: {
    counts: Record<string, number>;
    recent_errors: Array<{
      id: string;
      status: string;
      error_class: ReturnType<typeof classifyOutboxError>;
      last_error: string | null;
      correlation_id: string | null;
      appointment_id: string | null;
      destination: string | null;
      created_at: string;
    }>;
    filters_applied: OperationalStatusQuery;
  };
};

const OUTBOX_STATUSES = ['pending', 'processing', 'sent', 'failed', 'dead'] as const;

export async function probeInfrastructure(): Promise<OperationalStatusResponse['infrastructure']> {
  let database: HealthState = 'ok';
  let redis: HealthState = 'ok';
  let databaseError: string | null = null;
  let redisError: string | null = null;

  try {
    const { pool } = await import('../../infra/db/pool.js');
    await pool.query('SELECT 1');
  } catch (err) {
    database = 'degraded';
    databaseError = sanitizeInfraError(err);
  }

  try {
    const { redis: redisClient } = await import('../../infra/redis/client.js');
    await redisClient.ping();
  } catch (err) {
    redis = 'degraded';
    redisError = sanitizeInfraError(err);
  }

  const [n8nProbe, evolutionProbe] = await Promise.all([probeN8n(), probeEvolution()]);
  const outbox_worker: HealthState = redis === 'ok' ? 'ok' : 'degraded';

  return {
    api: 'ok',
    database,
    redis,
    outbox_worker,
    n8n: n8nProbe.state,
    evolution: evolutionProbe.state,
    errors: {
      database: databaseError,
      redis: redisError,
      n8n: n8nProbe.error,
      evolution: evolutionProbe.error,
    },
  };
}

export function emptyOutboxCounts(): Record<string, number> {
  return Object.fromEntries(OUTBOX_STATUSES.map((s) => [s, 0]));
}

export async function getTenantOutboxOperationalSnapshot(
  tenantId: string,
  query: OperationalStatusQuery = {},
) {
  return withTenant(tenantId, async (client) => {
    const countsR = await client.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count
         FROM message_outbox
        WHERE tenant_id = $1
        GROUP BY status`,
      [tenantId],
    );

    const counts = emptyOutboxCounts();
    for (const row of countsR.rows) {
      if (row.status in counts) {
        counts[row.status] = row.count;
      }
    }

    const filters: string[] = ['mo.tenant_id = $1', "mo.status IN ('failed', 'dead')"];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (query.status) {
      filters.push(`mo.status = $${idx++}`);
      params.push(query.status);
    }
    if (query.from) {
      filters.push(`mo.updated_at >= $${idx++}::timestamptz`);
      params.push(query.from);
    }
    if (query.to) {
      filters.push(`mo.updated_at <= $${idx++}::timestamptz`);
      params.push(query.to);
    }
    if (query.correlation_id) {
      filters.push(`mo.correlation_id = $${idx++}`);
      params.push(query.correlation_id);
    }

    const errorsR = await client.query(
      `SELECT mo.id, mo.tenant_id, mo.channel, mo.status, mo.attempts, mo.max_attempts, mo.last_error,
              mo.correlation_id, mo.customer_id, mo.idempotency_key, mo.created_at, mo.updated_at, mo.sent_at,
              mo.payload, mo.metadata
         FROM message_outbox mo
        WHERE ${filters.join(' AND ')}
        ORDER BY mo.updated_at DESC
        LIMIT 20`,
      params,
    );

    const recent_errors = errorsR.rows.map((row) => {
      const mapped = mapOutboxRow(row as OutboxMessageRowDb);
      const sanitized = sanitizeLastErrorForOperator(mapped.last_error);
      return {
        id: mapped.id,
        status: mapped.status,
        error_class: classifyOutboxError(mapped.last_error),
        last_error: sanitized,
        correlation_id: mapped.correlation_id,
        appointment_id: mapped.appointment_id,
        destination: mapped.destination,
        created_at: mapped.created_at,
      };
    });

    return { counts, recent_errors };
  });
}

export async function getOperationalStatus(
  tenantId: string,
  query: OperationalStatusQuery = {},
): Promise<OperationalStatusResponse> {
  const [infrastructure, outbox] = await Promise.all([
    probeInfrastructure(),
    getTenantOutboxOperationalSnapshot(tenantId, query),
  ]);

  return {
    generated_at: new Date().toISOString(),
    infrastructure,
    outbox: {
      ...outbox,
      filters_applied: query,
    },
  };
}
