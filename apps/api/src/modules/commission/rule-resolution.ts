export type CommissionRuleRow = {
  id: string;
  branch_id: string | null;
  professional_id: string | null;
  service_id: string | null;
  rule_kind: 'percent' | 'fixed_cents';
  percent_basis_points: number | null;
  fixed_cents: number | null;
  priority: number;
};

function ruleMatchesAppointment(
  appt: { branch_id: string | null; professional_id: string; service_id: string | null },
  r: CommissionRuleRow,
): boolean {
  if (r.branch_id != null && r.branch_id !== appt.branch_id) return false;
  if (r.professional_id != null && r.professional_id !== appt.professional_id) return false;
  if (r.service_id != null && r.service_id !== appt.service_id) return false;
  return true;
}

/** Mais dimensões não-nulas na regra = mais específica. Desempate: priority, depois id. */
function specificityScore(r: CommissionRuleRow): number {
  return (
    (r.branch_id ? 100 : 0) +
    (r.professional_id ? 10 : 0) +
    (r.service_id ? 1 : 0)
  );
}

export function resolveBestCommissionRule(
  appt: { branch_id: string | null; professional_id: string; service_id: string | null },
  rules: CommissionRuleRow[],
): CommissionRuleRow | null {
  const matches = rules.filter((r) => ruleMatchesAppointment(appt, r));
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ds = specificityScore(b) - specificityScore(a);
    if (ds !== 0) return ds;
    const dp = b.priority - a.priority;
    if (dp !== 0) return dp;
    return b.id.localeCompare(a.id);
  });
  return matches[0] ?? null;
}

export function computeCommissionCentsFromRule(baseAmountCents: number, rule: CommissionRuleRow): number {
  if (rule.rule_kind === 'percent') {
    const bp = rule.percent_basis_points ?? 0;
    return Math.min(baseAmountCents, Math.round((baseAmountCents * bp) / 10000));
  }
  return Math.min(baseAmountCents, rule.fixed_cents ?? 0);
}
