import { describe, expect, it } from 'vitest';
import { buildSlots, hasOverlap } from './slots.js';

describe('hasOverlap', () => {
  it('intervalos que se tocam sem interior não colidem', () => {
    const a = { startsAt: new Date('2029-01-01T10:00:00Z'), endsAt: new Date('2029-01-01T11:00:00Z') };
    const b = { startsAt: new Date('2029-01-01T11:00:00Z'), endsAt: new Date('2029-01-01T12:00:00Z') };
    expect(hasOverlap(a, b)).toBe(false);
  });

  it('sobreposição parcial colide', () => {
    const a = { startsAt: new Date('2029-01-01T10:00:00Z'), endsAt: new Date('2029-01-01T11:00:00Z') };
    const b = { startsAt: new Date('2029-01-01T10:30:00Z'), endsAt: new Date('2029-01-01T12:00:00Z') };
    expect(hasOverlap(a, b)).toBe(true);
  });
});

describe('slots with buffers', () => {
  it('buffers expand a pegada e podem remover candidatos que ainda caberiam só com a duração nominal', () => {
    const dayStart = new Date('2029-06-02T08:00:00.000Z');
    const dayEnd = new Date('2029-06-02T10:00:00.000Z');

    /** Já considerado expandido (como fazemos em availability para agendamentos). */
    const blocked = [{ startsAt: new Date('2029-06-02T08:35:00.000Z'), endsAt: new Date('2029-06-02T09:30:00.000Z') }];

    const semBuffer = buildSlots({
      dayStart,
      dayEnd,
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      stepMinutes: 30,
      blocked,
    });

    const comBuffer = buildSlots({
      dayStart,
      dayEnd,
      durationMinutes: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      stepMinutes: 30,
      blocked,
    });

    expect(semBuffer.length).toBeGreaterThan(0);
    expect(comBuffer.length).toBeLessThan(semBuffer.length);
  });
});
