import { api } from '@/lib/api';
import type { LoginRequest, LoginResponse } from '@/types/api';

export async function loginRequest(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', body);
  return data;
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refresh_token: refreshToken });
}
