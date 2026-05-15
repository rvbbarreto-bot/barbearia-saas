/**
 * outbox.service.test.ts
 *
 * Testes unitários do outbox service e worker.
 *   - Não precisam de banco nem Evolution API.
 *   - pool é mockado via vi.mock.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { nextRetryDelayMs, RETRY_DELAYS_MS, processRow } from './outbox-worker.js';

// ── Mock do pool ──────────────────────────────────────────────────────────────

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  pool: { query: mockQuery },
}));

// ── Mock do env ───────────────────────────────────────────────────────────────

vi.mock('../../config/env.js', () => ({
  env: {
    EVOLUTION_API_URL: 'http://evolution.test',
    EVOLUTION_API_KEY: 'test-key',
    OUTBOX_POLL_INTERVAL_MS: 5000,
    OUTBOX_CONCURRENCY: 2,
  },
  /** `outbox-worker` importa esta função; sem ela o mock quebra em runtime. */
  isOutboxForceSendFailureRuntime: () => false,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Parameters<typeof processRow>[0]> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    tenant_id: '10000000-0000-0000-0000-000000000001',
    customer_id: null,
    payload: { type: 'text' as const, text: 'Olá, seu agendamento foi confirmado!' },
    metadata: { instance_name: 'inst-01', phone: '5511999990001', provider: 'evolution' as const },
    attempts: 0,
    max_attempts: 5,
    correlation_id: 'corr-abc-123',
    ...overrides,
  };
}

// ── nextRetryDelayMs ──────────────────────────────────────────────────────────

describe('nextRetryDelayMs', () => {
  it('retorna 30s para a primeira tentativa (attempts=0)', () => {
    expect(nextRetryDelayMs(0)).toBe(30_000);
  });

  it('retorna 2 min para a segunda (attempts=1)', () => {
    expect(nextRetryDelayMs(1)).toBe(120_000);
  });

  it('retorna 1h para tentativa além do array (cap)', () => {
    expect(nextRetryDelayMs(99)).toBe(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  });

  it('cada tentativa seguinte tem delay maior ou igual (crescente)', () => {
    for (let i = 0; i < RETRY_DELAYS_MS.length - 1; i++) {
      expect(RETRY_DELAYS_MS[i + 1]).toBeGreaterThanOrEqual(RETRY_DELAYS_MS[i]);
    }
  });
});

// ── processRow: campos obrigatórios ausentes ──────────────────────────────────

describe('processRow — campos ausentes', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('marca dead imediatamente se phone ausente', async () => {
    const row = makeRow({ metadata: { instance_name: 'inst-01', provider: 'evolution' as const, phone: '' } });
    await processRow(row);
    const call = mockQuery.mock.calls[0];
    /** Params: [$1=id, $2=last_error] — SQL usa literal status='dead'. */
    expect(call[1][1]).toContain('phone');
    expect(call[1][0]).toBe(row.id);
  });

  it('marca dead imediatamente se instance_name ausente', async () => {
    const row = makeRow({ metadata: { instance_name: '', phone: '5511999', provider: 'evolution' as const } });
    await processRow(row);
    const call = mockQuery.mock.calls[0];
    expect(call[1][1]).toContain('instance_name');
  });

  it('marca dead imediatamente se payload.text ausente', async () => {
    const row = makeRow({ payload: { type: 'text' as const, text: '' } });
    await processRow(row);
    const call = mockQuery.mock.calls[0];
    expect(call[1][1]).toContain('payload.text');
  });
});

// ── processRow: envio bem-sucedido ────────────────────────────────────────────

describe('processRow — sucesso', () => {
  let fetchSpy: MockInstance;

  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messageId: 'ev-001' }),
    } as Response);
  });

  it('UPDATE marca sent e preenche sent_at e provider_response', async () => {
    await processRow(makeRow());
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("status            = 'sent'");
    expect(sql).toContain('sent_at');
    expect(sql).toContain('provider_response');
    fetchSpy.mockRestore();
  });

  it('attempts = attempts + 1 no sent', async () => {
    await processRow(makeRow({ attempts: 2 }));
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('attempts          = attempts + 1');
    fetchSpy.mockRestore();
  });
});

// ── processRow: falha com retry ───────────────────────────────────────────────

describe('processRow — falha com retry', () => {
  let fetchSpy: MockInstance;

  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);
  });

  it('volta para pending quando tentativas < max_attempts', async () => {
    await processRow(makeRow({ attempts: 1, max_attempts: 5 }));
    const call = mockQuery.mock.calls[0];
    // $2 = status
    expect(call[1][1]).toBe('pending');
    fetchSpy.mockRestore();
  });

  it('marca dead quando attempts atingiu max_attempts', async () => {
    await processRow(makeRow({ attempts: 4, max_attempts: 5 }));
    const call = mockQuery.mock.calls[0];
    expect(call[1][1]).toBe('dead');
    fetchSpy.mockRestore();
  });

  it('next_retry_at é NULL para dead', async () => {
    await processRow(makeRow({ attempts: 4, max_attempts: 5 }));
    const call = mockQuery.mock.calls[0];
    // $5 = isDead (true → next_retry_at = NULL)
    expect(call[1][4]).toBe(true);
    fetchSpy.mockRestore();
  });

  it('grava last_error com a mensagem da exceção', async () => {
    await processRow(makeRow({ attempts: 0, max_attempts: 5 }));
    const call = mockQuery.mock.calls[0];
    // $4 = last_error
    expect(typeof call[1][3]).toBe('string');
    expect(call[1][3]).toContain('500');
    fetchSpy.mockRestore();
  });
});

// ── processRow: nenhum status fora do schema ──────────────────────────────────

describe('processRow — status válidos apenas', () => {
  const VALID_STATUSES = new Set(['pending', 'processing', 'sent', 'failed', 'dead']);
  let fetchSpy: MockInstance;

  it('processRow nunca emite status "sending" ou "failed" após max_attempts', async () => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    // Simula falha
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'err',
    } as Response);

    // attempts = max_attempts - 1 (próxima = dead)
    await processRow(makeRow({ attempts: 4, max_attempts: 5 }));
    const deadCall = mockQuery.mock.calls.find((c) => c[1]?.[1] === 'dead');
    const statusUsed: string = (deadCall?.[1]?.[1] as string) ?? 'unknown';
    expect(VALID_STATUSES.has(statusUsed)).toBe(true);
    expect(statusUsed).toBe('dead');
    fetchSpy.mockRestore();
  });
});
