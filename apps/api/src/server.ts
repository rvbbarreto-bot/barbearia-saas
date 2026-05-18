import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { tenantMiddleware } from './middlewares/tenant.js';
import { tenantRateLimit } from './middlewares/tenant-rate-limit.js';
import { authRoutes } from './modules/auth/routes.js';
import { appointmentRoutes } from './modules/appointments/routes.js';
import { availabilityRoutes } from './modules/availability/routes.js';
import { businessHoursRoutes } from './modules/businessHours/routes.js';
import { professionalRecurringTimeOffRoutes } from './modules/professionalRecurringTimeOff/routes.js';
import { professionalTimeOffRoutes } from './modules/professionalTimeOff/routes.js';
import { whatsappRoutes } from './modules/whatsapp/routes.js';
import { paymentRoutes, pixWebhookRoutes } from './modules/payments/routes.js';
import { tenantRoutes } from './modules/tenants/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { customerRoutes } from './modules/customers/routes.js';
import { professionalRoutes } from './modules/professionals/routes.js';
import { serviceRoutes } from './modules/services/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { calendarBlockRoutes } from './modules/calendarBlocks/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { supportTicketRoutes } from './modules/supportTickets/routes.js';
import { tenantOperationalRoutes } from './modules/tenantOperational/routes.js';
import { startLatenessWorker } from './modules/appointments/lateness.service.js';
import { startHoldExpiryWorker } from './modules/appointments/holds.worker.js';
import { startPixPaymentExpiryWorker } from './modules/payments/pix.worker.js';
import { consentRoutes } from './modules/consents/routes.js';
import { recallRoutes } from './modules/recall/routes.js';
import { waitlistRoutes } from './modules/waitlist/routes.js';
import { integrationsRoutes } from './modules/integrations/routes.js';
import { outboxRoutes } from './modules/outbox/routes.js';
import { startWaitlistSweepWorker } from './modules/waitlist/sweep.worker.js';
import { financeRoutes } from './modules/finance/routes.js';
import { commissionRoutes } from './modules/commission/routes.js';
import { managementRoutes } from './modules/management/routes.js';
import { portalPublicRoutes } from './modules/portal/routes.js';
import { vehicleRoutes } from './modules/vehicles/routes.js';
import { carWashRoutes } from './modules/carWash/routes.js';
import { isSessionRevoked } from './modules/auth/session.js';
import { startOutboxWorker } from './infra/queues/outbox-worker.js';
import { startNotificationJobsWorker } from './modules/notificationJobs/worker.js';
import { registerOpenApi } from './openapi/register-openapi.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    serializers: {
      req(request) {
        return { method: request.method, url: request.url, requestId: request.id };
      },
    },
  },
  genReqId: () => randomUUID(),
  trustProxy: true,
});

// Raw body capture (necessario para HMAC no webhook WhatsApp)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(helmet);
await app.register(cors, {
  origin:
    env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
});
await app.register(rateLimit, { max: 500, timeWindow: '1 minute' });
await app.register(jwt, { secret: env.JWT_SECRET });

app.setErrorHandler((error, request, reply) => {
  const isZodValidationError =
    error instanceof ZodError ||
    (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'ZodError' &&
      Array.isArray((error as { issues?: unknown[] }).issues)
    );

  if (isZodValidationError) {
    const zodErr = error as ZodError;
    return reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Payload inválido.',
      issues: zodErr.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
      request_id: request.id,
    });
  }

  const err = error as {
    statusCode?: number;
    code?: string;
    message?: string;
  };

  const statusCode = err.statusCode ?? 500;

  if (statusCode >= 500) {
    app.log.error(
      { err: error, requestId: request.id },
      err.message ?? 'Unexpected error',
    );
  }

  return reply.code(statusCode).send({
    error: err.code ?? 'INTERNAL_ERROR',
    message: err.message ?? 'Unexpected error',
    request_id: request.id,
  });
});

// Healthchecks
app.get('/health/live', async () => ({ status: 'ok' }));
app.get('/health/ready', async (_request, reply) => {
  const { pool } = await import('./infra/db/pool.js');
  const { redis } = await import('./infra/redis/client.js');
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    return reply.code(200).send({ status: 'ok' });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return reply.code(503).send({ status: 'degraded', error });
  }
});
app.get('/health', async (_request, reply) => reply.code(200).send({ status: 'ok' }));

/** Verificação apenas PostgreSQL (QA/docs); readiness completo continua em `/health/ready`. */
app.get('/database/health', async (_request, reply) => {
  const { pool } = await import('./infra/db/pool.js');
  try {
    await pool.query('SELECT 1 AS ok');
    return reply.code(200).send({ status: 'ok', database: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(503).send({ status: 'error', database: 'disconnected', error: message });
  }
});

await registerOpenApi(app, env.NODE_ENV);

// Rotas publicas (sem auth)
await app.register(authRoutes);
await app.register(whatsappRoutes);
await app.register(pixWebhookRoutes);
await app.register(portalPublicRoutes, { prefix: '/api/v1' });

const PUBLIC_PATHS = [
  '/health',
  '/database/health',
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/webhooks/whatsapp/inbound',
  '/webhooks/payments/pix',
  '/api/v1/public/portal',
];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/docs')) return true;
  if (path.startsWith('/documentation')) return true;
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

// Autenticacao global + tenant + rate-limit por tenant
app.addHook('preHandler', async (request, reply) => {
  if (isPublicPath(request.url)) return;

  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', request_id: request.id });
  }

  const jti = (request.user as { jti?: string }).jti;
  if (jti && (await isSessionRevoked(jti))) {
    return reply.code(401).send({ error: 'SESSION_REVOKED', request_id: request.id });
  }

  await tenantMiddleware(request, reply);
  await tenantRateLimit(request, reply);
});

// Rotas protegidas - prefixo /api/v1
await app.register(meRoutes, { prefix: '/api/v1' });
await app.register(tenantRoutes, { prefix: '/api/v1' });
await app.register(userRoutes, { prefix: '/api/v1' });
await app.register(customerRoutes, { prefix: '/api/v1' });
await app.register(professionalRoutes, { prefix: '/api/v1' });
await app.register(serviceRoutes, { prefix: '/api/v1' });
await app.register(appointmentRoutes, { prefix: '/api/v1' });
await app.register(availabilityRoutes, { prefix: '/api/v1' });
await app.register(businessHoursRoutes, { prefix: '/api/v1' });
await app.register(professionalRecurringTimeOffRoutes, { prefix: '/api/v1' });
await app.register(professionalTimeOffRoutes, { prefix: '/api/v1' });
await app.register(calendarBlockRoutes, { prefix: '/api/v1' });
await app.register(auditRoutes, { prefix: '/api/v1' });
await app.register(supportTicketRoutes, { prefix: '/api/v1' });
await app.register(tenantOperationalRoutes, { prefix: '/api/v1' });
await app.register(consentRoutes, { prefix: '/api/v1' });
await app.register(recallRoutes, { prefix: '/api/v1' });
await app.register(waitlistRoutes, { prefix: '/api/v1' });
await app.register(integrationsRoutes, { prefix: '/api/v1' });
await app.register(outboxRoutes, { prefix: '/api/v1' });
await app.register(financeRoutes, { prefix: '/api/v1' });
await app.register(commissionRoutes, { prefix: '/api/v1' });
await app.register(managementRoutes, { prefix: '/api/v1' });
await app.register(vehicleRoutes, { prefix: '/api/v1' });
await app.register(carWashRoutes, { prefix: '/api/v1' });
await app.register(paymentRoutes, { prefix: '/api/v1' });

// Varredura waitlist → notification_jobs (intervalo configurável; desativado por defeito no env)
startWaitlistSweepWorker();

// Worker de outbox (envia mensagens WhatsApp assincronamente)
startOutboxWorker();

// Lembretes, confirmação via fila e jobs pós-conclusão (outbox no processamento)
startNotificationJobsWorker();

// Expiração automática de appointment_holds (TTL)
startHoldExpiryWorker();

// Expiração de cobranças Pix pendentes (liberta slot `awaiting_payment` → `expired`)
startPixPaymentExpiryWorker();

// Transições de atraso / no_show_pending (política por tenant)
startLatenessWorker();

await app.listen({ port: env.PORT, host: '0.0.0.0' });