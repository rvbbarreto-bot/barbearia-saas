import { describe, expect, it } from 'vitest';
import { managementDashboardQuerySchema } from './schemas.js';

describe('managementDashboardQuerySchema', () => {
  it('aceita período e filtros opcionais', () => {
    const parsed = managementDashboardQuerySchema.parse({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.000Z',
      professional_id: '550e8400-e29b-41d4-a716-446655440000',
      appointment_status: 'completed',
    });
    expect(parsed.from).toContain('2026-05-01');
    expect(parsed.professional_id).toBeDefined();
  });

  it('rejeita período sem from', () => {
    expect(() => managementDashboardQuerySchema.parse({ to: '2026-05-31' })).toThrow();
  });
});
