import { describe, expect, it } from 'vitest';
import { blocksPromotionalRecall } from './recall-consent.js';

describe('blocksPromotionalRecall', () => {
  it('exige consentimento recall explícito (granted true)', () => {
    expect(blocksPromotionalRecall(false, true)).toBe(false);
    expect(blocksPromotionalRecall(false, undefined)).toBe(true);
    expect(blocksPromotionalRecall(false, false)).toBe(true);
  });

  it('respeita opt-out global do WhatsApp', () => {
    expect(blocksPromotionalRecall(true, true)).toBe(true);
  });
});
