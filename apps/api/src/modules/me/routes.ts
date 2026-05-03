import { FastifyInstance } from 'fastify';
import { pool } from '../../infra/db/pool.js';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', async (request: any) => {
    const userId = request.user?.sub as string;
    const result = await pool.query(
      `SELECT id, tenant_id, name, email, role, is_active, created_at, last_login_at, professional_id
         FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    if (!result.rowCount) return request.server.httpErrors?.notFound?.() ?? { error: 'USER_NOT_FOUND' };
    const user = result.rows[0] as Record<string, unknown>;
    delete user.password_hash;
    return user;
  });
}
