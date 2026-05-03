import axios, { type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { RefreshResponse } from '@/types/api';

export const api = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: inject Bearer token ─────────────────────────────────

api.interceptors.request.use((config) => {
  const { accessToken, tenantId } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }
  return config;
});

// ─── Singleton refresh: prevents N parallel 401s from firing N refreshes ──────

let refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const { refreshToken, setTokens, logout, tenantId } = useAuthStore.getState();

  if (!refreshToken) {
    logout();
    throw new Error('No refresh token');
  }

  try {
    const headers: Record<string, string> = {};
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    const { data } = await axios.post<RefreshResponse>(
      '/auth/refresh',
      { refresh_token: refreshToken },
      { headers },
    );
    setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
    return data.access_token;
  } catch {
    logout();
    window.location.href = '/login';
    throw new Error('Refresh failed');
  }
}

// ─── Response interceptor: auto-refresh on 401 ───────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalConfig = error.config as AxiosRequestConfig & { _retry?: boolean };

    const is401 = error.response?.status === 401;
    const alreadyRetried = originalConfig._retry;
    const isRefreshEndpoint = originalConfig.url?.includes('/auth/refresh');

    if (is401 && !alreadyRetried && !isRefreshEndpoint) {
      originalConfig._retry = true;

      if (!refreshPromise) {
        refreshPromise = runRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newToken = await refreshPromise;
        originalConfig.headers = {
          ...(originalConfig.headers ?? {}),
          Authorization: `Bearer ${newToken}`,
        };
        return api.request(originalConfig);
      } catch {
        return Promise.reject(error);
      }
    }

    const forbiddenTenant = error.response?.status === 403 && error.response?.data?.error === 'TENANT_MISMATCH';
    if (forbiddenTenant) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);
