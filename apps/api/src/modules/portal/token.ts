import { createHash, randomBytes } from 'node:crypto';

export function generatePortalTokenPlain(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPortalToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}
