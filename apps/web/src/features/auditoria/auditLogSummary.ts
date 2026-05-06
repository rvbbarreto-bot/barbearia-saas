/** Resumo curto para coluna de UI (sem expor JSON completo). */
export function summarizeAuditLogRow(row: {
  action: string;
  entity: string;
  before: unknown;
  after: unknown;
}): string {
  const clip = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  };
  const b = clip(row.before);
  const a = clip(row.after);
  if (!b && !a) return `${row.action} · ${row.entity}`;
  if (a) return `${row.action} · ${row.entity} · ${a}`;
  return `${row.action} · ${row.entity} · ${b}`;
}
