import { describe, expect, it } from 'vitest';
import { buildOutboxMessagesQuery, canShowOutboxRetryButton } from './outboxPageModel';

describe('buildOutboxMessagesQuery', () => {
  const base = {
    page: 1,
    limit: 20,
    status: '__all__',
    provider: '',
    from: '',
    to: '',
    correlationId: '',
    appointmentId: '',
    destination: '',
    customerId: '',
    errorClass: '__all__',
  };

  it('omits __all__ sentinels', () => {
    expect(buildOutboxMessagesQuery(base)).toEqual({ page: 1, limit: 20 });
  });

  it('maps status, customer_id and error_class filters', () => {
    const q = buildOutboxMessagesQuery({
      ...base,
      status: 'failed',
      customerId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      errorClass: 'auth',
      provider: 'evolution',
    });
    expect(q.status).toBe('failed');
    expect(q.customer_id).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(q.error_class).toBe('auth');
    expect(q.provider).toBe('evolution');
  });
});

describe('canShowOutboxRetryButton', () => {
  it('manager+ on failed/dead only', () => {
    expect(canShowOutboxRetryButton('manager', 'failed')).toBe(true);
    expect(canShowOutboxRetryButton('tenant_admin', 'dead')).toBe(true);
    expect(canShowOutboxRetryButton('manager', 'sent')).toBe(false);
  });

  it('denies attendant and viewer', () => {
    expect(canShowOutboxRetryButton('attendant', 'failed')).toBe(false);
    expect(canShowOutboxRetryButton('viewer', 'dead')).toBe(false);
  });
});
