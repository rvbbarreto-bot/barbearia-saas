import { redis } from '../../infra/redis/client.js';

function sessionKey(jti: string): string {
  return `session:revoked:${jti}`;
}

function refreshActiveKey(jti: string): string {
  return `refresh:active:${jti}`;
}

function refreshChildKey(jti: string): string {
  return `refresh:child:${jti}`;
}

export async function revokeSession(jti: string, exp?: number): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = Math.max((exp ?? nowSeconds + 900) - nowSeconds, 1);
  await redis.set(sessionKey(jti), '1', 'EX', ttl);
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  const value = await redis.get(sessionKey(jti));
  return value === '1';
}

export async function activateRefreshSession(jti: string, exp?: number): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = Math.max((exp ?? nowSeconds + 7 * 24 * 3600) - nowSeconds, 1);
  await redis.set(refreshActiveKey(jti), '1', 'EX', ttl);
}

export async function isRefreshSessionActive(jti: string): Promise<boolean> {
  const value = await redis.get(refreshActiveKey(jti));
  return value === '1';
}

export async function rotateRefreshSession(input: {
  previousJti: string;
  previousExp?: number;
  nextJti: string;
  nextExp?: number;
}): Promise<void> {
  const currentlyActive = await isRefreshSessionActive(input.previousJti);
  if (!currentlyActive) {
    await revokeRefreshChain(input.previousJti);
    throw new Error('REFRESH_TOKEN_REUSED');
  }

  await revokeSession(input.previousJti, input.previousExp);
  await redis.del(refreshActiveKey(input.previousJti));
  await activateRefreshSession(input.nextJti, input.nextExp);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = Math.max((input.nextExp ?? nowSeconds + 7 * 24 * 3600) - nowSeconds, 1);
  await redis.set(refreshChildKey(input.previousJti), input.nextJti, 'EX', ttl);
}

export async function revokeRefreshChain(startJti: string): Promise<void> {
  let current: string | null = startJti;
  while (current) {
    await redis.del(refreshActiveKey(current));
    const child = await redis.get(refreshChildKey(current));
    await redis.del(refreshChildKey(current));
    current = child;
  }
}
