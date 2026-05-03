import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
