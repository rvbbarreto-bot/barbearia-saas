import { describe, expect, it } from 'vitest';
import { appointmentIdFromCorrelation, maskPhone, summarizePayload } from './outbox-row-mapper.js';

describe('outbox-row-mapper', () => {
  it('derives appointment_id only for UUID correlation', () => {
    expect(appointmentIdFromCorrelation('not-uuid')).toBeNull();
    expect(appointmentIdFromCorrelation('A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D')).toBe(
      'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    );
  });

  it('masks phone destination', () => {
    expect(maskPhone('+5511999887766')).toBe('****7766');
  });

  it('summarizes text payload without leaking nested secrets', () => {
    const s = summarizePayload({ type: 'text', text: 'x'.repeat(200) });
    expect(s.preview?.endsWith('…')).toBe(true);
  });
});
