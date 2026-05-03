import { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../infra/redis/client.js';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors.js';

export async function tenantRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = (request as FastifyRequest & { tenantId?: string }).tenantId;
  if (!tenantId) return;

  const windowMinute = Math.floor(Date.now() / 60_000);
  const key = `ratelimit:tenant:${tenantId}:${windowMinute}`;

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 65);

  const limit = env.TENANT_DEFAULT_RPM;
  reply.header('X-RateLimit-Limit', String(limit));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

  if (count > limit) {
    reply.header('Retry-After', '60');
    throw new AppError('TENANT_RATE_LIMIT', `Limite de ${limit} requisições/minuto excedido para este tenant.`, 429);
  }
}
