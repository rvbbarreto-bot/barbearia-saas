import type { FastifyRequest } from 'fastify';
import { resolveCorrelationId } from '../../shared/request-correlation.js';
import type { AppointmentMutationCaller } from './assert-appointment-mutation-scope.js';

export function appointmentCallerFromRequest(
  request: FastifyRequest & {
    user?: { sub?: string; role?: string; professional_id?: string };
    requestId?: string;
  },
  entityIdForFallback?: string,
): AppointmentMutationCaller {
  return {
    sub: request.user?.sub,
    role: request.user?.role,
    professional_id: request.user?.professional_id,
    requestId: request.requestId ?? request.id,
    correlationId:
      resolveCorrelationId(request.headers as Record<string, unknown>, entityIdForFallback) ??
      undefined,
  };
}
