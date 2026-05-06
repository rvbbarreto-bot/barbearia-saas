// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string | null;
  /** Quando o utilizador é barbeiro ligado a `professionals.id`. */
  professional_id?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenant_id: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
  refresh_expires_in: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
  refresh_expires_in: string;
}

// ─── Generic ──────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
  message: string;
  request_id?: string;
  issues?: Array<{ path: string; code: string; message: string }>;
}

// ─── Appointments ─────────────────────────────────────────────────────────────

/** Subconjunto comum + valores operacionais V4 retornados pela API. */
export type AppointmentStatus =
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'offered'
  | 'draft'
  | 'awaiting_payment'
  | 'awaiting_confirmation'
  | 'no_show_pending'
  | 'checked_in'
  | 'in_service'
  | 'rescheduled'
  | 'hold';

/** Canal de origem (`appointments.source` / enum `channel`). */
export type AppointmentSource = 'whatsapp' | 'web' | 'manual' | 'api' | 'walk_in' | 'admin';

export interface Appointment {
  id: string;
  tenant_id: string;
  professional_id: string;
  customer_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source?: AppointmentSource;
  idempotency_key: string;
  notes?: string | null;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  professional_name?: string;
  customer_name?: string;
  service_name?: string;
  /** Notas internas do cliente — alerta operacional se indicar restrição. */
  customer_notes?: string | null;
  /** Lista (`GET /appointments`) — políticas em `customer_restrictions`. */
  customer_requires_deposit?: boolean;
  customer_manual_booking_only?: boolean;
  /** Dentro da tolerância de atraso sem check-in (ainda `confirmed`). */
  late_within_tolerance?: boolean;
}

export interface CreateAppointmentRequest {
  professional_id: string;
  customer_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  idempotency_key: string;
  source?: AppointmentSource;
  notes?: string;
}

export interface CalendarBlock {
  id: string;
  tenant_id?: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  kind: string;
  reason: string | null;
  created_at: string;
}

/** Tickets de handoff / suporte (`support_tickets`). */
export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'
  | 'closed';

export type HandoffReasonCode =
  | 'ia_uncertain'
  | 'customer_angry'
  | 'payment_failed'
  | 'schedule_conflict'
  | 'customer_restricted'
  | 'ambiguous_two_turns'
  | 'out_of_scope';

export interface SupportTicketListRow {
  id: string;
  customer_id: string | null;
  subject: string;
  body: string | null;
  status: SupportTicketStatus;
  priority: string;
  channel: string;
  metadata?: Record<string, unknown>;
  assigned_to_user_id: string | null;
  handoff_reason_code: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  assigned_to_name?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
}

export interface SupportTicketOutboxRow {
  id: string;
  status: string;
  payload: { type?: string; text?: string } & Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
}

export interface SupportTicketDetailResponse {
  ticket: SupportTicketListRow;
  outbox_messages: SupportTicketOutboxRow[];
}

export interface AppointmentHistoryEntry {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Linhas de `appointment_status_history` (mudanças de `appointments.status`). */
export interface AppointmentStatusHistoryEntry {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by_user_id: string | null;
  changed_by_name: string | null;
  payload: Record<string, unknown>;
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  tenant_id: string;
  name?: string;
  phone: string;
  email?: string;
  notes?: string;
  whatsapp_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerRequest {
  name?: string;
  phone: string;
  email?: string;
  whatsapp_opt_in?: boolean;
  notes?: string;
}

// ─── Services ─────────────────────────────────────────────────────────────────

export interface Service {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  created_at: string;
}

// ─── Professionals ────────────────────────────────────────────────────────────

export interface Professional {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  phone?: string;
  timezone: string;
  specialty?: string;
  active: boolean;
  service_ids?: string[];
  created_at: string;
  updated_at?: string;
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
  professional_id: string;
  available: boolean;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  tenant_id?: string;
  actor_user_id: string | null;
  actor_name?: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  created_at: string;
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  tenant_id: string;
  customer_id: string;
  service_id: string;
  professional_id: string | null;
  preferred_date_from: string;
  preferred_date_to: string;
  shift_preference: string;
  deposit_priority: boolean;
  status: string;
  metadata?: unknown;
  created_at: string;
  updated_at?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_is_vip?: boolean | null;
}

// ─── Finance (read-only UI) ───────────────────────────────────────────────────

export interface AppointmentFinancialListRow {
  appointment_id: string;
  appointment_status: string;
  professional_id: string;
  starts_at: string;
  financial: Record<string, unknown> | null;
  balance_due_cents: number | null;
}

// ─── Commission (read-only UI) ───────────────────────────────────────────────

export interface CommissionEntryRow {
  id: string;
  tenant_id: string;
  appointment_id: string;
  professional_id: string;
  branch_id: string | null;
  service_id: string | null;
  commission_rule_id: string | null;
  base_amount_cents: number;
  commission_cents: number;
  status: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
}
