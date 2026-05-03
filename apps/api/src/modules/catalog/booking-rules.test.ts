import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';
import {
  assertEndsMatchServiceDuration,
  assertMatchingPrice,
  loadBookableService,
} from './booking-rules.js';

const svcRowActive = {
  id: 's1',
  duration_minutes: 30,
  price_cents: 5000,
  active: true,
  buffer_before_minutes: 5,
  buffer_after_minutes: 10,
};

describe('booking-rules', () => {
  it('rejeita fim nominal que não bate com a duração', () => {
    expect(() =>
      assertEndsMatchServiceDuration({
        startsAtIso: '2029-06-01T14:00:00.000Z',
        endsAtIso: '2029-06-01T14:25:00.000Z',
        durationMinutes: 30,
      }),
    ).toThrow();
  });

  it('aceita fim nominal correto dentro da tolerância', () => {
    expect(() =>
      assertEndsMatchServiceDuration({
        startsAtIso: '2029-06-01T14:00:00.000Z',
        endsAtIso: '2029-06-01T14:30:00.000Z',
        durationMinutes: 30,
      }),
    ).not.toThrow();
  });

  it('SERVICE_PRICE_MISMATCH quando preço declarado diverge', () => {
    try {
      assertMatchingPrice(9999, 5000);
      expect.fail('esperado exceção');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('SERVICE_PRICE_MISMATCH');
    }
  });

  it('não aciona falha quando preço declarado é omitido', () => {
    expect(() => assertMatchingPrice(undefined, 5000)).not.toThrow();
  });

  it('SERVICE_NOT_BOOKABLE quando não há linha professional_services/service', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as unknown as PoolClient;
    await expect(loadBookableService(client, 't1', 'p1', 's1')).rejects.toMatchObject({
      code: 'SERVICE_NOT_BOOKABLE',
    });
  });

  it('SERVICE_NOT_BOOKABLE quando serviço inativo mesmo com vínculo', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ ...svcRowActive, active: false }],
      }),
    } as unknown as PoolClient;

    await expect(loadBookableService(client, 't1', 'p1', 's1')).rejects.toMatchObject({
      code: 'SERVICE_NOT_BOOKABLE',
    });
  });

  it('retorna linha quando ativo + vinculado', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [svcRowActive] }),
    } as unknown as PoolClient;

    const row = await loadBookableService(client, 't1', 'p1', 's1');
    expect(row.price_cents).toBe(5000);
    expect(row.buffer_before_minutes).toBe(5);
  });
});
