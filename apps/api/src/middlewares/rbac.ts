import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../shared/errors.js';

export const roleLevel: Record<string, number> = {
  viewer: 10,
  attendant: 20,
  professional: 30,
  manager: 40,
  tenant_admin: 50,
  tenant_owner: 60,
  platform_admin: 100,
};

export const permissionPolicy = {
  appointments: {
    read: 'viewer',
    create: 'attendant',
    confirm: 'attendant',
    cancel: 'attendant',
    reschedule: 'attendant',
    checkIn: 'attendant',
    start: 'attendant',
    complete: 'professional',
    /** Registo manual de falta (portal / operação). */
    noShow: 'attendant',
    /** Balcão: atendimento walk-in rápido (confirma na mesma transação). */
    walkIn: 'attendant',
    /** Encaixe que pode ignorar overlap GiST — apenas gerência. */
    manualOverride: 'manager',
  },
  waitlist: {
    read: 'attendant',
    create: 'attendant',
    cancel: 'attendant',
    convert: 'attendant',
  },
  integrations: {
    /** Enfileirar texto WhatsApp via message_outbox (n8n / automações credenciadas). */
    enqueueOutbound: 'attendant',
  },
  availability: {
    read: 'viewer',
  },
  /** Bloqueios por profissional (`/professionals/:id/time-blocks` → `calendar_blocks`). */
  agendaTimeBlocks: {
    read: 'viewer',
    manage: 'attendant',
  },
  professionalTimeOff: {
    read: 'viewer',
    create: 'attendant',
    update: 'attendant',
    remove: 'attendant',
  },
  professionalRecurringTimeOff: {
    read: 'viewer',
    create: 'attendant',
    update: 'attendant',
    remove: 'attendant',
  },
  businessHours: {
    read: 'viewer',
    create: 'attendant',
    update: 'attendant',
    remove: 'attendant',
  },
  auth: {
    logout: 'viewer',
  },
  supportTickets: {
    read: 'attendant',
    create: 'attendant',
    claim: 'attendant',
    message: 'attendant',
    close: 'attendant',
  },
  tenantOperational: {
    read: 'manager',
    update: 'manager',
  },
  finance: {
    readAppointment: 'attendant',
    settleBalance: 'attendant',
    applyDiscount: 'manager',
    /** Relatório diário — dono/administrador do tenant. */
    dailyReport: 'tenant_admin',
  },
  commissions: {
    readRules: 'manager',
    manageRules: 'manager',
    /** Lançamentos — dado sensível; alinhado à UI e decisão PO (DEV/QA-07.1). */
    readEntries: 'manager',
    updateEntryStatus: 'manager',
    computeClosing: 'manager',
    readClosing: 'attendant',
    /** Totais por profissional — dono/administrador. */
    reportByProfessional: 'tenant_admin',
  },
  recall: {
    readCandidates: 'viewer',
    /** Enfileira recall via outbox — operação sensível. */
    sendPromotional: 'manager',
    cancelSend: 'manager',
    readTemplates: 'viewer',
    writeTemplates: 'manager',
    approveTemplate: 'manager',
  },
} as const;

export type PolicyResource = keyof typeof permissionPolicy;
export type PolicyAction<R extends PolicyResource> = keyof (typeof permissionPolicy)[R];

export function hasRequiredRole(role: string | undefined, minRole: keyof typeof roleLevel): boolean {
  if (!role || !(role in roleLevel)) return false;
  return roleLevel[role] >= roleLevel[minRole];
}

export function canAccess<R extends PolicyResource>(
  role: string | undefined,
  resource: R,
  action: PolicyAction<R>,
): boolean {
  /** No-show manual: balcão/gestão (`attendant`+), não o perfil `professional` (nível ≥ attendant mas papel distinto). */
  if (resource === 'appointments' && action === 'noShow') {
    if (!role || !(role in roleLevel)) return false;
    if (role === 'professional') return false;
    return hasRequiredRole(role, 'attendant');
  }
  const requiredRole = permissionPolicy[resource][action] as keyof typeof roleLevel;
  return hasRequiredRole(role, requiredRole);
}

export function requireRole(minRole: keyof typeof roleLevel) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const role = (request.user as any)?.role as string | undefined;
    if (!role || !(role in roleLevel)) {
      throw new AppError('FORBIDDEN', 'Perfil sem permissão', 403);
    }
    if (!hasRequiredRole(role, minRole)) {
      throw new AppError('FORBIDDEN', 'Permissão insuficiente', 403);
    }
  };
}

export function requirePermission<R extends PolicyResource>(resource: R, action: PolicyAction<R>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const role = (request.user as any)?.role as string | undefined;
    if (!canAccess(role, resource, action)) {
      throw new AppError('FORBIDDEN', 'Permissão insuficiente para este recurso', 403);
    }
  };
}
