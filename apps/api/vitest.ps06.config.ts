import { defineConfig } from 'vitest/config';

/**
 * Gate de cobertura PO — módulos PS-06 (somente testes unitários, sem DB).
 * Rodar: npm run test:coverage:ps06
 */
export default defineConfig({
  test: {
    include: [
      'src/modules/management/**/*.test.ts',
      'src/modules/portal/**/*.test.ts',
      'src/modules/carWash/**/*.test.ts',
      'src/modules/vehicles/**/*.test.ts',
      'src/modules/customers/**/*.test.ts',
    ],
    exclude: ['**/*.integration.test.ts', 'dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/management/**/*.ts',
        'src/modules/portal/**/*.ts',
        'src/modules/carWash/**/*.ts',
        'src/modules/vehicles/**/*.ts',
        'src/modules/customers/overview.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/routes.ts'],
      thresholds: {
        lines: 82,
        functions: 82,
        branches: 75,
        statements: 82,
      },
      reporter: ['text', 'html'],
    },
  },
});
