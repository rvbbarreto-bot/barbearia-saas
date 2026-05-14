import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getDefaultTenantId } from '@/lib/defaultTenant';
import type { AuthUser } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Tenant enviado em `X-Tenant-Id` — deve coincidir com o utilizado no login (isolamento). */
  tenantId: string;
  setAuth: (params: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    /** UUID do tenant da sessão (corpo do login); previne divergência com `user.tenant_id` null. */
    loginTenantId: string;
  }) => void;
  setTokens: (params: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenantId: getDefaultTenantId(),

      setAuth({ accessToken, refreshToken, user, loginTenantId }) {
        set({
          accessToken,
          refreshToken,
          user,
          tenantId: loginTenantId,
        });
      },

      setTokens({ accessToken, refreshToken }) {
        set({ accessToken, refreshToken });
      },

      logout() {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenantId: getDefaultTenantId(),
        });
      },

      isAuthenticated() {
        return !!get().accessToken;
      },
    }),
    {
      name: 'barbearia-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tenantId: state.tenantId,
      }),
    },
  ),
);
