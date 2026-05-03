import { describe, expect, it } from 'vitest';
import {
  daysBetweenUtc,
  effectiveRecallWindow,
  isInRecallWindow,
  recallTemplateKeyForKind,
} from './eligibility.js';

describe('effectiveRecallWindow V4', () => {
  it('usa janelas por tipo quando não há override completo', () => {
    expect(effectiveRecallWindow({ recall_kind: 'corte', recall_min_days: null, recall_max_days: null })).toEqual({
      min: 21,
      max: 30,
    });
    expect(effectiveRecallWindow({ recall_kind: 'barba', recall_min_days: null, recall_max_days: null })).toEqual({
      min: 7,
      max: 15,
    });
    expect(effectiveRecallWindow({ recall_kind: 'sobrancelha', recall_min_days: null, recall_max_days: null })).toEqual({
      min: 15,
      max: 21,
    });
  });

  it('prioriza recall_min/max quando ambos definidos', () => {
    expect(
      effectiveRecallWindow({ recall_kind: 'corte', recall_min_days: 10, recall_max_days: 12 }),
    ).toEqual({ min: 10, max: 12 });
  });

  it('estética/química sem dias completos retorna null', () => {
    expect(effectiveRecallWindow({ recall_kind: 'estetica_quimica', recall_min_days: null, recall_max_days: null })).toBeNull();
  });

  it('deteta janela por dias corridos', () => {
    const last = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date('2026-01-22T12:00:00.000Z');
    expect(daysBetweenUtc(last, now)).toBe(21);
    expect(isInRecallWindow(last, now, { min: 21, max: 30 })).toBe(true);
    expect(isInRecallWindow(last, now, { min: 22, max: 30 })).toBe(false);
  });

  it('template_key por tipo', () => {
    expect(recallTemplateKeyForKind('corte')).toBe('recall_promotional_corte');
    expect(recallTemplateKeyForKind(null)).toBe('recall_promotional_default');
  });
});
