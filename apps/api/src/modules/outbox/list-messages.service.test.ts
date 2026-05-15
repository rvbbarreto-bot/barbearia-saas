import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../../infra/db/pool.js', () => ({
  withTenant: vi.fn(),
}));

import * as pool from '../../infra/db/pool.js';
import { listOutboxMessages } from './list-messages.service.js';

describe('listOutboxMessages', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid status', async () => {
    await expect(listOutboxMessages('t1', { status: 'bogus' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('rejects invalid from timestamp', async () => {
    await expect(listOutboxMessages('t1', { from: 'not-a-date' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('maps rows with masked destination', async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT')) {
        return { rows: [{ total: 1 }] };
      }
      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000099',
            tenant_id: '00000000-0000-0000-0000-000000000001',
            channel: 'whatsapp',
            status: 'pending',
            attempts: 0,
            max_attempts: 5,
            last_error: null,
            correlation_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            customer_id: null,
            idempotency_key: 'idem-qa-1',
            created_at: new Date('2026-05-14T12:00:00.000Z'),
            updated_at: new Date('2026-05-14T12:00:00.000Z'),
            sent_at: null,
            payload: { type: 'text', text: 'Olá mundo' },
            metadata: { phone: '+5511999887766', provider: 'evolution' },
          },
        ],
      };
    });
    const mockClient = { query: mockQuery };
    vi.mocked(pool.withTenant).mockImplementation(async (_tenantId, fn) => fn(mockClient as never));

    const r = await listOutboxMessages('00000000-0000-0000-0000-000000000001', { page: '1', limit: '10' });
    expect(r.total).toBe(1);
    expect(r.data[0].destination).toBe('****7766');
    expect(r.data[0].payload_summary.preview).toBe('Olá mundo');
    expect(r.data[0].provider).toBe('evolution');
    expect(r.data[0].idempotency_key).toBe('idem-qa-1');
    expect(r.data[0].appointment_id).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  });
});
