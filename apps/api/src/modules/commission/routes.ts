import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { computeClosingBodySchema } from './schemas.js';
import {
  computeCashClosingForDate,
  createCommissionRule,
  listCashClosings,
  listCommissionEntries,
  listCommissionRules,
  patchCommissionEntryStatus,
  patchCommissionRule,
  reportCommissionTotalsByProfessional,
} from './service.js';

export async function commissionRoutes(app: FastifyInstance) {
  app.get(
    '/commission/rules',
    { preHandler: requirePermission('commissions', 'readRules') },
    async (request: any) => {
      const activeOnly = String((request.query as { active_only?: string }).active_only ?? '') === 'true';
      return listCommissionRules(request.tenantId, activeOnly);
    },
  );

  app.post(
    '/commission/rules',
    { preHandler: requirePermission('commissions', 'manageRules') },
    async (request: any, reply) => {
      const row = await createCommissionRule(request.tenantId, request.body, request.user?.sub);
      return reply.code(201).send(row);
    },
  );

  app.patch(
    '/commission/rules/:ruleId',
    { preHandler: requirePermission('commissions', 'manageRules') },
    async (request: any) => patchCommissionRule(request.tenantId, request.params.ruleId, request.body, request.user?.sub),
  );

  app.get(
    '/commission/entries',
    { preHandler: requirePermission('commissions', 'readEntries') },
    async (request: any) => listCommissionEntries(request.tenantId, request.query as Record<string, unknown>),
  );

  app.patch(
    '/commission/entries/:entryId/status',
    { preHandler: requirePermission('commissions', 'updateEntryStatus') },
    async (request: any) =>
      patchCommissionEntryStatus(request.tenantId, request.params.entryId, request.body, request.user?.sub),
  );

  app.post(
    '/commission/cash-closings/compute',
    { preHandler: requirePermission('commissions', 'computeClosing') },
    async (request: any) => {
      const { date } = computeClosingBodySchema.parse(request.body);
      return computeCashClosingForDate(request.tenantId, date);
    },
  );

  app.get(
    '/commission/cash-closings',
    { preHandler: requirePermission('commissions', 'readClosing') },
    async (request: any) => listCashClosings(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/commission/reports/by-professional',
    { preHandler: requirePermission('commissions', 'reportByProfessional') },
    async (request: any) =>
      reportCommissionTotalsByProfessional(request.tenantId, request.query as Record<string, unknown>),
  );
}
