import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForbiddenPage } from '@/features/auth/ForbiddenPage';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

const DashboardPage      = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AgendaPage         = lazy(() => import('@/features/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const ClientesPage       = lazy(() => import('@/features/clientes/ClientesPage').then((m) => ({ default: m.ClientesPage })));
const ServicosPage       = lazy(() => import('@/features/servicos/ServicosPage').then((m) => ({ default: m.ServicosPage })));
const ProfissionaisPage  = lazy(() => import('@/features/profissionais/ProfissionaisPage').then((m) => ({ default: m.ProfissionaisPage })));
const ConfiguracoesPage  = lazy(() => import('@/features/configuracoes/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })));
const ConversasPage      = lazy(() => import('@/features/atendimento/ConversasPage').then((m) => ({ default: m.ConversasPage })));
const AuditLogsPage      = lazy(() => import('@/features/auditoria/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const WaitlistPage       = lazy(() => import('@/features/lista-espera/WaitlistPage').then((m) => ({ default: m.WaitlistPage })));
const FinanceiroPage = lazy(() =>
  import('@/features/financeiro/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })),
);
const ComissaoPage = lazy(() => import('@/features/comissao/ComissaoPage').then((m) => ({ default: m.ComissaoPage })));
const OutboxMessagesPage = lazy(() =>
  import('@/features/outbox/OutboxMessagesPage').then((m) => ({ default: m.OutboxMessagesPage })),
);
const OperationalAuditPage = lazy(() =>
  import('@/features/auditoria/OperationalAuditPage').then((m) => ({ default: m.OperationalAuditPage })),
);
const VeiculosPage = lazy(() =>
  import('@/features/veiculos/VeiculosPage').then((m) => ({ default: m.VeiculosPage })),
);
const CarWashBoardPage = lazy(() =>
  import('@/features/lavaRapido/CarWashBoardPage').then((m) => ({ default: m.CarWashBoardPage })),
);
const ManagementDashboardPage = lazy(() =>
  import('@/features/gestao/ManagementDashboardPage').then((m) => ({ default: m.ManagementDashboardPage })),
);
const Customer360Page = lazy(() =>
  import('@/features/clientes/Customer360Page').then((m) => ({ default: m.Customer360Page })),
);
const PortalPublicPage = lazy(() =>
  import('@/features/portal/PortalPublicPage').then((m) => ({ default: m.PortalPublicPage })),
);

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-6"><SkeletonRows rows={8} cols={4} /></div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PublicRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route
          path="/portal/:token"
          element={
            <PageSuspense>
              <PortalPublicPage />
            </PageSuspense>
          }
        />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <PageSuspense>
                  <RoleGuard minRole="viewer">
                    <DashboardPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/agenda"
              element={
                <PageSuspense>
                  <RoleGuard minRole="viewer">
                    <AgendaPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/conversas"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <ConversasPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route
              path="/clientes"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <ClientesPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/clientes/:id/360"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <Customer360Page />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/gestao/dashboard"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <ManagementDashboardPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/servicos"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <ServicosPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/profissionais"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <ProfissionaisPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <ConfiguracoesPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/lista-espera"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <WaitlistPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/operacao/financeiro"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <FinanceiroPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/operacao/mensagens"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <OutboxMessagesPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/operacao/auditoria"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <OperationalAuditPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/operacao/comissao"
              element={
                <PageSuspense>
                  <RoleGuard minRole="manager">
                    <ComissaoPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/veiculos"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <VeiculosPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/operacao/lava-rapido"
              element={
                <PageSuspense>
                  <RoleGuard minRole="attendant">
                    <CarWashBoardPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
            <Route
              path="/auditoria"
              element={
                <PageSuspense>
                  <RoleGuard minRole="tenant_admin">
                    <AuditLogsPage />
                  </RoleGuard>
                </PageSuspense>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
