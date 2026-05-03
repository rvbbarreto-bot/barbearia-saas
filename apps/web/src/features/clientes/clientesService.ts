import { api } from '@/lib/api';
import type { Customer, PaginatedResponse, Appointment } from '@/types/api';

export async function listClientes(params: { page: number; limit: number; search: string }): Promise<PaginatedResponse<Customer>> {
  const { data } = await api.get<PaginatedResponse<Customer>>('/api/v1/customers', {
    params: { page: params.page, limit: params.limit, search: params.search || undefined },
  });
  return data;
}

export async function createCliente(body: { name?: string; phone: string; email?: string; whatsapp_opt_in?: boolean }): Promise<Customer> {
  const { data } = await api.post<Customer>('/api/v1/customers', body);
  return data;
}

export async function updateCliente(id: string, body: Partial<{ name: string; phone: string; email: string; whatsapp_opt_in: boolean }>): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/api/v1/customers/${id}`, body);
  return data;
}

export async function getClienteAppointments(customerId: string, params = { page: 1, limit: 10 }): Promise<PaginatedResponse<Appointment>> {
  const { data } = await api.get<PaginatedResponse<Appointment>>('/api/v1/appointments', {
    params: { customer_id: customerId, ...params },
  });
  return data;
}
