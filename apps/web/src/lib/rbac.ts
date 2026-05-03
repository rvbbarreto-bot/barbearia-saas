/**
 * Níveis alinhados à API (`apps/api/src/middlewares/rbac.ts`) — perfis V4.
 * platform_admin · tenant_owner · tenant_admin · manager · professional · attendant · viewer
 */
export const ROLE_LEVEL: Record<string, number> = {
  viewer: 10,
  attendant: 20,
  professional: 30,
  manager: 40,
  tenant_admin: 50,
  tenant_owner: 60,
  platform_admin: 100,
};

export function hasMinRole(userRole: string | undefined, minRole: keyof typeof ROLE_LEVEL): boolean {
  const r = userRole && userRole in ROLE_LEVEL ? userRole : 'viewer';
  return (ROLE_LEVEL[r] ?? 0) >= ROLE_LEVEL[minRole];
}

/** Dono / gerente / admin de tenant: configuração de serviços, profissionais, relatórios. */
export function canAccessManagerArea(role: string | undefined): boolean {
  return hasMinRole(role, 'manager');
}

/** Atendente+: agenda operacional e clientes (API exige attendant em clientes). */
export function canAccessAttendantArea(role: string | undefined): boolean {
  return hasMinRole(role, 'attendant');
}

export const ROLE_LABEL_PT: Record<string, string> = {
  platform_admin: 'Admin da plataforma',
  tenant_owner: 'Dono da barbearia',
  tenant_admin: 'Administrador',
  manager: 'Gerente',
  professional: 'Profissional',
  attendant: 'Atendente',
  viewer: 'Visualizador',
};
