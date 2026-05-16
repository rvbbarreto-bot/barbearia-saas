import { sanitizeInfraError } from './sanitize-error.js';
import type { HealthState } from './sanitize-error.js';

const PROBE_TIMEOUT_MS = 4_000;

async function probeUrl(
  url: string,
  init?: RequestInit,
): Promise<{ state: HealthState; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.ok || res.status === 401 || res.status === 404) {
      return { state: 'ok', error: null };
    }
    return { state: 'degraded', error: `HTTP ${res.status}` };
  } catch (err) {
    return { state: 'degraded', error: sanitizeInfraError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Probe n8n quando `N8N_WEBHOOK_URL` está definido (sem enviar credenciais nos logs). */
export async function probeN8n(): Promise<{ state: HealthState; error: string | null }> {
  const base = process.env.N8N_WEBHOOK_URL?.trim();
  if (!base) return { state: 'not_probed', error: null };
  const url = base.endsWith('/') ? base : `${base}/`;
  return probeUrl(url);
}

/** Probe Evolution quando URL configurada; usa apikey só no header, nunca em resposta. */
export async function probeEvolution(): Promise<{ state: HealthState; error: string | null }> {
  const base = process.env.EVOLUTION_API_URL?.trim();
  if (!base) return { state: 'not_probed', error: null };
  const url = base.replace(/\/$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.EVOLUTION_API_KEY?.trim();
  if (key) headers.apikey = key;
  return probeUrl(url, { method: 'GET', headers });
}
