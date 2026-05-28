/** Resumo curto de metadata sanitizada (somente leitura). */
export function summarizeOperationalAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  const s = JSON.stringify(metadata);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}
