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
      include: [
        'src/modules/auth/service.ts',
        'src/modules/auth/session.ts',
        'src/modules/availability/slots.ts',
        'src/modules/appointments/lock.ts',
        'src/middlewares/rbac.ts',
        'src/middlewares/tenant.ts',
        'src/infra/queues/outbox.service.ts',
        'src/infra/queues/outbox-worker.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 81,
        functions: 81,
        branches: 81,
        statements: 81,
      },
      reporter: ['text', 'html'],
    },
  },
});
