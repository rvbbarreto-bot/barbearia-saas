import { api } from '@/lib/api';

export type CustomerOverview = {
  customer: Record<string, unknown>;
  vertical: string;
  appointments: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  outbox_messages: Array<Record<string, unknown>>;
  audit_events: Array<Record<string, unknown>>;
  financials: Array<Record<string, unknown>>;
  recent_services: Array<Record<string, unknown>>;
  whatsapp_opt_in: boolean;
};

export async function fetchCustomerOverview(customerId: string) {
  const { data } = await api.get<CustomerOverview>(`/api/v1/customers/${customerId}/overview`);
  return data;
}
