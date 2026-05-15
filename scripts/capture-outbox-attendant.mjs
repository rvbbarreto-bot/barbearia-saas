import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'evidencias', 'mvp_piloto_aceite');
const base = 'http://localhost:3001';
const tenant = '00000000-0000-0000-0000-000000000001';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  timezoneId: 'America/Sao_Paulo',
  locale: 'pt-BR',
});
const page = await context.newPage();
await page.goto(`${base}/login`);
await page.getByPlaceholder('voce@barbearia.com').fill('atendente@demo.local');
await page.getByPlaceholder('••••••••').fill('admin12345');
await page.getByRole('button', { name: /tenant/i }).click();
await page.getByPlaceholder('00000000-0000-0000-0000-000000000001').fill(tenant);
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL(/\/(dashboard|agenda)/, { timeout: 15000 });
await page.goto(`${base}/operacao/mensagens`);
await page.waitForSelector('table tbody tr', { timeout: 15000 });
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(1500);
await page.screenshot({
  path: join(outDir, '13_outbox_retry_atendente_sem_botao.png'),
  fullPage: true,
});
await context.close();
await browser.close();
console.log('OK 13_outbox_retry_atendente_sem_botao.png');
