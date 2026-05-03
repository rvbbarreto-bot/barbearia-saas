import { useAuthStore } from '@/store/authStore';
import { hasMinRole, ROLE_LEVEL } from '@/lib/rbac';

export function useRoleGate(minRole: keyof typeof ROLE_LEVEL): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return hasMinRole(role, minRole);
}
