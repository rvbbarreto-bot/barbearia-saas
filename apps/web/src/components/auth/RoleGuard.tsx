import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRoleGate } from '@/hooks/useRoleGate';
import { ROLE_LEVEL } from '@/lib/rbac';

type MinRole = keyof typeof ROLE_LEVEL;

export function RoleGuard({ minRole, children }: { minRole: MinRole; children: ReactNode }) {
  const allowed = useRoleGate(minRole);
  if (!allowed) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
