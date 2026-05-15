/**
 * outbox.integration.test.ts
 *
 * Testes de integração da fila message_outbox.
 * Requer: DATABASE_URL apontando para PostgreSQL com schema aplicado.
 *
 * Cobertura:
 *   - enqueueOutboundMessage: insere corretamente
 *   - Idempotência (ON CONFLICT DO NOTHING por tenant+key)
 *   - processRow: pending → sent (Evolution mock)
 *   - processRow: pending → pending (falha + retry agendado)
 *   - processRow: pending → dead (tentativas esgotadas)
 *   - processRow: dead imediato se campos ausentes
 *   - Nenhum status fora do CHECK é gravado
 */

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { enqueueOutboundMessage } from './outbox.service.js';
import { processRow } from './outbox-worker.js';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL env var is required for integration tests. ' +
    'Set it before running: DATABASE_URL=postgres://user:pass@host:5432/db npm test',
  );
}
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL_ADMIN ?? DATABASE_URL;

async function withTenantConn<T>(
  dbPool: pg.Pool,
  tid: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await dbPool.connect();
  try {
    return await withAppTenant(client, tid, () => fn(client));
  } finally {
    client.release();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'dead';

async function getRow(
  pool: pg.Pool,
  tenantId: string,
  id: string,
): Promise<{
  status: OutboxStatus;
  attempts: number;
  sent_at: Date | null;
  last_error: string | null;
  provider_response: unknown | null;
  next_retry_at: Date | null;
  correlation_id: string | null;
  customer_id: string | null;
} | null> {
  return withTenantConn(pool, tenantId, async (client) => {
    const r = await client.query(
      `SELECT status, attempts, sent_at, last_error, provider_response,
              next_retry_at, correlation_id, customer_id
         FROM message_outbox WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  });
}

async function insertRow(
  pool: pg.Pool,
  tenantId: string,
  overrides: Partial<{
    attempts: number;
    max_attempts: number;
    status: OutboxStatus;
    payload: object;
    metadata: object;
  }> = {},
): Promise<string> {
  return withTenantConn(pool, tenantId, async (client) => {
    const r = await client.query(
      `INSERT INTO message_outbox
         (tenant_id, channel, payload, metadata, status, attempts, max_attempts,
          correlation_id, next_retry_at)
       VALUES ($1, 'whatsapp', $2::jsonb, $3::jsonb, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        tenantId,
        JSON.stringify(overrides.payload ?? { type: 'text', text: 'Teste integração' }),
        JSON.stringify(overrides.metadata ?? { instance_name: 'inst-01', phone: '5511900001111', provider: 'evolution' }),
        overrides.status ?? 'pending',
        overrides.attempts ?? 0,
        overrides.max_attempts ?? 5,
        `corr-${randomUUID()}`,
      ],
    );
    return r.rows[0].id as string;
  });
}

async function fetchOutboxRowForProcess(pool: pg.Pool, tenantId: string, id: string) {
  return withTenantConn(pool, tenantId, async (client) => {
    const row = await client.query(
      `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
         FROM message_outbox WHERE id = $1`,
      [id],
    );
    return row.rows[0];
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('message_outbox integration', () => {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });

  const tenantId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.EVOLUTION_API_URL = 'http://evolution.test';
    process.env.EVOLUTION_API_KEY = 'test-key';

    // Aplica migrations se necessário
    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    const schemaCheck = await pool.query(`SELECT to_regclass('public.tenants') AS t`);
    if (!schemaCheck.rows[0]?.t) {
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        await pool.query(readFileSync(resolve(migrationsDir, f), 'utf8'));
      }
    }

    // Garante migration 008 (outbox hardening)
    const outboxCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'message_outbox'
         AND column_name = 'correlation_id'
    `);
    if (outboxCols.rows.length === 0) {
      const sql = readFileSync(resolve(migrationsDir, '008_outbox_hardening.sql'), 'utf8');
      await pool.query(sql);
    }

    const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
    await adminPool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1, 'Tenant Outbox Test', 'tenant-outbox-test', 'trial', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
    await adminPool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, 'Test User', $3, 'x', 'tenant_owner')
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), tenantId, `test-outbox-${randomUUID()}@test.com`],
    );
    await adminPool.end();
  });

  afterAll(async () => {
    const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
    await withTenantConn(pool, tenantId, async (client) => {
      await client.query(`DELETE FROM message_outbox WHERE tenant_id = $1`, [tenantId]);
    });
    await adminPool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await adminPool.end();
    await pool.end();
  });

  // ── enqueueOutboundMessage ─────────────────────────────────────────────────

  describe('enqueueOutboundMessage', () => {
    it('insere mensagem com payload e metadata válidos', async () => {
      await withTenantConn(pool, tenantId, async (client) => {
        await enqueueOutboundMessage({
          tenantId,
          payload: { type: 'text', text: 'Olá!' },
          metadata: { phone: '5511900000001', instance_name: 'inst-01', provider: 'evolution' },
          correlationId: 'corr-enqueue-test',
        }, client);
      });

      const r = await withTenantConn(pool, tenantId, async (client) => client.query(
        `SELECT status, payload, metadata, correlation_id FROM message_outbox
          WHERE tenant_id = $1
            AND correlation_id = 'corr-enqueue-test'`,
        [tenantId],
      ));
      expect(r.rows).toHaveLength(1);
      const row = r.rows[0];
      expect(row.status).toBe('pending');
      expect(row.payload.text).toBe('Olá!');
      expect(row.metadata.phone).toBe('5511900000001');
      expect(row.correlation_id).toBe('corr-enqueue-test');
    });

    it('idempotência: segundo INSERT com mesmo idempotency_key é ignorado', async () => {
      const key = `idem-${randomUUID()}`;

      const first = await withTenantConn(pool, tenantId, async (client) =>
        enqueueOutboundMessage({
          tenantId,
          payload: { type: 'text', text: 'Mensagem 1' },
          metadata: { phone: '5511900000002', instance_name: 'inst-01', provider: 'evolution' },
          idempotencyKey: key,
        }, client),
      );
      expect(first.inserted).toBe(true);
      const second = await withTenantConn(pool, tenantId, async (client) =>
        enqueueOutboundMessage({
          tenantId,
          payload: { type: 'text', text: 'Mensagem 2 (duplicada)' },
          metadata: { phone: '5511900000002', instance_name: 'inst-01', provider: 'evolution' },
          idempotencyKey: key,
        }, client),
      );
      expect(second.inserted).toBe(false);

      const r = await withTenantConn(pool, tenantId, async (client) => client.query(
        `SELECT count(*) FROM message_outbox WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, key],
      ));
      expect(Number(r.rows[0].count)).toBe(1);
    });

    it('mesmo idempotency_key em tenants diferentes NÃO conflita', async () => {
      const key = `shared-key-${randomUUID()}`;
      const otherTenantId = randomUUID();
      const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });

      await adminPool.query(
        `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
         VALUES ($1, 'Outro Tenant', $2, 'trial', 'active')`,
        [otherTenantId, `outro-tenant-${randomUUID().slice(0, 8)}`],
      );

      await withTenantConn(pool, otherTenantId, async (client) => {
        await client.query(
          `INSERT INTO message_outbox
             (tenant_id, channel, payload, metadata, idempotency_key, status, next_retry_at)
           VALUES ($1, 'whatsapp', '{"type":"text","text":"t2"}'::jsonb,
                   '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                   $2, 'pending', now())`,
          [otherTenantId, key],
        );
      });
      await withTenantConn(pool, tenantId, async (client) => {
        await enqueueOutboundMessage({
          tenantId,
          payload: { type: 'text', text: 'tenant 1' },
          metadata: { phone: '5511', instance_name: 'inst', provider: 'evolution' },
          idempotencyKey: key,
        }, client);
      });

      const rows = await withTenantConn(pool, tenantId, async (client) => client.query(
        `SELECT tenant_id FROM message_outbox WHERE idempotency_key = $1`,
        [key],
      ));
      expect(rows.rows.length).toBeGreaterThanOrEqual(1);
      await withTenantConn(pool, otherTenantId, async (client) => {
        await client.query(`DELETE FROM message_outbox WHERE tenant_id = $1`, [otherTenantId]);
      });
      await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
      await adminPool.end();
    });
  });

  // ── processRow: sucesso ────────────────────────────────────────────────────

  describe('processRow → sent', () => {
    it('marca sent, preenche sent_at e provider_response', async () => {
      const id = await insertRow(pool, tenantId);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ messageId: 'ev-ok-001' }),
      } as Response);

      await processRow(await fetchOutboxRowForProcess(pool, tenantId, id));

      const after = await getRow(pool, tenantId, id);
      expect(after?.status).toBe('sent');
      expect(after?.sent_at).not.toBeNull();
      expect(after?.provider_response).toMatchObject({ messageId: 'ev-ok-001' });
      expect(after?.last_error).toBeNull();
    });
  });

  // ── processRow: falha com retry ────────────────────────────────────────────

  describe('processRow → pending (retry)', () => {
    it('volta para pending e agenda next_retry_at', async () => {
      const id = await insertRow(pool, tenantId, { attempts: 1, max_attempts: 5 });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      await processRow(await fetchOutboxRowForProcess(pool, tenantId, id));

      const after = await getRow(pool, tenantId, id);
      expect(after?.status).toBe('pending');
      expect(after?.attempts).toBe(2);
      expect(after?.next_retry_at).not.toBeNull();
      expect(after?.last_error).toContain('500');
    });
  });

  // ── processRow: dead-letter ────────────────────────────────────────────────

  describe('processRow → dead', () => {
    it('marca dead quando attempts atinge max_attempts', async () => {
      const id = await insertRow(pool, tenantId, { attempts: 4, max_attempts: 5 });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as Response);

      await processRow(await fetchOutboxRowForProcess(pool, tenantId, id));

      const after = await getRow(pool, tenantId, id);
      expect(after?.status).toBe('dead');
      expect(after?.attempts).toBe(5);
      // next_retry_at é NOT NULL no schema; dead usa `now()` para não ser reprocessado.
      expect(after?.next_retry_at).not.toBeNull();
    });

    it('marca dead imediatamente se phone ausente no metadata', async () => {
      const id = await insertRow(pool, tenantId, {
        metadata: { instance_name: 'inst-01', provider: 'evolution' },
      });

      await processRow(await fetchOutboxRowForProcess(pool, tenantId, id));

      const after = await getRow(pool, tenantId, id);
      expect(after?.status).toBe('dead');
      expect(after?.last_error).toContain('phone');
    });
  });

  describe('CT-101 OUTBOX_FORCE_SEND_FAILURE', () => {
    it('não marca sent; agenda retry (pending) com last_error', async () => {
      const prev = process.env.OUTBOX_FORCE_SEND_FAILURE;
      process.env.OUTBOX_FORCE_SEND_FAILURE = 'true';
      try {
        const id = await insertRow(pool, tenantId);

        await processRow(await fetchOutboxRowForProcess(pool, tenantId, id));

        const after = await getRow(pool, tenantId, id);
        expect(after?.status).toBe('pending');
        expect(after?.last_error).toContain('Simulated provider failure');
        expect(after?.sent_at).toBeNull();
        expect((after?.attempts ?? 0) >= 1).toBe(true);
      } finally {
        process.env.OUTBOX_FORCE_SEND_FAILURE = prev ?? '';
      }
    });
  });

  // ── Status constraints ─────────────────────────────────────────────────────

  describe('CHECK constraint de status', () => {
    it('INSERT com status inválido é rejeitado pelo banco', async () => {
      await expect(
        withTenantConn(pool, tenantId, async (client) => client.query(
          `INSERT INTO message_outbox
             (tenant_id, channel, payload, metadata, status, next_retry_at)
           VALUES ($1, 'whatsapp', '{"type":"text","text":"x"}'::jsonb,
                   '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                   'sending', now())`,
          [tenantId],
        )),
      ).rejects.toThrow();
    });

    it('INSERT com status "dead" é aceito', async () => {
      const r = await withTenantConn(pool, tenantId, async (client) => client.query(
        `INSERT INTO message_outbox
           (tenant_id, channel, payload, metadata, status, next_retry_at)
         VALUES ($1, 'whatsapp', '{"type":"text","text":"x"}'::jsonb,
                 '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                 'dead', now())
         RETURNING id`,
        [tenantId],
      ));
      expect(r.rows[0].id).toBeTruthy();
    });
  });
});
