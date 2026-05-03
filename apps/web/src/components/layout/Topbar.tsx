import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store/authStore';
import { logoutRequest } from '@/features/auth/authService';
import { ROLE_LABEL_PT } from '@/lib/rbac';

export function Topbar() {
  const navigate = useNavigate();
  const { user, refreshToken, logout, tenantId } = useAuthStore();

  async function handleLogout() {
    try {
      if (refreshToken) await logoutRequest(refreshToken);
    } finally {
      logout();
      navigate('/login', { replace: true });
    }
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  const roleKey = user?.role ?? '';
  const roleLabel = ROLE_LABEL_PT[roleKey] ?? roleKey;
  const tenantShort = tenantId ? `${tenantId.slice(0, 8)}…` : '—';
  const isPlatform = roleKey === 'platform_admin';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Contexto (X-Tenant-Id)</span>
          {isPlatform && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              Auditoria plataforma
            </Badge>
          )}
        </div>
        <span className="font-mono text-xs text-foreground" title={tenantId}>
          {tenantShort}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium leading-none">{user?.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <Avatar className="size-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
