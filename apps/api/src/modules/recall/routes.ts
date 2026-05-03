import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { listRecallCandidates } from './candidates.service.js';
import {
  listNotificationTemplates,
  patchTemplateApproval,
  upsertNotificationTemplate,
} from './templates.service.js';
import { cancelRecallSend } from './cancel.service.js';

export async function recallRoutes(app: FastifyInstance) {
  app.get(
    '/recall/candidates',
    { preHandler: requireRole('viewer') },
    async (request: any) => {
      const candidates = await listRecallCandidates(request.tenantId);
      return { candidates };
    },
  );

  app.post(
    '/recall/cancel',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const id = request.body?.source_appointment_id;
      if (!id || typeof id !== 'string') {
        return reply.code(400).send({ error: 'INVALID_BODY', message: 'source_appointment_id obrigatório' });
      }
      const row = await cancelRecallSend(request.tenantId, id);
      return reply.code(200).send(row);
    },
  );

  app.get(
    '/notification-templates',
    { preHandler: requireRole('viewer') },
    async (request: any) => {
      const templates = await listNotificationTemplates(request.tenantId);
      return { templates };
    },
  );

  app.put(
    '/notification-templates',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const body = request.body as {
        template_key: string;
        body_template: string;
        approval_status?: 'draft' | 'approved' | 'rejected';
        active?: boolean;
      };
      if (!body?.template_key || !body?.body_template) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: 'template_key e body_template obrigatórios' });
      }
      const row = await upsertNotificationTemplate(request.tenantId, body);
      return reply.code(200).send(row);
    },
  );

  app.patch(
    '/notification-templates/:templateId/approval',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      patchTemplateApproval(request.tenantId, request.params.templateId, request.body),
  );
}
