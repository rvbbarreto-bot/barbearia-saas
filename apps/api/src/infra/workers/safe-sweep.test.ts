import { describe, expect, it, vi } from 'vitest';
import { runSweepSafely } from './safe-sweep.js';

describe('runSweepSafely', () => {
  it('engole erro do sweep sem propagar', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      runSweepSafely('test-worker', async () => {
        throw new Error('ENOTFOUND postgres');
      }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
