/**
 * Isolamento multi-tenant na camada de serviço `users` (tabela sem RLS — ver docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createUser, deactivateUser, getUserById, listUsers, updateUser } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('users service tenant isolation', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const hash = bcrypt.hashSync('IsoTest_Password1!', 12);

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'IsoA','IsoA','trial','active',$3), ($2,'IsoB','IsoB','trial','active',$4)`,
      [tenantA, tenantB, `iso-a-${tenantA.slice(0, 8)}`, `iso-b-${tenantB.slice(0, 8)}`],
    );

    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role, is_active, password_changed_at)
       VALUES ($1,$2,'User A','iso-a-test@example.com',$3,'manager',true, now()),
              ($4,$5,'User B','iso-b-test@example.com',$3,'manager',true, now())`,
      [userA, tenantA, hash, userB, tenantB],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('Tenant A lista apenas utilizadores do tenant A', async () => {
    const r = await listUsers(tenantA, { page: 1, limit: 50 });
    const ids = r.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(userA);
    expect(ids).not.toContain(userB);
  });

  it('Tenant B lista apenas utilizadores do tenant B', async () => {
    const r = await listUsers(tenantB, { page: 1, limit: 50 });
    const ids = r.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(userB);
    expect(ids).not.toContain(userA);
  });

  it('getUserById do tenant A não devolve utilizador B', async () => {
    await expect(getUserById(tenantA, userB)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('updateUser cross-tenant não altera linhas (USER_NOT_FOUND)', async () => {
    await expect(updateUser(tenantA, userB, { name: 'Hacked' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('createUser mantém tenant_id do contexto', async () => {
    const email = `iso-new-${randomUUID().slice(0, 8)}@example.com`;
    const row = await createUser(tenantA, {
      name: 'Novo user',
      email,
      password: 'AnotherPass9!',
      role: 'viewer',
      is_active: true,
    });
    expect(row.tenant_id).toBe(tenantA);
    const other = await listUsers(tenantB, { page: 1, limit: 100 });
    expect(other.data.some((u: { email: string }) => u.email === email)).toBe(false);
    await pool.query(`DELETE FROM users WHERE id = $1`, [row.id]);
  });

  it('deactivateUser de outro tenant falha (actor fictício)', async () => {
    const actor = randomUUID();
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role, is_active, password_changed_at)
       VALUES ($1,$2,'Actor','actor-iso@example.com',$3,'tenant_admin',true, now())`,
      [actor, tenantA, hash],
    );
    await expect(deactivateUser(tenantA, userB, actor)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    await pool.query(`DELETE FROM users WHERE id = $1`, [actor]);
  });
});
