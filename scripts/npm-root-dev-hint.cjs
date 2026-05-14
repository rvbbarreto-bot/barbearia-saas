/* eslint-disable no-console */
console.error(`
[barbearia-saas] Este monorepo nao usa um unico "npm run dev" na raiz.

  Portal (Vite):  npm run dev:web   -> apps/web (porta padrao 5173)
  API (Fastify):  npm run dev:api   -> apps/api (porta padrao 3000)

  Copie .env.example para .env na RAIZ antes de Docker Compose ou consulte
  docs/QA_AMBIENTE_LOCAL.md para desenvolvimento manual.

`);
process.exit(1);
