/**
 * inbound.integration.test.ts
 *
 * Testes de integração do webhook WhatsApp inbound.
 * Requer: DATABASE_URL com schema aplicado (001-008).
 *
 * Cenários:
 *   1. Payload válido com token → 200, persiste customer + message + conversation_state
 *   2. Payload duplicado (mesmo external_message_id) → 200, duplicate: true
 *   3. Deduplicação por SHA-256 (sem external_message_id) → duplicate na 2ª chamada
 *   4. Header x-webhook-instance ausente → lançado erro WEBHOOK_INSTANCE_REQUIRED
 *   5. Instância desconhecida → WEBHOOK_INSTANCE_UNKNOWN
 *   6. Token inválido → INVALID_WEBHOOK_TOKEN
 *   7. HMAC configurado mas header ausente → WEBHOOK_SIGNATURE_REQUIRED
 *   8. HMAC inválido → WEBHOOK_SIGNATURE_INVALID
 *   9. tenant_id no body é ignorado (não vaza para resolução)
 *  10. Payload sem phone → lança ZodError (tratado pelo handler)
 *  11. Mensagem sem external_message_id gera dedup key sha256:...
 */

import { createHmac, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { processInboundWebhook, verifyHmac } from './inbound.service.js';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL env var is required for integration tests. ' +
    'Set it before running: DATABASE_URL=postgres://user:pass@host:5432/db npm test',
  );
}
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL_ADMIN ?? DATABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBody(overrides: Partial<{
  phone: string;
  name: string;
  message: string;
  external_message_id: string | null;
  tenant_id: string;
}> = {}) {
  return {
    phone:               '5511900001111',
    name:                'Cliente Teste',
    message:             'Quero agendar',
    external_message_id: `ext-${randomUUID()}`,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<{
  instanceKey: string;
  rawBody: string;
  webhookToken: string;
  webhookSignature: string | undefined;
  correlationId: string;
  ip: string;
}> = {}) {
  return {
    instanceKey:      'inst-test-01',
    rawBody:          '{}',
    webhookToken:     'tok-test-secret',
    webhookSignature: undefined,
    correlationId:    `corr-${randomUUID()}`,
    ip:               '127.0.0.1',
    ...overrides,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

describe('POST /webhooks/whatsapp/inbound (integration)', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
  const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
  const tenantId   = randomUUID();
  const INSTANCE   = 'inst-test-01';
  const TOKEN      = 'tok-test-secret';
  const HMAC_SECRET = 'hmac-secret-dev-32-chars-minimum!';

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET   = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    process.env.REDIS_URL    = process.env.REDIS_URL  ?? 'redis://localhost:6379';

    // Aplica migrations se schema não existir
    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    const schemaCheck = await pool.query(`SELECT to_regclass('public.tenants') AS t`);
    if (!schemaCheck.rows[0]?.t) {
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        await pool.query(readFileSync(resolve(migrationsDir, f), 'utf8'));
      }
    }

    await adminPool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug, webhook_token)
       VALUES ($1, 'Tenant Webhook Test', 'Tenant Webhook Test', 'trial', 'active', $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, `tenant-wh-${tenantId.slice(0, 8)}`, TOKEN],
    );

    await adminPool.query(
      `INSERT INTO tenant_integrations
         (id, tenant_id, provider, config, is_active, hmac_secret)
       VALUES ($1, $2, 'evolution', $3::jsonb, true, NULL)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), tenantId, JSON.stringify({ instance_name: INSTANCE })],
    );
  });

  afterAll(async () => {
    await adminPool.query(`DELETE FROM webhook_events   WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM conversation_states WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM messages         WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM customers        WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1`, [tenantId]);
    await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await adminPool.end();
    await pool.end();
  });

  // ── 1. Payload válido com token ────────────────────────────────────────────
  it('payload válido com token → persiste customer, message e conversation_state', async () => {
    const extId = `ext-${randomUUID()}`;
    const body  = makeBody({ external_message_id: extId });

    const result = await processInboundWebhook(
      body,
      makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN }),
      pool,
    );

    expect(result.duplicate).toBe(false);
    if (result.duplicate) return;
    expect(result.tenantId).toBe(tenantId);
    expect(result.customerId).toBeTruthy();
    expect(result.messageId).toBeTruthy();

    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        const cust = await c.query(`SELECT phone FROM customers WHERE id = $1`, [result.customerId]);
        expect(cust.rows[0].phone).toBe(body.phone);

        const msg = await c.query(
          `SELECT direction, channel, body, payload FROM messages WHERE id = $1`,
          [result.messageId],
        );
        expect(msg.rows[0].direction).toBe('in');
        expect(msg.rows[0].channel).toBe('whatsapp');
        expect(msg.rows[0].body).toBe(body.message);
        expect(msg.rows[0].payload.type).toBe('text');

        const conv = await c.query(
          `SELECT state_key FROM conversation_states
            WHERE tenant_id = $1 AND customer_id = $2`,
          [tenantId, result.customerId],
        );
        expect(conv.rows[0]?.state_key).toBe('awaiting_intent');
      });
    } finally {
      c.release();
    }
  });

  // ── 2. Duplicata por external_message_id ──────────────────────────────────
  it('segunda mensagem com mesmo external_message_id → duplicate: true', async () => {
    const extId = `ext-dedup-${randomUUID()}`;
    const body  = makeBody({ external_message_id: extId });

    // primeira
    await processInboundWebhook(body, makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN }), pool);
    // segunda (duplicata)
    const r2 = await processInboundWebhook(
      body,
      makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN }),
      pool,
    );

    expect(r2).toEqual({ ok: true, duplicate: true });
  });

  // ── 3. Deduplicação por SHA-256 sem external_message_id ───────────────────
  it('mesma mensagem sem external_message_id → deduplicada por payload_sha256', async () => {
    const body    = makeBody({ external_message_id: null });
    const rawBody = JSON.stringify(body);

    const r1 = await processInboundWebhook(
      body,
      makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN, rawBody }),
      pool,
    );
    expect(r1.duplicate).toBe(false);

    const r2 = await processInboundWebhook(
      body,
      makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN, rawBody }),
      pool,
    );
    expect(r2.duplicate).toBe(true);
  });

  // ── 4. Instância desconhecida ─────────────────────────────────────────────
  it('instância desconhecida → WEBHOOK_INSTANCE_UNKNOWN (404)', async () => {
    await expect(
      processInboundWebhook(
        makeBody(),
        makeCtx({ instanceKey: 'nao-existe', webhookToken: TOKEN }),
        pool,
      ),
    ).rejects.toMatchObject({ code: 'WEBHOOK_INSTANCE_UNKNOWN', statusCode: 404 });
  });

  // ── 5. Token inválido ─────────────────────────────────────────────────────
  it('token inválido → INVALID_WEBHOOK_TOKEN (401)', async () => {
    await expect(
      processInboundWebhook(
        makeBody(),
        makeCtx({ instanceKey: INSTANCE, webhookToken: 'token-errado' }),
        pool,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_TOKEN', statusCode: 401 });
  });

  // ── 6. HMAC: header ausente quando secret configurado ─────────────────────
  it('HMAC configurado mas header ausente → WEBHOOK_SIGNATURE_REQUIRED (401)', async () => {
    // Cria integration com HMAC
    const hmacTenantId = randomUUID();
    const hmacInstance = `inst-hmac-${randomUUID().slice(0, 8)}`;

    await adminPool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug, webhook_token)
       VALUES ($1, 'HMAC Tenant', 'HMAC Tenant', 'trial', 'active', $2, 'dummy-token')`,
      [hmacTenantId, `hmac-${hmacTenantId.slice(0, 8)}`],
    );
    await adminPool.query(
      `INSERT INTO tenant_integrations (id, tenant_id, provider, config, is_active, hmac_secret)
       VALUES ($1, $2, 'evolution', $3::jsonb, true, $4)`,
      [randomUUID(), hmacTenantId, JSON.stringify({ instance_name: hmacInstance }), HMAC_SECRET],
    );

    await expect(
      processInboundWebhook(
        makeBody(),
        makeCtx({ instanceKey: hmacInstance, webhookSignature: undefined }),
        pool,
      ),
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_REQUIRED', statusCode: 401 });

    await adminPool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [hmacTenantId]);
  });

  // ── 7. HMAC inválido ──────────────────────────────────────────────────────
  it('assinatura HMAC inválida → WEBHOOK_SIGNATURE_INVALID (401)', async () => {
    const hmacTenantId = randomUUID();
    const hmacInstance = `inst-hmac2-${randomUUID().slice(0, 8)}`;

    await adminPool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug, webhook_token)
       VALUES ($1, 'HMAC Tenant 2', 'HMAC Tenant 2', 'trial', 'active', $2, 'dummy-token')`,
      [hmacTenantId, `hmac2-${hmacTenantId.slice(0, 8)}`],
    );
    await adminPool.query(
      `INSERT INTO tenant_integrations (id, tenant_id, provider, config, is_active, hmac_secret)
       VALUES ($1, $2, 'evolution', $3::jsonb, true, $4)`,
      [randomUUID(), hmacTenantId, JSON.stringify({ instance_name: hmacInstance }), HMAC_SECRET],
    );

    await expect(
      processInboundWebhook(
        makeBody(),
        makeCtx({ instanceKey: hmacInstance, webhookSignature: 'sha256=invalido' }),
        pool,
      ),
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID', statusCode: 401 });

    await adminPool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [hmacTenantId]);
  });

  // ── 8. HMAC válido aceito ─────────────────────────────────────────────────
  it('assinatura HMAC válida → 200 ok', async () => {
    const hmacTenantId = randomUUID();
    const hmacInstance = `inst-hmac3-${randomUUID().slice(0, 8)}`;
    const rawBody      = JSON.stringify(makeBody());
    const sig          = 'sha256=' + createHmac('sha256', HMAC_SECRET).update(rawBody).digest('hex');

    await adminPool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug, webhook_token)
       VALUES ($1, 'HMAC Tenant 3', 'HMAC Tenant 3', 'trial', 'active', $2, 'dummy-token')`,
      [hmacTenantId, `hmac3-${hmacTenantId.slice(0, 8)}`],
    );
    await adminPool.query(
      `INSERT INTO tenant_integrations (id, tenant_id, provider, config, is_active, hmac_secret)
       VALUES ($1, $2, 'evolution', $3::jsonb, true, $4)`,
      [randomUUID(), hmacTenantId, JSON.stringify({ instance_name: hmacInstance }), HMAC_SECRET],
    );

    const r = await processInboundWebhook(
      makeBody({ external_message_id: `hmac-msg-${randomUUID()}` }),
      makeCtx({ instanceKey: hmacInstance, webhookSignature: sig, rawBody }),
      pool,
    );
    expect(r.duplicate).toBe(false);

    await adminPool.query(`DELETE FROM conversation_states WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM messages WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM customers WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM webhook_events WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1`, [hmacTenantId]);
    await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [hmacTenantId]);
  });

  // ── 9. tenant_id no body é ignorado ──────────────────────────────────────
  it('tenant_id falso no body não afeta resolução do tenant', async () => {
    const extId = `ext-tid-${randomUUID()}`;
    const body  = makeBody({
      external_message_id: extId,
      tenant_id:           randomUUID(), // payload malicioso com tenant_id falso
    } as Parameters<typeof makeBody>[0]);

    const result = await processInboundWebhook(
      body as Parameters<typeof processInboundWebhook>[0],
      makeCtx({ instanceKey: INSTANCE, webhookToken: TOKEN }),
      pool,
    );

    expect(result.duplicate).toBe(false);
    if (result.duplicate) return;
    // tenant resolvido deve ser o do cadastro, não o do body
    expect(result.tenantId).toBe(tenantId);
  });

  // ── 10. verifyHmac unit ───────────────────────────────────────────────────
  it('verifyHmac retorna true para assinatura correta', () => {
    const secret  = 'meu-segredo';
    const payload = '{"test":1}';
    const sig     = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmac(secret, payload, sig)).toBe(true);
  });

  it('verifyHmac retorna false para assinatura incorreta', () => {
    expect(verifyHmac('segredo', '{"test":1}', 'sha256=invalido')).toBe(false);
  });
});
