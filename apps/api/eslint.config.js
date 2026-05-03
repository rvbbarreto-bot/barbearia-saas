// eslint.config.js — Barbearia SaaS API
// Requer: npm install --save-dev eslint typescript-eslint
// (adicionados ao package.json; rode npm install para atualizar o lock file)

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Erros reais de TypeScript já são capturados pelo typecheck.
      // Aqui apenas regras de estilo que não duplicam o tsc.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
);
