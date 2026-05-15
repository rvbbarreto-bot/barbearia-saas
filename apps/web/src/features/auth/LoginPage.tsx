import { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Scissors, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { getDefaultTenantId } from '@/lib/defaultTenant';
import { loginRequest } from './authService';

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loginSchema = z.object({
  email: z.string().email('E-mail invalido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  tenant_id: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || UUID_LOOSE.test(v), { message: 'Tenant ID invalido (UUID)' }),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const defaultTenant = getDefaultTenantId();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showTenant, setShowTenant] = useState(false);
  const tenantFieldId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormData) {
    setServerError(null);
    try {
      const trimmed = data.tenant_id?.trim() ?? '';
      const response = await loginRequest({
        email: data.email,
        password: data.password,
        ...(trimmed !== '' && UUID_LOOSE.test(trimmed) ? { tenant_id: trimmed } : {}),
      });
      const sessionTenant =
        response.user.tenant_id ?? (trimmed !== '' && UUID_LOOSE.test(trimmed) ? trimmed : defaultTenant);
      setAuth({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: response.user,
        loginTenantId: sessionTenant,
      });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const status = ax?.response?.status;
      const code = ax?.response?.data?.error;
      if (status === 401) {
        setServerError('E-mail ou senha incorretos.');
      } else if (status === 429) {
        setServerError('Muitas tentativas. Aguarde alguns instantes.');
      } else if (status === 400 && code === 'TENANT_REQUIRED') {
        setServerError(
          ax.response?.data?.message ??
            'Este e-mail existe em mais de um tenant. Abra "Tenant (opcional)" e indique o UUID.',
        );
      } else if (status === 400) {
        setServerError(ax.response?.data?.message ?? 'Dados inválidos. Verifique o formulário.');
      } else {
        setServerError('Erro ao conectar. Tente novamente.');
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Scissors className="size-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Barbearia SaaS</h1>
          <p className="text-sm text-muted-foreground">Sistema de gestão</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Entrar</CardTitle>
            <CardDescription>
            A sessão fica ligada ao tenant utilizado no login (cabeçalho <code className="rounded bg-muted px-1">X-Tenant-Id</code>
            ). Utilize &quot;Tenant (opcional)&quot; para mudar de barbearia.
          </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              {/* Server error — displayed inline, not as a modal */}
              {serverError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {serverError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@barbearia.com"
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <button
                type="button"
                className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowTenant((v) => !v)}
              >
                {showTenant ? 'Ocultar tenant (dev)' : 'Tenant (opcional / multi-tenant)'}
              </button>
              {showTenant && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={tenantFieldId}>Tenant ID (UUID)</Label>
                  <Input
                    id={tenantFieldId}
                    placeholder={defaultTenant}
                    aria-invalid={!!errors.tenant_id}
                    {...register('tenant_id')}
                  />
                  {errors.tenant_id && (
                    <p className="text-xs text-destructive">{errors.tenant_id.message}</p>
                  )}
                </div>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full mt-1">
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                <span>{isSubmitting ? 'Entrando...' : 'Entrar'}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Barbearia SaaS &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
