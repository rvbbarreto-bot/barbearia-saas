import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from './service.js';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
const { redisMock } = vi.hoisted(() => ({ redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), ping: vi.fn() } }));

vi.mock('../../config/env.js', () => ({
  env: {
    AUTH_MAX_FAILED_ATTEMPTS: 5,
    AUTH_LOCKOUT_MINUTES: 15,
    NODE_ENV: 'test',
  },
}));
vi.mock('../../infra/db/pool.js', () => ({ pool: { query: queryMock } }));
vi.mock('../../infra/redis/client.js', () => ({ redis: redisMock }));

const BASE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  role: 'tenant_owner',
  email: 'admin@demo.local',
  name: 'Admin Demo',
  password_hash: '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  is_active: true,
  failed_login_count: 0,
  locked_until: null,
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('auth login service', () => {
  beforeEach(() => { queryMock.mockReset(); });

  it('rejects when user does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // SELECT user
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // audit log INSERT

    await expect(
      login({ tenant_id: TENANT_ID, email: 'missing@demo.local', password: 'admin12345' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('rejects when user is inactive', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ ...BASE_USER, is_active: false }] });
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // audit log

    await expect(
      login({ tenant_id: TENANT_ID, email: 'admin@demo.local', password: 'admin12345' }),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE', statusCode: 403 });
  });

  it('rejects when account is locked', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...BASE_USER, failed_login_count: 5, locked_until: new Date(Date.now() + 10 * 60_000) }],
    });
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // audit log

    await expect(
      login({ tenant_id: TENANT_ID, email: 'admin@demo.local', password: 'admin12345' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 429 });
  });

  it('rejects invalid password and increments failed_login_count', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [BASE_USER] }); // SELECT user
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });           // UPDATE failed_login_count
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });           // audit log

    await expect(
      login({ tenant_id: TENANT_ID, email: 'admin@demo.local', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('returns user on valid bcrypt credentials and resets lockout', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [BASE_USER] }); // SELECT user
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });          // UPDATE last_login_at / reset
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });          // audit log

    const user = await login({ tenant_id: TENANT_ID, email: 'admin@demo.local', password: 'admin12345' });

    expect(user.email).toBe('admin@demo.local');
    expect(user.role).toBe('tenant_owner');
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('rejects non-bcrypt password hashes', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...BASE_USER, password_hash: 'plain-text-password' }],
    });

    await expect(
      login({ tenant_id: TENANT_ID, email: 'admin@demo.local', password: 'admin12345' }),
    ).rejects.toMatchObject({ code: 'PASSWORD_HASH_INVALID', statusCode: 500 });
  });
});
