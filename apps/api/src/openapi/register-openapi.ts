import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { openApiDocument } from './spec.js';

/** OpenAPI + Swagger UI em `/docs` (apenas development/test local). */
export async function registerOpenApi(app: FastifyInstance, nodeEnv: string): Promise<void> {
  if (nodeEnv === 'production' || nodeEnv === 'staging') return;

  await app.register(swagger, {
    openapi: openApiDocument as unknown as Record<string, unknown>,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', filter: true, deepLinking: true },
    staticCSP: true,
  });
}
