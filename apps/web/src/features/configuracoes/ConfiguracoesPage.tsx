import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, User, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/SkeletonRows';
import { useAuthStore } from '@/store/authStore';
import { logoutRequest } from '../auth/authService';
import { getMe } from './configuracoesService';

const ROLE_LABELS: Record<string, string> = {
  viewer:         'Visualizador',
  attendant:      'Atendente',
  professional:   'Profissional',
  manager:        'Gerente',
  tenant_admin:   'Administrador',
  tenant_owner:   'Proprietario',
  platform_admin: 'Admin da Plataforma',
};

export function ConfiguracoesPage() {
  const logout = useAuthStore((s) => s.logout);
  const authUser = useAuthStore((s) => s.user);

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 300_000,
  });

  const refreshToken = useAuthStore((s) => s.refreshToken);
  async function handleLogout() {
    try { if (refreshToken) await logoutRequest(refreshToken); } catch { /* ignore */ }
    logout();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e preferencias da conta.</p>
      </div>

      <Tabs defaultValue="perfil" className="max-w-xl">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="conta">Minha Conta</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                    {(me?.name ?? authUser?.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{me?.name ?? authUser?.name}</p>
                    <p className="text-sm text-muted-foreground">{me?.email ?? '—'}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t pt-4">
                  <InfoRow icon={User}   label="Nome"   value={me?.name ?? '—'} />
                  <InfoRow icon={Shield} label="Perfil" value={ROLE_LABELS[me?.role ?? ''] ?? me?.role ?? '—'} />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="conta" className="mt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-medium text-foreground">Encerrar sessao</p>
                <p className="text-sm text-muted-foreground">Voce sera redirecionado para a tela de login.</p>
              </div>
              <Button
                variant="outline"
                className="w-fit text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  await handleLogout();
                  toast.success('Sessao encerrada.');
                }}
              >
                <LogOut className="size-4" />
                Sair da conta
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
