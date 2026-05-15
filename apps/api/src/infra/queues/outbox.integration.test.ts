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
import { enqueueOutboundMessage } from './outbox.service.js';
import { processRow } from './outbox-worker.js';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL env var is required for integration tests. ' +
    'Set it before running: DATABASE_URL=postgres://user:pass@host:5432/db npm test',
  );
}
const DATABASE_URL = process.env.DATABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'dead';

async function getRow(
  pool: pg.Pool,
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
  const r = await pool.query(
    `SELECT status, attempts, sent_at, last_error, provider_response,
            next_retry_at, correlation_id, customer_id
       FROM message_outbox WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
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
  const r = await pool.query(
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

    // Cria tenant de teste + usuário (necessário para FK)
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1, 'Tenant Outbox Test', 'tenant-outbox-test', 'trial', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, 'Test User', $3, 'x', 'tenant_owner')
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), tenantId, `test-outbox-${randomUUID()}@test.com`],
    );

    // Seta contexto RLS para o tenant de teste
    await pool.query(`SET app.tenant_id = '${tenantId}'`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM message_outbox WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await pool.end();
  });

  // ── enqueueOutboundMessage ─────────────────────────────────────────────────

  describe('enqueueOutboundMessage', () => {
    it('insere mensagem com payload e metadata válidos', async () => {
      // Usa pool diretamente para verificar fora do RLS
      await pool.query(`SET app.tenant_id = '${tenantId}'`);

      await enqueueOutboundMessage({
        tenantId,
        payload: { type: 'text', text: 'Olá!' },
        metadata: { phone: '5511900000001', instance_name: 'inst-01', provider: 'evolution' },
        correlationId: 'corr-enqueue-test',
      });

      const r = await pool.query(
        `SELECT status, payload, metadata, correlation_id FROM message_outbox
          WHERE tenant_id = $1
            AND correlation_id = 'corr-enqueue-test'`,
        [tenantId],
      );
      expect(r.rows).toHaveLength(1);
      const row = r.rows[0];
      expect(row.status).toBe('pending');
      expect(row.payload.text).toBe('Olá!');
      expect(row.metadata.phone).toBe('5511900000001');
      expect(row.correlation_id).toBe('corr-enqueue-test');
    });

    it('idempotência: segundo INSERT com mesmo idempotency_key é ignorado', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const key = `idem-${randomUUID()}`;

      const first = await enqueueOutboundMessage({
        tenantId,
        payload: { type: 'text', text: 'Mensagem 1' },
        metadata: { phone: '5511900000002', instance_name: 'inst-01', provider: 'evolution' },
        idempotencyKey: key,
      });
      expect(first.inserted).toBe(true);
      const second = await enqueueOutboundMessage({
        tenantId,
        payload: { type: 'text', text: 'Mensagem 2 (duplicada)' },
        metadata: { phone: '5511900000002', instance_name: 'inst-01', provider: 'evolution' },
        idempotencyKey: key,
      });
      expect(second.inserted).toBe(false);

      const r = await pool.query(
        `SELECT count(*) FROM message_outbox WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, key],
      );
      expect(Number(r.rows[0].count)).toBe(1);
    });

    it('mesmo idempotency_key em tenants diferentes NÃO conflita', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const key = `shared-key-${randomUUID()}`;
      const otherTenantId = randomUUID();

      await pool.query(
        `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
         VALUES ($1, 'Outro Tenant', $2, 'trial', 'active')`,
        [otherTenantId, `outro-tenant-${randomUUID().slice(0, 8)}`],
      );

      // Insere diretamente (sem RLS) para o segundo tenant
      await pool.query(
        `INSERT INTO message_outbox
           (tenant_id, channel, payload, metadata, idempotency_key, status, next_retry_at)
         VALUES ($1, 'whatsapp', '{"type":"text","text":"t2"}'::jsonb,
                 '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                 $2, 'pending', now())`,
        [otherTenantId, key],
      );
      await enqueueOutboundMessage({
        tenantId,
        payload: { type: 'text', text: 'tenant 1' },
        metadata: { phone: '5511', instance_name: 'inst', provider: 'evolution' },
        idempotencyKey: key,
      });

      const r = await pool.query(
        `SELECT tenant_id FROM message_outbox WHERE idempotency_key = $1`,
        [key],
      );
      expect(r.rows).toHaveLength(2);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
    });
  });

  // ── processRow: sucesso ────────────────────────────────────────────────────

  describe('processRow → sent', () => {
    it('marca sent, preenche sent_at e provider_response', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const id = await insertRow(pool, tenantId);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ messageId: 'ev-ok-001' }),
      } as Response);

      const row = await pool.query(
        `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
           FROM message_outbox WHERE id = $1`,
        [id],
      );
      await processRow(row.rows[0]);

      const after = await getRow(pool, id);
      expect(after?.status).toBe('sent');
      expect(after?.sent_at).not.toBeNull();
      expect(after?.provider_response).toMatchObject({ messageId: 'ev-ok-001' });
      expect(after?.last_error).toBeNull();
    });
  });

  // ── processRow: falha com retry ────────────────────────────────────────────

  describe('processRow → pending (retry)', () => {
    it('volta para pending e agenda next_retry_at', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const id = await insertRow(pool, tenantId, { attempts: 1, max_attempts: 5 });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      const row = await pool.query(
        `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
           FROM message_outbox WHERE id = $1`,
        [id],
      );
      await processRow(row.rows[0]);

      const after = await getRow(pool, id);
      expect(after?.status).toBe('pending');
      expect(after?.attempts).toBe(2);
      expect(after?.next_retry_at).not.toBeNull();
      expect(after?.last_error).toContain('500');
    });
  });

  // ── processRow: dead-letter ────────────────────────────────────────────────

  describe('processRow → dead', () => {
    it('marca dead quando attempts atinge max_attempts', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const id = await insertRow(pool, tenantId, { attempts: 4, max_attempts: 5 });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as Response);

      const row = await pool.query(
        `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
           FROM message_outbox WHERE id = $1`,
        [id],
      );
      await processRow(row.rows[0]);

      const after = await getRow(pool, id);
      expect(after?.status).toBe('dead');
      expect(after?.attempts).toBe(5);
      expect(after?.next_retry_at).toBeNull();
    });

    it('marca dead imediatamente se phone ausente no metadata', async () => {
      await pool.query(`SET app.tenant_id = '${tenantId}'`);
      const id = await insertRow(pool, tenantId, {
        metadata: { instance_name: 'inst-01', provider: 'evolution' },
      });

      const row = await pool.query(
        `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
           FROM message_outbox WHERE id = $1`,
        [id],
      );
      await processRow(row.rows[0]);

      const after = await getRow(pool, id);
      expect(after?.status).toBe('dead');
      expect(after?.last_error).toContain('phone');
    });
  });

  describe('CT-101 OUTBOX_FORCE_SEND_FAILURE', () => {
    it('não marca sent; agenda retry (pending) com last_error', async () => {
      const prev = process.env.OUTBOX_FORCE_SEND_FAILURE;
      process.env.OUTBOX_FORCE_SEND_FAILURE = 'true';
      try {
        await pool.query(`SET app.tenant_id = '${tenantId}'`);
        const id = await insertRow(pool, tenantId);

        const row = await pool.query(
          `SELECT id, tenant_id, customer_id, payload, metadata, attempts, max_attempts, correlation_id
             FROM message_outbox WHERE id = $1`,
          [id],
        );
        await processRow(row.rows[0]);

        const after = await getRow(pool, id);
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
        pool.query(
          `INSERT INTO message_outbox
             (tenant_id, channel, payload, metadata, status, next_retry_at)
           VALUES ($1, 'whatsapp', '{"type":"text","text":"x"}'::jsonb,
                   '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                   'sending', now())`,
          [tenantId],
        ),
      ).rejects.toThrow();
    });

    it('INSERT com status "dead" é aceito', async () => {
      const r = await pool.query(
        `INSERT INTO message_outbox
           (tenant_id, channel, payload, metadata, status, next_retry_at)
         VALUES ($1, 'whatsapp', '{"type":"text","text":"x"}'::jsonb,
                 '{"phone":"5511","instance_name":"i","provider":"evolution"}'::jsonb,
                 'dead', now())
         RETURNING id`,
        [tenantId],
      );
      expect(r.rows[0].id).toBeTruthy();
    });
  });
});
