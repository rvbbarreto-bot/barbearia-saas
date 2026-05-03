// create_pg_cred.mjs — Cria credencial PostgreSQL no n8n via insert direto no banco
//
// ATENÇÃO: NÃO coloque segredos reais neste arquivo.
// Defina as variáveis de ambiente abaixo antes de executar:
//
//   N8N_ENCRYPTION_KEY    = chave de criptografia do n8n (valor de N8N_ENCRYPTION_KEY do .env)
//   N8N_DB_HOST           = host do banco do n8n (default: postgres)
//   N8N_DB_PORT           = porta do banco do n8n (default: 5432)
//   N8N_DB_NAME           = nome do banco do n8n (default: barbearia_saas)
//   N8N_DB_USER           = usuário do banco do n8n
//   N8N_DB_PASSWORD       = senha do banco do n8n
//   BARBEARIA_PG_HOST     = host do banco da barbearia (default: barbearia-postgres)
//   BARBEARIA_PG_DB       = nome do banco da barbearia (default: barbearia_saas)
//   BARBEARIA_PG_USER     = usuário do banco da barbearia
//   BARBEARIA_PG_PASSWORD = senha do banco da barbearia
//   N8N_OWNER_USER_ID     = UUID do usuário owner no n8n
//
// Uso: node create_pg_cred.mjs

import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTION_KEY   = process.env.N8N_ENCRYPTION_KEY;
const N8N_DB_HOST      = process.env.N8N_DB_HOST      ?? 'postgres';
const N8N_DB_PORT      = parseInt(process.env.N8N_DB_PORT ?? '5432');
const N8N_DB_NAME      = process.env.N8N_DB_NAME      ?? 'barbearia_saas';
const N8N_DB_USER      = process.env.N8N_DB_USER;
const N8N_DB_PASSWORD  = process.env.N8N_DB_PASSWORD;

const BARBEARIA_PG_HOST     = process.env.BARBEARIA_PG_HOST     ?? 'barbearia-postgres';
const BARBEARIA_PG_DB       = process.env.BARBEARIA_PG_DB       ?? 'barbearia_saas';
const BARBEARIA_PG_USER     = process.env.BARBEARIA_PG_USER;
const BARBEARIA_PG_PASSWORD = process.env.BARBEARIA_PG_PASSWORD;
const N8N_OWNER_USER_ID     = process.env.N8N_OWNER_USER_ID;

const missing = [];
if (!ENCRYPTION_KEY)       missing.push('N8N_ENCRYPTION_KEY');
if (!N8N_DB_USER)          missing.push('N8N_DB_USER');
if (!N8N_DB_PASSWORD)      missing.push('N8N_DB_PASSWORD');
if (!BARBEARIA_PG_USER)    missing.push('BARBEARIA_PG_USER');
if (!BARBEARIA_PG_PASSWORD) missing.push('BARBEARIA_PG_PASSWORD');
if (!N8N_OWNER_USER_ID)    missing.push('N8N_OWNER_USER_ID');

if (missing.length > 0) {
  console.error('ERRO: variáveis de ambiente ausentes:', missing.join(', '));
  process.exit(1);
}

// n8n usa AES-256-CBC com chave derivada da encryption key
function encrypt(text, key) {
  const keyHash = createHash('sha256').update(key).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', keyHash, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('hex') + ':' + encrypted;
}

const credData = JSON.stringify({
  host: BARBEARIA_PG_HOST,
  port: 5432,
  database: BARBEARIA_PG_DB,
  user: BARBEARIA_PG_USER,
  password: BARBEARIA_PG_PASSWORD,
  ssl: 'disable',
  sshTunnel: false,
});

const encryptedData = encrypt(credData, ENCRYPTION_KEY);
console.log('ENCRYPTED_OK');
console.log('CREDENTIAL_DATA_LENGTH=' + credData.length);

// Inserir diretamente no banco do n8n
import pg from '/usr/local/lib/node_modules/n8n/node_modules/pg/lib/index.js';
const { Client } = pg;
const client = new Client({
  host: N8N_DB_HOST, port: N8N_DB_PORT, database: N8N_DB_NAME,
  user: N8N_DB_USER, password: N8N_DB_PASSWORD,
});
await client.connect();

const credId = 'barbearia-pg-cred-001';
const userId = N8N_OWNER_USER_ID;

// Remover se já existir
await client.query('DELETE FROM public.credentials_entity WHERE id=$1', [credId]);

// Inserir nova credencial
const now = new Date().toISOString();
await client.query(
  `INSERT INTO public.credentials_entity
   (id, name, type, data, "createdAt", "updatedAt", "isManaged")
   VALUES ($1, $2, $3, $4, $5, $5, false)`,
  [credId, 'Barbearia Postgres', 'postgres', encryptedData, now]
);

// Compartilhar com o usuário owner via project
const project = await client.query(
  `SELECT p.id FROM public.project p
   JOIN public.project_relation pr ON pr."projectId" = p.id
   WHERE pr."userId" = $1 AND p.type = 'personal' LIMIT 1`,
  [userId]
);

if (project.rows.length > 0) {
  const projectId = project.rows[0].id;
  await client.query(
    `INSERT INTO public.shared_credentials ("credentialsId", "projectId", role, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential:owner', $3, $3)
     ON CONFLICT DO NOTHING`,
    [credId, projectId, now]
  );
  console.log('SHARED_WITH_PROJECT=' + projectId);
}

console.log('POSTGRES_CRED_ID=' + credId);
await client.end();
