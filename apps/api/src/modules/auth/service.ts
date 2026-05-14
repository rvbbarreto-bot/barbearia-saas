import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '../../infra/db/pool.js';
import { redis } from '../../infra/redis/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAuthAudit } from './audit.js';
import { env } from '../../config/env.js';

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `tenant_id` opcional: omitido ou string vazia → resolve por e-mail se existir um único utilizador ativo; caso contrário exige UUID (multi-tenant). */
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenant_id: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().regex(UUID_LOOSE, 'Invalid UUID').optional(),
  ),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

type LoginOutput = {
  id: string;
  tenant_id: string | null;
  role: string;
  email: string;
  name: string;
  professional_id: string | null;
};

function isBcryptHash(value: string): boolean {
  return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');
}

async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  if (!isBcryptHash(passwordHash)) {
    throw new AppError('PASSWORD_HASH_INVALID', 'Senha de usuário não está em formato seguro', 500);
  }
  return bcrypt.compare(password, passwordHash);
}

export async function login(input: LoginInput): Promise<LoginOutput> {
  const data = loginInputSchema.parse(input);

  let result;
  if (data.tenant_id) {
    result = await pool.query(
      `SELECT id, tenant_id, role, email, name, password_hash, is_active,
              failed_login_count, locked_until, professional_id
         FROM users
        WHERE tenant_id = $1 AND email = $2
        LIMIT 1`,
      [data.tenant_id, data.email],
    );
  } else {
    result = await pool.query(
      `SELECT id, tenant_id, role, email, name, password_hash, is_active,
              failed_login_count, locked_until, professional_id
         FROM users
        WHERE email = $1 AND is_active = true`,
      [data.email],
    );
    if (result.rowCount && result.rowCount > 1) {
      throw new AppError(
        'TENANT_REQUIRED',
        'Este e-mail existe em mais de um tenant. Indique o Tenant ID (UUID) no login.',
        400,
      );
    }
  }

  if (!result.rowCount) {
    await writeAuthAudit({
      tenantId: data.tenant_id ?? null,
      action: 'AUTH_LOGIN_FAILED',
      reason: 'USER_NOT_FOUND',
    });
    throw new AppError('INVALID_CREDENTIALS', 'Credenciais inválidas', 401);
  }

  const user = result.rows[0] as {
    id: string;
    tenant_id: string | null;
    role: string;
    email: string;
    name: string;
    password_hash: string;
    is_active: boolean;
    failed_login_count: number;
    locked_until: Date | null;
    professional_id: string | null;
  };

  const tenantCtx = user.tenant_id;

  if (!user.is_active) {
    await writeAuthAudit({
      tenantId: tenantCtx,
      actorUserId: user.id,
      action: 'AUTH_LOGIN_FAILED',
      reason: 'USER_INACTIVE',
    });
    throw new AppError('USER_INACTIVE', 'Usuário inativo', 403);
  }

  // Verifica bloqueio por tentativas
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const unlockAt = new Date(user.locked_until).toISOString();
    await writeAuthAudit({
      tenantId: tenantCtx,
      actorUserId: user.id,
      action: 'AUTH_LOGIN_FAILED',
      reason: 'ACCOUNT_LOCKED',
    });
    throw new AppError('ACCOUNT_LOCKED', `Conta bloqueada até ${unlockAt}. Tente novamente mais tarde.`, 429);
  }

  const passwordOk = await comparePassword(data.password, user.password_hash);
  if (!passwordOk) {
    const newCount = (user.failed_login_count ?? 0) + 1;
    const shouldLock = newCount >= env.AUTH_MAX_FAILED_ATTEMPTS;
    await pool.query(
      `UPDATE users
          SET failed_login_count = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END,
              updated_at = now()
        WHERE id = $1`,
      [user.id, newCount, shouldLock, env.AUTH_LOCKOUT_MINUTES],
    );
    await writeAuthAudit({
      tenantId: tenantCtx,
      actorUserId: user.id,
      action: 'AUTH_LOGIN_FAILED',
      reason: 'INVALID_PASSWORD',
      metadata: { attempt: newCount, locked: shouldLock },
    });
    throw new AppError('INVALID_CREDENTIALS', 'Credenciais inválidas', 401);
  }

  // Login bem sucedido — reset de lockout e atualiza last_login_at
  await pool.query(
    `UPDATE users
        SET failed_login_count = 0,
            locked_until = NULL,
            last_login_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [user.id],
  );

  await writeAuthAudit({
    tenantId: tenantCtx,
    actorUserId: user.id,
    action: 'AUTH_LOGIN_SUCCESS',
  });

  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
    name: user.name,
    professional_id: user.professional_id ?? null,
  };
}

const RESET_TOKEN_TTL = 1800; // 30 minutos

export async function requestPasswordReset(email: string, tenantId: string): Promise<void> {
  const result = await pool.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND is_active = true LIMIT 1`,
    [tenantId, email],
  );
  if (!result.rowCount) return; // Não revelar se o e-mail existe (anti-enumeração)

  const userId = result.rows[0].id as string;
  const token = randomBytes(32).toString('hex');
  await redis.set(`pwreset:${token}`, `${userId}:${tenantId}`, 'EX', RESET_TOKEN_TTL);

  await writeAuthAudit({
    tenantId,
    actorUserId: userId,
    action: 'AUTH_PASSWORD_RESET_REQUESTED',
    metadata: { email },
  });

  // Em produção, enviar token por e-mail/WhatsApp
  // Por enquanto, o token é retornado no log (somente desenvolvimento)
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[DEV] Reset token for ${email}: ${token}`);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const value = await redis.get(`pwreset:${token}`);
  if (!value) throw new AppError('INVALID_RESET_TOKEN', 'Token inválido ou expirado', 400);

  const [userId, tenantId] = value.split(':');
  if (!userId || !tenantId) throw new AppError('INVALID_RESET_TOKEN', 'Token malformado', 400);

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `UPDATE users
        SET password_hash = $2,
            failed_login_count = 0,
            locked_until = NULL,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [userId, hash],
  );

  await redis.del(`pwreset:${token}`);

  await writeAuthAudit({
    tenantId,
    actorUserId: userId,
    action: 'AUTH_PASSWORD_RESET_COMPLETED',
  });
}
