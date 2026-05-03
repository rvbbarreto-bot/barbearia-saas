import { describe, expect, it } from 'vitest';
import { blocksMarketingOrRecall, blocksTransactionalReminders } from './consent.js';

describe('consent guards V4', () => {
  it('blocks recall and marketing when WhatsApp opt-out flag is set', () => {
    expect(blocksMarketingOrRecall(true, 'recall', true)).toBe(true);
    expect(blocksMarketingOrRecall(true, 'marketing', true)).toBe(true);
  });

  it('blocks when latest consent for purpose is explicitly revoked', () => {
    expect(blocksMarketingOrRecall(false, 'recall', false)).toBe(true);
    expect(blocksMarketingOrRecall(false, 'marketing', false)).toBe(true);
  });

  it('allows recall/marketing when no explicit revoke and no global opt-out', () => {
    expect(blocksMarketingOrRecall(false, 'recall', undefined)).toBe(false);
    expect(blocksMarketingOrRecall(false, 'marketing', undefined)).toBe(false);
  });

  it('allows recall/marketing when purpose explicitly granted', () => {
    expect(blocksMarketingOrRecall(false, 'recall', true)).toBe(false);
  });

  it('transactional reminders require channel opt-in unless transactional consent revoked', () => {
    expect(blocksTransactionalReminders(true, false, true)).toBe(false);
    expect(blocksTransactionalReminders(true, false, undefined)).toBe(false);
    expect(blocksTransactionalReminders(false, false, undefined)).toBe(true);
    expect(blocksTransactionalReminders(true, true, true)).toBe(true);
    expect(blocksTransactionalReminders(true, false, false)).toBe(true);
  });
});
