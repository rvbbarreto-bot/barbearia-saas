import { describe, expect, it } from 'vitest';
import {
  computeCommissionCentsFromRule,
  resolveBestCommissionRule,
  type CommissionRuleRow,
} from './rule-resolution.js';

const appt = {
  branch_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as string | null,
  professional_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  service_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' as string | null,
};

describe('commission rule resolution', () => {
  it('escolhe regra mais específica: profissional+serviço+unidade sobre padrão tenant', () => {
    const rules: CommissionRuleRow[] = [
      {
        id: '1',
        branch_id: null,
        professional_id: null,
        service_id: null,
        rule_kind: 'percent',
        percent_basis_points: 1000,
        fixed_cents: null,
        priority: 0,
      },
      {
        id: '2',
        branch_id: appt.branch_id,
        professional_id: appt.professional_id,
        service_id: appt.service_id,
        rule_kind: 'fixed_cents',
        percent_basis_points: null,
        fixed_cents: 500,
        priority: 0,
      },
    ];
    const best = resolveBestCommissionRule(appt, rules);
    expect(best?.id).toBe('2');
    expect(computeCommissionCentsFromRule(10_000, best!)).toBe(500);
  });

  it('percentual aplica teto ao valor base', () => {
    const r: CommissionRuleRow = {
      id: 'p',
      branch_id: null,
      professional_id: null,
      service_id: null,
      rule_kind: 'percent',
      percent_basis_points: 2500,
      fixed_cents: null,
      priority: 0,
    };
    expect(computeCommissionCentsFromRule(8000, r)).toBe(2000);
  });

  it('valor fixo não ultrapassa base', () => {
    const r: CommissionRuleRow = {
      id: 'f',
      branch_id: null,
      professional_id: null,
      service_id: null,
      rule_kind: 'fixed_cents',
      percent_basis_points: null,
      fixed_cents: 99999,
      priority: 0,
    };
    expect(computeCommissionCentsFromRule(3000, r)).toBe(3000);
  });

  it('sem regra aplicável devolve null', () => {
    const rules: CommissionRuleRow[] = [
      {
        id: 'x',
        branch_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        professional_id: null,
        service_id: null,
        rule_kind: 'percent',
        percent_basis_points: 5000,
        fixed_cents: null,
        priority: 0,
      },
    ];
    expect(resolveBestCommissionRule(appt, rules)).toBeNull();
  });
});
