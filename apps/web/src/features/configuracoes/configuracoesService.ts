import { api } from '@/lib/api';

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant_id: string;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/api/v1/me');
  return data;
}
