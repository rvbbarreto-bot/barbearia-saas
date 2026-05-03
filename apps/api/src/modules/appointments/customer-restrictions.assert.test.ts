import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';
import { assertCustomerBookingAllowed } from './customer-restrictions.service.js';

describe('assertCustomerBookingAllowed (política sinal / só humano)', () => {
  it('sem restrições — não consulta falha', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as PoolClient;
    await expect(assertCustomerBookingAllowed(client, 't1', 'c1', undefined)).resolves.toBeUndefined();
  });

  it('CUSTOMER_DEPOSIT_REQUIRED quando requires_deposit e canal não é staff', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ requires_deposit: true, manual_booking_only: false }],
      }),
    } as unknown as PoolClient;

    await expect(
      assertCustomerBookingAllowed(client, 't1', 'c1', { sub: 'u1', role: 'viewer' }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_DEPOSIT_REQUIRED' });
  });

  it('attendant ignora exigência de sinal', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ requires_deposit: true, manual_booking_only: false }],
      }),
    } as unknown as PoolClient;

    await expect(
      assertCustomerBookingAllowed(client, 't1', 'c1', { sub: 'u1', role: 'attendant' }),
    ).resolves.toBeUndefined();
  });

  it('CUSTOMER_RESTRICTED_MANUAL_ONLY quando manual_booking_only e não staff', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ requires_deposit: false, manual_booking_only: true }],
      }),
    } as unknown as PoolClient;

    await expect(
      assertCustomerBookingAllowed(client, 't1', 'c1', { sub: 'u1', role: 'viewer' }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_RESTRICTED_MANUAL_ONLY' });
  });

  it('erro inclui AppError para handler HTTP', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ requires_deposit: true, manual_booking_only: false }],
      }),
    } as unknown as PoolClient;

    try {
      await assertCustomerBookingAllowed(client, 't1', 'c1', { sub: 'x', role: 'viewer' });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(422);
    }
  });
});
