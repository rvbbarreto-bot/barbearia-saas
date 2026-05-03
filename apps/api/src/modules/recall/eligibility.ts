/**
 * Janelas V4 por tipo de serviço e overrides no cadastro (estética/química).
 */

export type RecallKind = 'corte' | 'barba' | 'sobrancelha' | 'estetica_quimica';

export type ServiceRecallRow = {
  recall_kind: string | null;
  recall_min_days: number | null;
  recall_max_days: number | null;
};

export function effectiveRecallWindow(row: ServiceRecallRow): { min: number; max: number } | null {
  const k = row.recall_kind as RecallKind | null;

  if (row.recall_min_days != null && row.recall_max_days != null) {
    if (row.recall_min_days > row.recall_max_days) return null;
    return { min: row.recall_min_days, max: row.recall_max_days };
  }

  if (k === 'estetica_quimica') {
    return null;
  }

  switch (k) {
    case 'corte':
      return { min: 21, max: 30 };
    case 'barba':
      return { min: 7, max: 15 };
    case 'sobrancelha':
      return { min: 15, max: 21 };
    default:
      return null;
  }
}

export function daysBetweenUtc(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function isInRecallWindow(lastVisitAt: Date, now: Date, window: { min: number; max: number }): boolean {
  const d = daysBetweenUtc(lastVisitAt, now);
  return d >= window.min && d <= window.max;
}

/** template_key em notification_templates */
export function recallTemplateKeyForKind(kind: string | null): string {
  switch (kind) {
    case 'corte':
      return 'recall_promotional_corte';
    case 'barba':
      return 'recall_promotional_barba';
    case 'sobrancelha':
      return 'recall_promotional_sobrancelha';
    case 'estetica_quimica':
      return 'recall_promotional_estetica';
    default:
      return 'recall_promotional_default';
  }
}
