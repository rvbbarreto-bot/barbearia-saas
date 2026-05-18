import { FastifyInstance } from 'fastify';
import { withTenant } from '../../infra/db/pool.js';
import { requirePermission } from '../../middlewares/rbac.js';
import {
  applyAppointmentFinancialDiscount,
  exportAppointmentFinancialsCsv,
  getAppointmentFinancial,
  getDailyFinanceReport,
  listAppointmentFinancials,
  settleAppointmentFinancial,
} from './service.js';

export async function financeRoutes(app: FastifyInstance) {
  app.get(
    '/finance/appointments',
    { preHandler: requirePermission('finance', 'readAppointment') },
    async (request: any) => listAppointmentFinancials(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/finance/appointments/export.csv',
    { preHandler: requirePermission('finance', 'readAppointment') },
    async (request: any, reply) => {
      const csv = await exportAppointmentFinancialsCsv(
        request.tenantId,
        request.query as Record<string, unknown>,
      );
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="financeiro-export.csv"')
        .send(csv);
    },
  );

  app.get(
    '/finance/appointments/:appointmentId',
    { preHandler: requirePermission('finance', 'readAppointment') },
    async (request: any) =>
      withTenant(request.tenantId, async (client) =>
        getAppointmentFinancial(client, request.tenantId, request.params.appointmentId),
      ),
  );

  app.patch(
    '/finance/appointments/:appointmentId/settle',
    { preHandler: requirePermission('finance', 'settleBalance') },
    async (request: any) =>
      settleAppointmentFinancial(
        request.tenantId,
        request.params.appointmentId,
        request.body,
        request.user?.sub,
      ),
  );

  app.patch(
    '/finance/appointments/:appointmentId/discount',
    { preHandler: requirePermission('finance', 'applyDiscount') },
    async (request: any) =>
      applyAppointmentFinancialDiscount(request.tenantId, request.params.appointmentId, request.body, {
        sub: request.user?.sub,
        role: (request.user as { role?: string })?.role,
      }),
  );

  app.get(
    '/finance/reports/daily',
    { preHandler: requirePermission('finance', 'dailyReport') },
    async (request: any) => {
      const date = String((request.query as { date?: string }).date ?? '');
      return getDailyFinanceReport(request.tenantId, date);
    },
  );
}
