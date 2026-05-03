import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import {
  addProfessionalServices,
  createProfessional,
  getProfessionalById,
  listProfessionals,
  replaceProfessionalServices,
  updateProfessional,
} from './service.js';

export async function professionalRoutes(app: FastifyInstance) {
  app.get(
    '/professionals',
    { preHandler: requireRole('viewer') },
    async (request: any) => listProfessionals(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/professionals/:professionalId',
    { preHandler: requireRole('viewer') },
    async (request: any) => getProfessionalById(request.tenantId, request.params.professionalId),
  );

  app.post(
    '/professionals',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const created = await createProfessional(request.tenantId, request.body, request.user?.sub);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/professionals/:professionalId',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      updateProfessional(
        request.tenantId,
        request.params.professionalId,
        request.body ?? {},
        request.user?.sub,
      ),
  );

  /** Substitui o conjunto professional_services pelo array enviado. */
  app.patch(
    '/professionals/:professionalId/services',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      replaceProfessionalServices(
        request.tenantId,
        request.params.professionalId,
        request.body ?? {},
        request.user?.sub,
      ),
  );

  /** Acrescenta vínculos (serviços inativos ou fora do tenant são rejeitados). */
  app.post(
    '/professionals/:professionalId/services',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const updated = await addProfessionalServices(
        request.tenantId,
        request.params.professionalId,
        request.body ?? {},
        request.user?.sub,
      );
      return reply.code(200).send(updated);
    },
  );
}
