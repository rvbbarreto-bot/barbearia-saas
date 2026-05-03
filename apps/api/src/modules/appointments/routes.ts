import { FastifyInstance } from 'fastify';
import { requirePermission, requireRole } from '../../middlewares/rbac.js';
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  createAppointment,
  createManualOverrideAppointment,
  createWalkInAppointment,
  getAppointmentHistory,
  getAppointmentStatusHistory,
  listAppointments,
  noShowAppointment,
  rescheduleAppointment,
  startAppointmentService,
} from './service.js';
import {
  createAppointmentHold,
  expireAppointmentHoldById,
  getAppointmentHoldById,
} from './appointment-holds.service.js';

export async function appointmentRoutes(app: FastifyInstance) {
  app.get(
    '/appointments',
    { preHandler: requirePermission('appointments', 'read') },
    async (request: any) =>
      listAppointments(request.tenantId, request.query as Record<string, unknown>, request.user),
  );

  app.get(
    '/appointments/:appointmentId/history',
    { preHandler: requirePermission('appointments', 'read') },
    async (request: any) => getAppointmentHistory(request.tenantId, request.params.appointmentId),
  );

  app.get(
    '/appointments/:appointmentId/status-history',
    { preHandler: requirePermission('appointments', 'read') },
    async (request: any) =>
      getAppointmentStatusHistory(request.tenantId, request.params.appointmentId),
  );

  app.post(
    '/appointment-holds',
    { preHandler: requirePermission('appointments', 'create') },
    async (request: any, reply) => {
      const row = await createAppointmentHold(request.tenantId, request.body);
      return reply.code(201).send(row);
    },
  );

  app.get(
    '/appointment-holds/:holdId',
    { preHandler: requirePermission('appointments', 'read') },
    async (request: any) => getAppointmentHoldById(request.tenantId, request.params.holdId),
  );

  app.patch(
    '/appointment-holds/:holdId/expire',
    { preHandler: requirePermission('appointments', 'create') },
    async (request: any) =>
      expireAppointmentHoldById(request.tenantId, request.params.holdId, request.user?.sub),
  );

  app.post(
    '/appointments',
    { preHandler: requirePermission('appointments', 'create') },
    async (request: any, reply) => {
      const created = await createAppointment(request.tenantId, request.body, {
        sub: request.user?.sub,
        role: (request.user as { role?: string })?.role,
      });
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/appointments/walk-in',
    { preHandler: requirePermission('appointments', 'walkIn') },
    async (request: any, reply) => {
      const created = await createWalkInAppointment(request.tenantId, request.body, {
        sub: request.user?.sub,
        role: (request.user as { role?: string })?.role,
      });
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/appointments/manual-override',
    { preHandler: requirePermission('appointments', 'manualOverride') },
    async (request: any, reply) => {
      const created = await createManualOverrideAppointment(request.tenantId, request.body, {
        sub: request.user?.sub,
        role: (request.user as { role?: string })?.role,
      });
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/appointments/:appointmentId/confirm',
    { preHandler: requirePermission('appointments', 'confirm') },
    async (request: any) =>
      confirmAppointment(request.tenantId, request.params.appointmentId, request.user?.sub),
  );

  app.patch(
    '/appointments/:appointmentId/cancel',
    { preHandler: requirePermission('appointments', 'cancel') },
    async (request: any) =>
      cancelAppointment(
        request.tenantId,
        { appointment_id: request.params.appointmentId, reason: request.body?.reason },
        request.user?.sub,
      ),
  );

  app.patch(
    '/appointments/:appointmentId/reschedule',
    { preHandler: requirePermission('appointments', 'reschedule') },
    async (request: any) =>
      rescheduleAppointment(
        request.tenantId,
        {
          appointment_id: request.params.appointmentId,
          starts_at: request.body?.starts_at,
          ends_at: request.body?.ends_at,
          reason: request.body?.reason,
        },
        request.user?.sub,
      ),
  );

  app.patch(
    '/appointments/:appointmentId/check-in',
    { preHandler: requirePermission('appointments', 'checkIn') },
    async (request: any) =>
      checkInAppointment(request.tenantId, request.params.appointmentId, request.user?.sub),
  );

  app.patch(
    '/appointments/:appointmentId/start',
    { preHandler: requirePermission('appointments', 'start') },
    async (request: any) =>
      startAppointmentService(request.tenantId, request.params.appointmentId, request.user?.sub),
  );

  app.patch(
    '/appointments/:appointmentId/complete',
    { preHandler: requirePermission('appointments', 'complete') },
    async (request: any) =>
      completeAppointment(request.tenantId, request.params.appointmentId, request.user?.sub),
  );

  app.patch(
    '/appointments/:appointmentId/no-show',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      noShowAppointment(
        request.tenantId,
        request.params.appointmentId,
        request.body?.reason,
        request.user?.sub,
      ),
  );
}
