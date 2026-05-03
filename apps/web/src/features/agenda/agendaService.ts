import { api } from '@/lib/api';
import type {
  Appointment,
  AppointmentHistoryEntry,
  AppointmentStatusHistoryEntry,
  CalendarBlock,
  PaginatedResponse,
  AvailabilitySlot,
  AppointmentSource,
} from '@/types/api';

export async function listAppointments(params: {
  from: string;
  to: string;
  professional_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Appointment>> {
  const { data } = await api.get<PaginatedResponse<Appointment>>('/api/v1/appointments', {
    params: { ...params, limit: params.limit ?? 200 },
  });
  return data;
}

export async function getAppointment(id: string): Promise<Appointment> {
  const { data } = await api.get<Appointment>(`/api/v1/appointments/${id}`);
  return data;
}

export interface CreateAppointmentBody {
  customer_id: string;
  professional_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  idempotency_key: string;
  source?: AppointmentSource;
  notes?: string;
  /** true: fica `awaiting_confirmation` até PATCH confirm. false: confirma na hora (só balcão). */
  explicit_confirmation: boolean;
  hold_id?: string;
}

export async function confirmAppointment(id: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/confirm`, {});
  return data;
}

export async function createAppointmentHold(body: {
  professional_id: string;
  service_id: string;
  customer_id?: string;
  starts_at: string;
  ends_at: string;
  idempotency_key: string;
  ttl_minutes?: number;
}): Promise<{ id: string; expires_at: string }> {
  const { data } = await api.post<{ id: string; expires_at: string }>('/api/v1/appointment-holds', body);
  return data;
}

export async function createAppointment(body: CreateAppointmentBody): Promise<Appointment> {
  const { data } = await api.post<Appointment>('/api/v1/appointments', body);
  return data;
}

export async function cancelAppointment(id: string, reason: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/cancel`, { reason });
  return data;
}

export async function rescheduleAppointment(
  id: string,
  body: { starts_at: string; ends_at: string; reason: string },
): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/reschedule`, body);
  return data;
}

export async function getAppointmentHistory(id: string): Promise<AppointmentHistoryEntry[]> {
  const { data } = await api.get<AppointmentHistoryEntry[]>(`/api/v1/appointments/${id}/history`);
  return data;
}

export async function getAppointmentStatusHistory(id: string): Promise<AppointmentStatusHistoryEntry[]> {
  const { data } = await api.get<AppointmentStatusHistoryEntry[]>(
    `/api/v1/appointments/${id}/status-history`,
  );
  return data;
}

export async function checkInAppointment(id: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/check-in`, {});
  return data;
}

export async function startAppointment(id: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/start`, {});
  return data;
}

export async function completeAppointment(id: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/complete`, {});
  return data;
}

export async function noShowAppointment(id: string, reason: string): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/api/v1/appointments/${id}/no-show`, { reason });
  return data;
}

export async function listCalendarBlocks(params: {
  from: string;
  to: string;
  professional_id?: string;
}): Promise<CalendarBlock[]> {
  const { data } = await api.get<PaginatedResponse<CalendarBlock>>('/api/v1/calendar-blocks', {
    params: { ...params, limit: 200 },
  });
  return data.data;
}

export async function createCalendarBlock(body: {
  professional_id?: string;
  starts_at: string;
  ends_at: string;
  kind?: string;
  reason?: string;
}): Promise<CalendarBlock> {
  const { data } = await api.post<CalendarBlock>('/api/v1/calendar-blocks', body);
  return data;
}

export async function getAvailability(params: {
  professional_id: string;
  service_id: string;
  date: string;
}): Promise<AvailabilitySlot[]> {
  const { data } = await api.get<AvailabilitySlot[]>('/api/v1/availability', { params });
  return data;
}
