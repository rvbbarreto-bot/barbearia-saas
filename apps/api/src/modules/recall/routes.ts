import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { listRecallCandidatesForApi } from './candidates.service.js';
import {
  listNotificationTemplates,
  patchTemplateApproval,
  upsertNotificationTemplate,
} from './templates.service.js';
import { cancelRecallSend } from './cancel.service.js';
import { requestRecallPromotionalSend } from './send.service.js';

export async function recallRoutes(app: FastifyInstance) {
  app.get(
    '/recall/candidates',
    { preHandler: requirePermission('recall', 'readCandidates') },
    async (request: any) => {
      const q = request.query as Record<string, unknown>;
      return listRecallCandidatesForApi(request.tenantId, q);
    },
  );

  app.post(
    '/recall/send',
    { preHandler: requirePermission('recall', 'sendPromotional') },
    async (request: any, reply) => {
      const row = await requestRecallPromotionalSend(request.tenantId, request.body, request.user?.sub);
      return reply.code(200).send(row);
    },
  );

  app.post(
    '/recall/cancel',
    { preHandler: requirePermission('recall', 'cancelSend') },
    async (request: any, reply) => {
      const id = (request.body as { source_appointment_id?: string })?.source_appointment_id;
      if (!id || typeof id !== 'string') {
        return reply.code(400).send({ error: 'INVALID_BODY', message: 'source_appointment_id obrigatório' });
      }
      const row = await cancelRecallSend(request.tenantId, id);
      return reply.code(200).send(row);
    },
  );

  app.get(
    '/notification-templates',
    { preHandler: requirePermission('recall', 'readTemplates') },
    async (request: any) => {
      const templates = await listNotificationTemplates(request.tenantId);
      return { templates };
    },
  );

  app.put(
    '/notification-templates',
    { preHandler: requirePermission('recall', 'writeTemplates') },
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
    { preHandler: requirePermission('recall', 'approveTemplate') },
    async (request: any) =>
      patchTemplateApproval(request.tenantId, request.params.templateId, request.body),
  );
}
