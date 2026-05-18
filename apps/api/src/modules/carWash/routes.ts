import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { applyCarWashJobAction, createCarWashChecklist, listCarWashJobs } from './service.js';
import type { CarWashStageAction } from './stages.js';

function callerFromRequest(request: { user?: { sub?: string; role?: string }; id?: string }) {
  return {
    sub: request.user?.sub,
    role: request.user?.role,
    requestId: request.id,
    correlationId: request.id,
  };
}

const ACTION_ROUTES: { path: string; action: CarWashStageAction }[] = [
  { path: '/arrive', action: 'arrive' },
  { path: '/start', action: 'start' },
  { path: '/quality-check', action: 'quality-check' },
  { path: '/ready', action: 'ready' },
  { path: '/deliver', action: 'deliver' },
  { path: '/cancel', action: 'cancel' },
];

export async function carWashRoutes(app: FastifyInstance) {
  app.get(
    '/car-wash/jobs',
    { preHandler: requireRole('attendant') },
    async (request: any) => listCarWashJobs(request.tenantId, request.query as Record<string, unknown>),
  );

  for (const { path, action } of ACTION_ROUTES) {
    app.patch(
      `/car-wash/jobs/:jobId${path}`,
      { preHandler: requireRole('attendant') },
      async (request: any) =>
        applyCarWashJobAction(
          request.tenantId,
          request.params.jobId,
          action,
          callerFromRequest(request),
        ),
    );
  }

  app.post(
    '/car-wash/jobs/:jobId/checklists',
    { preHandler: requireRole('attendant') },
    async (request: any, reply) => {
      const row = await createCarWashChecklist(
        request.tenantId,
        request.params.jobId,
        request.body,
        callerFromRequest(request),
      );
      return reply.code(201).send(row);
    },
  );
}
