import { FastifyInstance } from 'fastify';
import {
  cancelPortalAppointmentByToken,
  confirmPortalAppointmentByToken,
  getPortalAppointmentByToken,
  portalTokenParamSchema,
} from './service.js';

/** Rotas públicas — registadas sem prefixo /api/v1 e sem JWT. */
export async function portalPublicRoutes(app: FastifyInstance) {
  app.get('/public/portal/appointments/:token', async (request: any, reply) => {
    const { token } = portalTokenParamSchema.parse(request.params);
    try {
      const view = await getPortalAppointmentByToken(token);
      return reply.send(view);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? 'PORTAL_ERROR',
        message: e.message ?? 'Não foi possível carregar o agendamento.',
      });
    }
  });

  app.post('/public/portal/appointments/:token/confirm', async (request: any, reply) => {
    const { token } = portalTokenParamSchema.parse(request.params);
    try {
      const view = await confirmPortalAppointmentByToken(token);
      return reply.send(view);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? 'PORTAL_ERROR',
        message: e.message ?? 'Não foi possível confirmar.',
      });
    }
  });

  app.post('/public/portal/appointments/:token/cancel', async (request: any, reply) => {
    const { token } = portalTokenParamSchema.parse(request.params);
    try {
      const view = await cancelPortalAppointmentByToken(token);
      return reply.send(view);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? 'PORTAL_ERROR',
        message: e.message ?? 'Não foi possível cancelar.',
      });
    }
  });
}
