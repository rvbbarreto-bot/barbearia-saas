import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

const DEFAULT_TENANT_ID = import.meta.env.VITE_DEFAULT_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenantId: DEFAULT_TENANT_ID,

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
          tenantId: DEFAULT_TENANT_ID,
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
