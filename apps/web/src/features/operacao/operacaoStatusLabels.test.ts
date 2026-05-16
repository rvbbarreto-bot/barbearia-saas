import { describe, expect, it } from 'vitest';
import { canViewOperacaoStatus, healthBadgeClass, healthLabel, outboxCountLabel } from './operacaoStatusLabels';

describe('operacaoStatusLabels', () => {
  it('restricts page to manager+', () => {
    expect(canViewOperacaoStatus('viewer')).toBe(false);
    expect(canViewOperacaoStatus('attendant')).toBe(false);
    expect(canViewOperacaoStatus('manager')).toBe(true);
    expect(canViewOperacaoStatus('tenant_admin')).toBe(true);
  });

  it('maps health states for UI', () => {
    expect(healthLabel('ok')).toBe('OK');
    expect(healthLabel('degraded')).toBe('Degradado');
    expect(healthLabel('not_probed')).toBe('Não verificado');
    expect(healthBadgeClass('ok')).toContain('emerald');
    expect(healthBadgeClass('degraded')).toContain('destructive');
  });

  it('labels outbox statuses in Portuguese', () => {
    expect(outboxCountLabel('failed')).toBe('Falhas');
    expect(outboxCountLabel('pending')).toBe('Pendentes');
  });
});
