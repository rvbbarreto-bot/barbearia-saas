#!/usr/bin/env node
/**
 * DEV/QA-05: fail on forbidden tenant-setting names in repo + optional DB check
 * for public tables with column tenant_id but without RLS enabled.
 *
 * `pg` is resolved from apps/api (no root dependency). Safe from repo root or apps/api.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const allowlistPath = path.join(__dirname, 'audit-tenant-context-allowlist.json');

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, exts, out);
    else if (exts.has(path.extname(name))) out.push(p);
  }
  return out;
}

let failed = false;
function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  failed = true;
}

// ── 1) Forbidden GUC name (must use app.tenant_id + app_tenant_id() only) ─────
const scanDirs = [
  path.join(root, 'database', 'migrations'),
  path.join(root, 'apps', 'api', 'src'),
];
const exts = new Set(['.sql', '.ts']);
const files = scanDirs.flatMap((d) => walkFiles(d, exts));
const forbidden = /app\.current_tenant_id\b/;
for (const f of files) {
  const rel = path.relative(root, f);
  if (rel.includes(`${path.sep}audit-tenant-context.mjs`)) continue;
  const text = fs.readFileSync(f, 'utf8');
  if (forbidden.test(text)) {
    fail(`Forbidden pattern app.current_tenant_id in ${rel}`);
  }
}

// ── 2) Optional DB: tables with tenant_id must have RLS (relrowsecurity) ─────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.log('[OK] Static tenant-context scan passed (no DATABASE_URL — skipping DB RLS inventory).');
  process.exit(failed ? 1 : 0);
}

let allow = { ignoreTablesMissingRls: [] };
try {
  const raw = fs.readFileSync(allowlistPath, 'utf8');
  allow = JSON.parse(raw);
} catch {
  console.warn(`[WARN] Missing or invalid ${path.basename(allowlistPath)} — using empty allowlist.`);
}

const ignore = new Set(allow.ignoreTablesMissingRls ?? []);

const apiPkgJson = path.join(root, 'apps', 'api', 'package.json');
const requireFromApi = createRequire(apiPkgJson);
const pg = requireFromApi('pg');
const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
try {
  const { rows } = await pool.query(`
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1
           FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'tenant_id'
       )
       AND NOT c.relrowsecurity
     ORDER BY c.relname
  `);
  const bad = rows.map((r) => r.table_name).filter((t) => !ignore.has(t));
  if (bad.length) {
    fail(`Tables with tenant_id but RLS disabled: ${bad.join(', ')}`);
  } else {
    console.log('[OK] DB RLS inventory: no tenant-scoped tables without row security (or all allowlisted).');
  }
} catch (e) {
  fail(`DB audit error: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await pool.end();
}

process.exit(failed ? 1 : 0);
