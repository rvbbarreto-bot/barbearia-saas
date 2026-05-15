/**
 * Captures portal evidence PNGs (07, 08, 13) via Playwright.
 * Run: node scripts/capture-pilot-evidence.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'evidencias', 'mvp_piloto_aceite');
const base = 'http://localhost:3001';
const api = 'http://localhost:3000';
const tenant = '00000000-0000-0000-0000-000000000001';

async function apiLogin(request) {
  const res = await request.post(`${api}/auth/login`, {
    headers: { 'X-Tenant-Id': tenant, 'Content-Type': 'application/json' },
    data: { email: 'admin@demo.local', password: 'admin12345' },
  });
  const body = await res.json();
  return body.access_token;
}

async function login(page, email, password) {
  await page.goto(`${base}/login?v=evidence`);
  await page.getByPlaceholder('voce@barbearia.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /tenant/i }).click();
  await page.getByPlaceholder('00000000-0000-0000-0000-000000000001').fill(tenant);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(dashboard|agenda)/, { timeout: 15000 });
}

async function wizardToHorario(page, date = '2026-05-16') {
  await page.goto(`${base}/agenda?v=evidence`);
  await page.getByRole('button', { name: 'Novo agendamento' }).click();
  await page.getByRole('button', { name: /Cliente QA A/ }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: /Corte masculino/ }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Fred' }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('input[type="date"]').fill(date);
  await page.waitForResponse(
    (r) => r.url().includes('/api/v1/availability') && r.status() === 200,
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
  return modal;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  const request = context.request;
  const token = await apiLogin(request);

  await login(page, 'admin@demo.local', 'admin12345');

  // 07 — slot indisponível: UI com horário já ocupado (conflito real SLOT_UNAVAILABLE)
  const modal07 = await wizardToHorario(page);
  const slotLabel = '10:30';
  await modal07.getByRole('button', { name: slotLabel, exact: true }).click();
  await request.post(`${api}/api/v1/appointments`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Id': tenant,
      'Content-Type': 'application/json',
    },
    data: {
      customer_id: '00000000-0000-4000-8000-000000004032',
      professional_id: '00000000-0000-4000-8000-000000004011',
      service_id: '00000000-0000-4000-8000-000000004021',
      starts_at: '2026-05-16T13:30:00.000Z',
      ends_at: '2026-05-16T14:00:00.000Z',
      idempotency_key: crypto.randomUUID(),
      source: 'manual',
      explicit_confirmation: true,
    },
  });
  await modal07.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText(/indisponível/i).waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(outDir, '07_slot_bloqueado_erro_amigavel.png') });
  await page.getByRole('button', { name: 'Fechar' }).click().catch(() => {});

  // 08 — agendamento com sucesso em slot livre
  const modal08 = await wizardToHorario(page);
  await modal08.getByRole('button', { name: '12:00', exact: true }).click();
  await modal08.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText(/criado com sucesso/i).waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(outDir, '08_agendamento_slot_livre_sucesso.png') });

  // 13 — atendente sem botão de retry na outbox
  await login(page, 'atendente@demo.local', 'admin12345');
  await page.goto(`${base}/operacao/mensagens?v=evidence`);
  await page.waitForTimeout(2500);
  const row = page.locator('table tbody tr').first();
  if (await row.count()) await row.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(outDir, '13_outbox_retry_atendente_sem_botao.png'), fullPage: true });

  await context.close();
  await browser.close();
  console.log('Evidence PNGs written to', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
