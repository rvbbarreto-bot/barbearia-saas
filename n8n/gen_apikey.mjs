// gen_apikey.mjs — Gera e insere uma API Key n8n 2.x no banco de dados
//
// ATENÇÃO: NÃO coloque segredos reais neste arquivo.
// Defina as variáveis de ambiente abaixo antes de executar:
//
//   N8N_DB_HOST      = host do banco do n8n (default: postgres)
//   N8N_DB_PORT      = porta do banco do n8n (default: 5432)
//   N8N_DB_NAME      = nome do banco do n8n (default: barbearia_saas)
//   N8N_DB_USER      = usuário do banco do n8n
//   N8N_DB_PASSWORD  = senha do banco do n8n
//   N8N_OWNER_USER_ID = UUID do usuário owner no n8n
//
// Uso: node gen_apikey.mjs

import crypto from 'node:crypto';
import pg from '/usr/local/lib/node_modules/n8n/node_modules/pg/lib/index.js';

const { Client } = pg;

const N8N_DB_HOST     = process.env.N8N_DB_HOST      ?? 'postgres';
const N8N_DB_PORT     = parseInt(process.env.N8N_DB_PORT ?? '5432');
const N8N_DB_NAME     = process.env.N8N_DB_NAME      ?? 'barbearia_saas';
const N8N_DB_USER     = process.env.N8N_DB_USER;
const N8N_DB_PASSWORD = process.env.N8N_DB_PASSWORD;
const userId          = process.env.N8N_OWNER_USER_ID;

const missing = [];
if (!N8N_DB_USER)     missing.push('N8N_DB_USER');
if (!N8N_DB_PASSWORD) missing.push('N8N_DB_PASSWORD');
if (!userId)          missing.push('N8N_OWNER_USER_ID');

if (missing.length > 0) {
  console.error('ERRO: variáveis de ambiente ausentes:', missing.join(', '));
  process.exit(1);
}

const keyId  = crypto.randomUUID();
// n8n 2.x: API key com prefixo n8n_api_ + 40 chars hex aleatório
const rawKey = 'n8n_api_' + crypto.randomBytes(20).toString('hex');

const client = new Client({
  host: N8N_DB_HOST,
  port: N8N_DB_PORT,
  database: N8N_DB_NAME,
  user: N8N_DB_USER,
  password: N8N_DB_PASSWORD,
});

await client.connect();
const res = await client.query(
  `INSERT INTO public.user_api_keys (id, "userId", label, "apiKey", "createdAt", "updatedAt", audience)
   VALUES ($1, $2, $3, $4, NOW(), NOW(), 'public-api')
   ON CONFLICT (id) DO UPDATE SET "apiKey" = EXCLUDED."apiKey"
   RETURNING id, "apiKey"`,
  [keyId, userId, 'barbearia-saas', rawKey]
);
console.log('API_KEY=' + res.rows[0].apiKey);
console.log('KEY_ID='  + res.rows[0].id);
await client.end();
