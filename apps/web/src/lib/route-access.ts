import { APP_NAV, type NavMinRole } from '@/config/nav';
import { hasMinRole } from '@/lib/rbac';

/** Rotas autenticadas fora do menu (ex.: área operacional futura). */
const EXTRA_ROUTE_RULES: { path: string; minRole: NavMinRole }[] = [{ path: '/forbidden', minRole: 'viewer' }];

/**
 * Indica se o perfil pode aceder ao caminho (alinhado ao menu `APP_NAV` + regras extra).
 * Usado em testes e para manter política V4 documentada num só sítio.
 */
export function canAccessPath(path: string, role: string | undefined): boolean {
  const normalized = path.replace(/\/$/, '') || '/';
  const navItem = APP_NAV.find((item) => item.to === normalized);
  if (navItem) {
    return hasMinRole(role, navItem.minRole);
  }
  const extra = EXTRA_ROUTE_RULES.find((r) => r.path === normalized);
  if (extra) return hasMinRole(role, extra.minRole);
  return true;
}
