import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool } from '../../infra/db/pool.js';
import { login, loginInputSchema, requestPasswordReset, resetPassword } from './service.js';
import { writeAuthAudit } from './audit.js';
import {
  activateRefreshSession,
  revokeRefreshChain,
  revokeSession,
  rotateRefreshSession,
} from './session.js';

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refreshBodySchema = z.object({
  refresh_token: z.string().min(20),
});

type AuthUserClaims = {
  sub: string;
  tenant_id: string | null;
  role: string;
  email: string;
  name: string;
  professional_id?: string | null;
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', {
    config: { rateLimit: { max: env.AUTH_LOGIN_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW } },
  }, async (request: any, reply) => {
    const payload = loginInputSchema.parse(request.body);
    const user = await login(payload);

    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const baseClaims: AuthUserClaims = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
      name: user.name,
      professional_id: user.professional_id ?? null,
    };
    const token = await reply.jwtSign(
      {
        ...baseClaims,
        jti: accessJti,
        token_type: 'access',
      },
      {
        expiresIn: env.JWT_EXPIRES_IN,
      },
    );
    const refreshToken = await reply.jwtSign(
      {
        ...baseClaims,
        jti: refreshJti,
        token_type: 'refresh',
      },
      {
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      },
    );
    const refreshDecoded = app.jwt.decode<{ exp?: number }>(refreshToken);
    await activateRefreshSession(refreshJti, refreshDecoded?.exp);

    return reply.send({
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: env.JWT_EXPIRES_IN,
      refresh_expires_in: env.JWT_REFRESH_EXPIRES_IN,
      user,
    });
  });

  app.post('/auth/refresh', {
    config: { rateLimit: { max: env.AUTH_REFRESH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW } },
  }, async (request: any, reply) => {
    const payload = refreshBodySchema.parse(request.body);
    let decoded: any;
    try {
      decoded = await app.jwt.verify(payload.refresh_token);
    } catch {
      await writeAuthAudit({
        tenantId: null,
        action: 'AUTH_REFRESH_FAILED',
        reason: 'INVALID_REFRESH_TOKEN',
        ip: request.ip,
      });
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    }

    if (decoded?.token_type !== 'refresh' || !decoded?.jti) {
      await writeAuthAudit({
        tenantId: decoded?.tenant_id ?? null,
        actorUserId: decoded?.sub ?? null,
        action: 'AUTH_REFRESH_FAILED',
        reason: 'INVALID_REFRESH_TOKEN_TYPE',
        ip: request.ip,
      });
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    }

    const newAccessJti = randomUUID();
    const newRefreshJti = randomUUID();

    const userRow = await pool.query<{
      id: string;
      tenant_id: string | null;
      role: string;
      email: string;
      name: string;
      professional_id: string | null;
      is_active: boolean;
    }>(
      `SELECT id, tenant_id, role, email, name, professional_id, is_active
         FROM users WHERE id = $1 LIMIT 1`,
      [decoded.sub],
    );
    if (!userRow.rowCount || !userRow.rows[0].is_active) {
      await writeAuthAudit({
        tenantId: decoded.tenant_id ?? null,
        actorUserId: decoded.sub ?? null,
        action: 'AUTH_REFRESH_FAILED',
        reason: 'USER_NOT_FOUND_OR_INACTIVE',
        ip: request.ip,
      });
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    }
    const u = userRow.rows[0];

    try {
      await rotateRefreshSession({
        previousJti: decoded.jti,
        previousExp: decoded.exp,
        nextJti: newRefreshJti,
      });
    } catch {
      await writeAuthAudit({
        tenantId: decoded.tenant_id,
        actorUserId: decoded.sub,
        action: 'AUTH_REUSE_DETECTED',
        reason: 'REFRESH_TOKEN_REUSED',
        ip: request.ip,
      });
      return reply.code(401).send({ error: 'REFRESH_TOKEN_REUSED' });
    }

    const token = await reply.jwtSign(
      {
        sub: u.id,
        jti: newAccessJti,
        tenant_id: u.tenant_id,
        role: u.role,
        email: u.email,
        name: u.name,
        professional_id: u.professional_id ?? null,
        token_type: 'access',
      },
      { expiresIn: env.JWT_EXPIRES_IN },
    );
    const refreshToken = await reply.jwtSign(
      {
        sub: u.id,
        jti: newRefreshJti,
        tenant_id: u.tenant_id,
        role: u.role,
        email: u.email,
        name: u.name,
        professional_id: u.professional_id ?? null,
        token_type: 'refresh',
      },
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
    );
    const refreshDecoded = app.jwt.decode<{ exp?: number }>(refreshToken);
    await activateRefreshSession(newRefreshJti, refreshDecoded?.exp);
    await writeAuthAudit({
      tenantId: u.tenant_id ?? decoded.tenant_id ?? null,
      actorUserId: u.id,
      action: 'AUTH_REFRESH_SUCCESS',
      ip: request.ip,
      metadata: { previous_jti: decoded.jti, new_refresh_jti: newRefreshJti },
    });

    return reply.send({
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: env.JWT_EXPIRES_IN,
      refresh_expires_in: env.JWT_REFRESH_EXPIRES_IN,
    });
  });

  app.post('/auth/logout', {
    config: { rateLimit: { max: env.AUTH_LOGOUT_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW } },
  }, async (request: any, reply) => {
    const jti = request.user?.jti as string | undefined;
    const exp = request.user?.exp as number | undefined;
    if (!jti) return reply.code(400).send({ error: 'SESSION_ID_REQUIRED' });
    await revokeSession(jti, exp);
    const refreshToken = request.body && typeof request.body === 'object' ? (request.body as any).refresh_token : undefined;
    if (typeof refreshToken === 'string') {
      try {
        const decoded = await app.jwt.verify<any>(refreshToken);
        if (decoded?.jti) await revokeRefreshChain(decoded.jti);
      } catch {
        // ignore invalid refresh token during logout
      }
    }
    await writeAuthAudit({
      tenantId: request.user?.tenant_id,
      actorUserId: request.user?.sub,
      action: 'AUTH_LOGOUT',
      ip: request.ip,
      metadata: { access_jti: jti, has_refresh_token: typeof refreshToken === 'string' },
    });
    return reply.code(204).send();
  });

  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: any, reply) => {
    const { email, tenant_id } = z.object({
      email: z.string().email(),
      tenant_id: z.string().regex(UUID_LOOSE, 'Invalid UUID'),
    }).parse(request.body);
    await requestPasswordReset(email, tenant_id);
    return reply.code(202).send({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
  });

  app.post('/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: any, reply) => {
    const { token, password } = z.object({
      token: z.string().min(64).max(64),
      password: z.string().min(8),
    }).parse(request.body);
    await resetPassword(token, password);
    return reply.code(200).send({ message: 'Senha alterada com sucesso.' });
  });
}
