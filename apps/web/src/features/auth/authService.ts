import { api } from '@/lib/api';
import type { LoginRequest, LoginResponse } from '@/types/api';

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loginRequest(body: LoginRequest): Promise<LoginResponse> {
  const raw = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
  const payload: Record<string, unknown> = {
    email: body.email,
    password: body.password,
  };
  if (raw !== '' && UUID_LOOSE.test(raw)) {
    payload.tenant_id = raw;
  }
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refresh_token: refreshToken });
}
