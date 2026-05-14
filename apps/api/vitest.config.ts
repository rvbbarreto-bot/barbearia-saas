import { defineConfig } from 'vitest/config';

/** Reenvia env de integração aos workers (Vitest no Windows nem sempre herda o mesmo process.env). */
function integrationEnvForWorkers(): Record<string, string> {
  const keys = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REDIS_URL',
    'RECALL_ENABLED',
    'PIX_REAL_PROVIDER_ENABLED',
    'WAITLIST_SLOT_NOTIFY_ENABLED',
    'WAITLIST_SWEEP_ENABLED',
  ] as const;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
}

export default defineConfig({
  test: {
    env: integrationEnvForWorkers(),
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      /** Cenário A / multitenant: middleware de tenant + serviço de tenants (PO ≥ 78%). */
      include: ['src/middlewares/tenant.ts', 'src/modules/tenants/service.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 78,
        functions: 78,
        branches: 72,
        statements: 78,
      },
      reporter: ['text', 'html'],
    },
  },
});
