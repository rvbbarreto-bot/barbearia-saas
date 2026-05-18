import { describe, expect, it } from 'vitest';
import { generatePortalTokenPlain, hashPortalToken } from './token.js';

describe('portal token hashing', () => {
  it('gera token com tamanho mínimo e hash determinístico', () => {
    const plain = generatePortalTokenPlain();
    expect(plain.length).toBeGreaterThanOrEqual(32);
    expect(hashPortalToken(plain)).toHaveLength(64);
    expect(hashPortalToken(plain)).toBe(hashPortalToken(plain));
  });

  it('hashes distintos para tokens distintos', () => {
    const a = generatePortalTokenPlain();
    const b = generatePortalTokenPlain();
    expect(hashPortalToken(a)).not.toBe(hashPortalToken(b));
  });
});
