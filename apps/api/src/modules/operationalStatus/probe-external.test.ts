import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeEvolution, probeN8n } from './probe-external.js';

describe('probe-external', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
  });

  it('returns not_probed when URLs unset', async () => {
    expect(await probeN8n()).toEqual({ state: 'not_probed', error: null });
    expect(await probeEvolution()).toEqual({ state: 'not_probed', error: null });
  });

  it('probes n8n when configured', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://n8n.test/webhook/';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const r = await probeN8n();
    expect(r.state).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('returns degraded on evolution probe failure without throwing', async () => {
    process.env.EVOLUTION_API_URL = 'http://evo.test';
    process.env.EVOLUTION_API_KEY = 'super-secret-key-xyz';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await probeEvolution();
    expect(r.state).toBe('degraded');
    expect(r.error).toBeTruthy();
  });
});
