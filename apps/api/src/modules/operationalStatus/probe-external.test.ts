import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeEvolution, probeN8n } from './probe-external.js';

/** CI define EVOLUTION_* / N8N_* — cada teste controla o seu próprio env. */
const envSnapshot = {
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
};

function restoreProbeEnv(): void {
  for (const key of ['N8N_WEBHOOK_URL', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY'] as const) {
    const val = envSnapshot[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

function clearProbeEnv(): void {
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_KEY;
}

describe('probe-external', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearProbeEnv();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreProbeEnv();
  });

  it('returns not_probed when URLs unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await probeN8n()).toEqual({ state: 'not_probed', error: null });
    expect(await probeEvolution()).toEqual({ state: 'not_probed', error: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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
