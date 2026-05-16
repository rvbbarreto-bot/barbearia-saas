import { hasMinRole } from '@/lib/rbac';

export type InfraHealth = 'ok' | 'degraded' | 'not_probed';

export function canViewOperacaoStatus(role: string | undefined): boolean {
  return hasMinRole(role, 'manager');
}

export function healthLabel(state: InfraHealth): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'degraded':
      return 'Degradado';
    case 'not_probed':
      return 'Não verificado';
    default:
      return '—';
  }
}

export function healthBadgeClass(state: InfraHealth): string {
  switch (state) {
    case 'ok':
      return 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400';
    case 'degraded':
      return 'bg-destructive/15 text-destructive';
    case 'not_probed':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function outboxCountLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pendentes',
    processing: 'Processando',
    sent: 'Enviadas',
    failed: 'Falhas',
    dead: 'Encerradas',
  };
  return map[status] ?? status;
}
