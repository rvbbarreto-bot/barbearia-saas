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
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
