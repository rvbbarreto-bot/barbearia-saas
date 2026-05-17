import { describe, expect, it } from 'vitest';
import { buildOperationalAuditQuery } from './operationalAuditPageModel';

describe('buildOperationalAuditQuery', () => {
  it('maps filters and omits empty strings', () => {
    expect(
      buildOperationalAuditQuery({
        page: 2,
        limit: 20,
        eventType: ' appointment_confirmed ',
        entityType: '',
        entityId: '',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        correlationId: 'corr-abc',
        from: '2026-05-01T00:00:00Z',
        to: '',
      }),
    ).toEqual({
      page: 2,
      limit: 20,
      event_type: 'appointment_confirmed',
      actor_user_id: '00000000-0000-0000-0000-000000000002',
      correlation_id: 'corr-abc',
      from: '2026-05-01T00:00:00Z',
    });
  });
});
