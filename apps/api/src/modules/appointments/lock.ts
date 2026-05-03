import { randomUUID } from 'node:crypto';
import { redis } from '../../infra/redis/client.js';
import { AppError } from '../../shared/errors.js';

const LOCK_TTL_SECONDS = 10;

export async function withAppointmentLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const acquired = await redis.set(lockKey, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  if (acquired !== 'OK') {
    throw new AppError('APPOINTMENT_LOCKED', 'Operação em processamento. Tente novamente.', 409);
  }

  try {
    return await fn();
  } finally {
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then
         return redis.call("del", KEYS[1])
       else
         return 0
       end`,
      1,
      lockKey,
      token,
    );
  }
}
