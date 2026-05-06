import { describe, expect, it } from 'vitest';
import { formatCentsBrl } from './formatCentsBrl';

describe('formatCentsBrl', () => {
  it('formata centimos em BRL', () => {
    expect(formatCentsBrl(10050)).toMatch(/100/);
    expect(formatCentsBrl(0)).toMatch(/0/);
  });

  it('trata null', () => {
    expect(formatCentsBrl(null)).toBe('—');
  });
});
