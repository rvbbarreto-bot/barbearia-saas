import { describe, expect, it } from 'vitest';
import { labelOutboxErrorClass } from './outboxErrorClass';

describe('labelOutboxErrorClass', () => {
  it('labels known classes', () => {
    expect(labelOutboxErrorClass('auth')).toBe('Autenticação');
    expect(labelOutboxErrorClass('network')).toBe('Rede');
  });

  it('returns dash for null', () => {
    expect(labelOutboxErrorClass(null)).toBe('—');
  });
});
