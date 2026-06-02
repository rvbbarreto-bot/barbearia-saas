import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getIntegrationLookupPool } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { shouldDispatchAgent } from './agent-dispatch.service.js';
import { resolveConversationContext } from './conversation-context.service.js';
import { withTenant } from '../../infra/db/pool.js';

const querySchema = z.object({
  tenant_id: z.string().min(32),
  customer_id: z.string().uuid(),
  dispatch_token: z.string().uuid(),
});

/**
 * Gate pós-debounce para o WF01 (n8n Wait → GET).
 * Autenticação: x-webhook-token igual ao webhook_token do tenant.
 */
export async function agentDispatchRoutes(app: FastifyInstance) {
  app.get('/webhooks/whatsapp/agent-dispatch', async (request, reply) => {
    const rawToken = request.headers['x-webhook-token'];
    const webhookToken = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();
    if (!webhookToken) {
      return reply.code(401).send({
        error: 'INVALID_WEBHOOK_TOKEN',
        message: 'Header x-webhook-token obrigatório',
        request_id: request.id,
      });
    }

    let query;
    try {
      query = querySchema.parse(request.query);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'PAYLOAD_INVALID',
          message: 'Query inválida',
          request_id: request.id,
        });
      }
      throw err;
    }

    const tenantRow = await getIntegrationLookupPool().query<{ webhook_token: string }>(
      `SELECT webhook_token FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [query.tenant_id],
    );
    if (!tenantRow.rowCount || tenantRow.rows[0].webhook_token !== webhookToken) {
      throw new AppError('INVALID_WEBHOOK_TOKEN', 'Webhook token inválido ou ausente', 401);
    }

    const should_dispatch = await shouldDispatchAgent(
      query.tenant_id,
      query.customer_id,
      query.dispatch_token,
    );

    let conversationContext = null;
    if (should_dispatch) {
      conversationContext = await withTenant(query.tenant_id, async (client) =>
        resolveConversationContext(client, query.tenant_id, query.customer_id),
      );
    }

    return reply.code(200).send({
      ok: true,
      should_dispatch,
      conversationContext,
    });
  });
}
