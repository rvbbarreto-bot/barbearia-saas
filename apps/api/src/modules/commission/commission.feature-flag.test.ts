import { describe, expect, it } from 'vitest';
import { isCommissionEnabledInSettingsJson } from './tenant-commission-flag.js';

describe('commission_enabled (Opção B)', () => {
  it('default false quando ausente ou inválido', () => {
    expect(isCommissionEnabledInSettingsJson(null)).toBe(false);
    expect(isCommissionEnabledInSettingsJson({})).toBe(false);
    expect(isCommissionEnabledInSettingsJson({ commission_enabled: false })).toBe(false);
    expect(isCommissionEnabledInSettingsJson({ commission_enabled: 'true' })).toBe(false);
  });

  it('true só quando boolean estrito', () => {
    expect(isCommissionEnabledInSettingsJson({ commission_enabled: true })).toBe(true);
  });
});
