import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';

const BCRYPT_ROUNDS = 12;

const createUserSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(['tenant_owner', 'tenant_admin', 'manager', 'professional', 'attendant', 'viewer']),
  is_active: z.boolean().default(true),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  role: z.enum(['tenant_owner', 'tenant_admin', 'manager', 'professional', 'attendant', 'viewer']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(10).optional(),
});

export async function listUsers(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const [data, count] = await Promise.all([
    pool.query(
      `SELECT id, tenant_id, name, email, role, is_active, created_at, last_login_at
         FROM users WHERE tenant_id = $1
        ORDER BY name ASC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1`,
      [tenantId],
    ),
  ]);
  return { data: data.rows, total: count.rows[0].total as number, page, limit };
}

export async function getUserById(tenantId: string, userId: string) {
  const result = await pool.query(
    `SELECT id, tenant_id, name, email, role, is_active, created_at, last_login_at
       FROM users WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, userId],
  );
  if (!result.rowCount) throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
  return result.rows[0];
}

export async function createUser(tenantId: string, input: z.infer<typeof createUserSchema>) {
  const data = createUserSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const result = await pool.query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, is_active, password_changed_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     RETURNING id, tenant_id, name, email, role, is_active, created_at`,
    [tenantId, data.name, data.email, passwordHash, data.role, data.is_active],
  );
  return result.rows[0];
}

export async function updateUser(
  tenantId: string,
  userId: string,
  input: z.infer<typeof updateUserSchema>,
) {
  const data = updateUserSchema.parse(input);
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(data.name); }
  if (data.role !== undefined) { setClauses.push(`role = $${idx++}`); params.push(data.role); }
  if (data.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(data.is_active); }
  if (data.password !== undefined) {
    const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    setClauses.push(`password_hash = $${idx++}`);
    params.push(hash);
    setClauses.push(`password_changed_at = now()`);
    setClauses.push(`failed_login_count = 0`);
    setClauses.push(`locked_until = NULL`);
  }

  if (setClauses.length === 0) throw new AppError('NO_CHANGES', 'Nenhum campo para atualizar', 400);

  params.push(tenantId, userId);
  const result = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = now()
      WHERE tenant_id = $${idx} AND id = $${idx + 1}
      RETURNING id, tenant_id, name, email, role, is_active, updated_at`,
    params,
  );
  if (!result.rowCount) throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
  return result.rows[0];
}

export async function deactivateUser(tenantId: string, userId: string, actorId: string) {
  if (userId === actorId) throw new AppError('CANNOT_DEACTIVATE_SELF', 'Você não pode desativar sua própria conta', 400);
  const result = await pool.query(
    `UPDATE users SET is_active = false, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, is_active`,
    [tenantId, userId],
  );
  if (!result.rowCount) throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
  return result.rows[0];
}
