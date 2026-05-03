import { randomUUID } from 'node:crypto';
import { FastifyRequest } from 'fastify';

export function generateRequestId(): string {
  return randomUUID();
}

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export function attachRequestId(request: FastifyRequest): void {
  (request as FastifyRequest & { requestId: string }).requestId =
    (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
}
