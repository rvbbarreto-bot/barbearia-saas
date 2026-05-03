import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withAppointmentLock } from './lock.js';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: redisMock,
}));

describe('appointment redis lock', () => {
  beforeEach(() => {
    redisMock.set.mockReset();
    redisMock.eval.mockReset();
  });

  it('throws when lock is not acquired', async () => {
    redisMock.set.mockResolvedValueOnce(null);
    await expect(withAppointmentLock('lock:key', async () => ({ ok: true }))).rejects.toMatchObject({
      code: 'APPOINTMENT_LOCKED',
      statusCode: 409,
    });
  });

  it('executes critical section and releases lock', async () => {
    redisMock.set.mockResolvedValueOnce('OK');
    redisMock.eval.mockResolvedValueOnce(1);
    const result = await withAppointmentLock('lock:key', async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    expect(redisMock.eval).toHaveBeenCalled();
  });
});
