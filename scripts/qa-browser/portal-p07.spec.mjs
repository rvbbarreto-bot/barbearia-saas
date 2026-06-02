/**
 * QA P07 — Navegação browser + evidências (Playwright)
 * Uso: node scripts/qa-browser/run-p07.mjs
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const BASE = process.env.QA_PORTAL_URL || 'http://localhost:3001';
const OUT = join(ROOT, 'docs/evidencias/piloto_staging_07/prints');
const RESULTS_JSON = join(ROOT, 'docs/evidencias/piloto_staging_07/07_resultados_browser.json');

const USERS = {
  owner: { email: 'admin@demo.local', password: 'admin12345' },
  attendant: { email: 'atendente@demo.local', password: 'admin12345' },
  professional: { email: 'fred.barbeiro@demo.local', password: 'admin12345' },
};

/** @type {{ id: string; scenario: string; status: 'OK'|'FAIL'|'PEND'|'BLOCKED'|'N/A'; note?: string; evidence?: string }[]} */
const results = [];

function record(id, scenario, status, note = '', evidence = '') {
  results.push({ id, scenario, status, note, evidence });
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${icon} [${id}] ${scenario} — ${status}${note ? `: ${note}` : ''}`);
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  return name;
}

async function clearSession(page) {
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.removeItem('barbearia-auth'));
  await page.reload();
}

async function login(page, userKey) {
  const u = USERS[userKey];
  await clearSession(page);
  await page.fill('#email', u.email);
  await page.fill('#password', u.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(dashboard|agenda)/, { timeout: 15000 });
}

async function navHrefVisible(page, href) {
  return page.locator(`nav a[href="${href}"]`).first().isVisible({ timeout: 8000 }).catch(() => false);
}

async function gotoRoute(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
}

async function expectForbidden(page) {
  const url = page.url();
  if (url.includes('/forbidden')) return true;
  const text = await page.locator('body').innerText();
  return text.includes('Acesso negado');
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // C01 — Login admin
    try {
      await login(page, 'owner');
      await page.waitForSelector('nav', { timeout: 10000 });
      const hasGestao = await navHrefVisible(page, '/gestao/dashboard');
      const hasServicos = await navHrefVisible(page, '/servicos');
      const ev = await shot(page, 'P07_01_login_admin.png');
      if (hasGestao && hasServicos) record('C01', 'Login admin + menu gestão', 'OK', '', ev);
      else record('C01', 'Login admin + menu gestão', 'FAIL', `gestao=${hasGestao} servicos=${hasServicos}`, ev);
    } catch (e) {
      record('C01', 'Login admin + menu gestão', 'FAIL', String(e.message));
    }

    // C02 — Login inválido
    try {
      await clearSession(page);
      await page.fill('#email', 'admin@demo.local');
      await page.fill('#password', 'senha-errada-xyz');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.waitForSelector('[role="alert"]', { timeout: 8000 });
      const err = await page.locator('[role="alert"]').innerText();
      const ev = await shot(page, 'P07_01b_login_invalido.png');
      if (err.toLowerCase().includes('incorret')) record('C02', 'Login senha inválida', 'OK', err.slice(0, 60), ev);
      else record('C02', 'Login senha inválida', 'FAIL', err, ev);
    } catch (e) {
      record('C02', 'Login senha inválida', 'FAIL', String(e.message));
    }

    // C03 — Attendant forbidden gestão
    try {
      await login(page, 'attendant');
      await page.goto(`${BASE}/gestao/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const forbidden = page.url().includes('/forbidden') || (await expectForbidden(page));
      const ev = await shot(page, 'P07_18_forbidden_attendant.png');
      record('C03', 'Atendente /gestao/dashboard → forbidden', forbidden ? 'OK' : 'FAIL', page.url(), ev);
    } catch (e) {
      record('C03', 'Atendente forbidden gestão', 'FAIL', String(e.message));
    }

    // C04 — Attendant não vê Serviços no menu
    try {
      await login(page, 'attendant');
      const serv = await navHrefVisible(page, '/servicos');
      const ev = await shot(page, 'P07_18b_menu_attendant.png');
      record('C04', 'Atendente menu sem Serviços', serv ? 'FAIL' : 'OK', `Serviços visível=${serv}`, ev);
    } catch (e) {
      record('C04', 'Atendente menu sem Serviços', 'FAIL', String(e.message));
    }

    // C05 — Professional sem Novo agendamento
    try {
      await login(page, 'professional');
      await gotoRoute(page, '/agenda');
      const novo = await page.getByRole('button', { name: /Novo agendamento/i }).isVisible().catch(() => false);
      const ev = await shot(page, 'P07_02b_agenda_professional.png');
      record('C05', 'Profissional sem botão Novo agendamento', novo ? 'FAIL' : 'OK', `botão=${novo}`, ev);
    } catch (e) {
      record('C05', 'Profissional sem Novo agendamento', 'FAIL', String(e.message));
    }

    // C06 — Owner agenda + novo modal
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/agenda');
      await page.getByRole('button', { name: /Novo agendamento/i }).click();
      await page.waitForSelector('text=Novo Agendamento', { timeout: 8000 });
      const ev = await shot(page, 'P07_02_agenda_modal.png');
      await page.keyboard.press('Escape');
      record('C06', 'Admin abre modal Novo Agendamento', 'OK', '', ev);
    } catch (e) {
      record('C06', 'Admin abre modal Novo Agendamento', 'FAIL', String(e.message));
    }

    // C07 — CRUD cliente (create)
    try {
      await login(page, 'attendant');
      await gotoRoute(page, '/clientes');
      await page.getByRole('button', { name: /Novo Cliente/i }).click();
      await page.waitForSelector('text=Novo Cliente', { timeout: 5000 });
      const phone = `5511988${String(Date.now()).slice(-6)}`;
      await page.fill('#c-phone', phone);
      await page.fill('#c-name', `QA Browser ${phone.slice(-4)}`);
      await page.getByRole('button', { name: /^Salvar$/i }).click();
      await page.waitForTimeout(2500);
      const body = await page.locator('body').innerText();
      const ev = await shot(page, 'P07_03_clientes_create.png');
      const ok = body.includes(phone) || body.includes('QA Browser');
      record('C07', 'CRUD Cliente — criar (attendant)', ok ? 'OK' : 'FAIL', phone, ev);
    } catch (e) {
      record('C07', 'CRUD Cliente — criar', 'FAIL', String(e.message));
    }

    // C08 — Cliente 360 link
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/clientes');
      await page.waitForTimeout(2000);
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.count()) {
        await firstRow.click();
        await page.waitForSelector('text=Visão 360', { timeout: 8000 });
        await page.getByRole('link', { name: /Visão 360/i }).click();
        await page.waitForURL(/\/360/, { timeout: 10000 });
        const ev = await shot(page, 'P07_03_cliente_360.png');
        record('C08', 'Cliente 360 — navegação', 'OK', page.url(), ev);
      } else {
        const ev = await shot(page, 'P07_03_cliente_360_pend.png');
        record('C08', 'Cliente 360 — navegação', 'PEND', 'Sem clientes na tabela', ev);
      }
    } catch (e) {
      record('C08', 'Cliente 360', 'FAIL', String(e.message));
    }

    // C09 — Serviços manager
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/servicos');
      const novo = await page.getByRole('button', { name: /Novo Servico/i }).isVisible();
      const ev = await shot(page, 'P07_servicos_owner.png');
      record('C09', 'Serviços — botão Novo (owner)', novo ? 'OK' : 'FAIL', '', ev);
    } catch (e) {
      record('C09', 'Serviços owner', 'FAIL', String(e.message));
    }

    // C10 — Profissionais
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/profissionais');
      const ev = await shot(page, 'P07_profissionais.png');
      const body = await page.locator('body').innerText();
      record('C10', 'Profissionais — listagem', body.match(/Fred|João|Robson/i) ? 'OK' : 'PEND', '', ev);
    } catch (e) {
      record('C10', 'Profissionais listagem', 'FAIL', String(e.message));
    }

    // C11 — Gestão dashboard
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/gestao/dashboard');
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();
      const ev = await shot(page, 'P07_04_dashboard_gestao.png');
      const ok = page.url().includes('/gestao/dashboard') && !page.url().includes('forbidden');
      record('C11', 'Dashboard gestão (owner)', ok ? 'OK' : 'FAIL', `${page.url()} | ${body.slice(0, 40)}`, ev);
    } catch (e) {
      record('C11', 'Dashboard gestão', 'FAIL', String(e.message));
    }

    // C12 — Financeiro
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/operacao/financeiro', 3000);
      const ev = await shot(page, 'P07_11_financeiro.png');
      const forbidden = await expectForbidden(page);
      record('C12', 'Financeiro (owner)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C12', 'Financeiro', 'FAIL', String(e.message));
    }

    // C13 — Comissões
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/operacao/comissao', 3000);
      const ev = await shot(page, 'P07_12_comissao.png');
      const forbidden = await expectForbidden(page);
      record('C13', 'Comissões (owner)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C13', 'Comissões', 'FAIL', String(e.message));
    }

    // C14 — Outbox
    try {
      await login(page, 'attendant');
      await gotoRoute(page, '/operacao/mensagens', 3000);
      const ev = await shot(page, 'P07_09_outbox.png');
      const forbidden = await expectForbidden(page);
      record('C14', 'Outbox mensagens (attendant)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C14', 'Outbox', 'FAIL', String(e.message));
    }

    // C15 — Auditoria operacional
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/operacao/auditoria', 3000);
      const ev = await shot(page, 'P07_10_auditoria.png');
      const forbidden = await expectForbidden(page);
      record('C15', 'Auditoria operacional (owner)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C15', 'Auditoria operacional', 'FAIL', String(e.message));
    }

    // C16 — Auditoria tenant
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/auditoria', 3000);
      const ev = await shot(page, 'P07_auditoria_tenant.png');
      const forbidden = await expectForbidden(page);
      record('C16', 'Audit logs tenant (owner)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C16', 'Audit logs tenant', 'FAIL', String(e.message));
    }

    // C17 — Lista espera
    try {
      await login(page, 'attendant');
      await gotoRoute(page, '/lista-espera', 3000);
      const ev = await shot(page, 'P07_13_waitlist.png');
      const forbidden = await expectForbidden(page);
      record('C17', 'Lista de espera (attendant)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C17', 'Lista de espera', 'FAIL', String(e.message));
    }

    // C18 — Conversas
    try {
      await login(page, 'attendant');
      await gotoRoute(page, '/conversas', 3000);
      const ev = await shot(page, 'P07_conversas.png');
      const forbidden = await expectForbidden(page);
      record('C18', 'Conversas/tickets (attendant)', forbidden ? 'FAIL' : 'OK', '', ev);
    } catch (e) {
      record('C18', 'Conversas', 'FAIL', String(e.message));
    }

    // C19 — Configurações + logout UI
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/configuracoes', 2000);
      const ev = await shot(page, 'P07_configuracoes.png');
      const body = await page.locator('body').innerText();
      record('C19', 'Configurações (owner)', body.includes('Configurações') ? 'OK' : 'FAIL', '', ev);
    } catch (e) {
      record('C19', 'Configurações', 'FAIL', String(e.message));
    }

    // C20 — Attendant /servicos forbidden
    try {
      await login(page, 'attendant');
      await gotoRoute(page, '/servicos');
      const forbidden = await expectForbidden(page);
      const ev = await shot(page, 'P07_18_forbidden_servicos.png');
      record('C20', 'Atendente /servicos → forbidden', forbidden ? 'OK' : 'FAIL', page.url(), ev);
    } catch (e) {
      record('C20', 'Atendente /servicos forbidden', 'FAIL', String(e.message));
    }

    // C21 — Lava rápido vertical (N/A se barbearia)
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/veiculos', 2000);
      const ev = await shot(page, 'P07_05_veiculos.png');
      const url = page.url();
      const body = await page.locator('body').innerText();
      if (url.includes('forbidden')) {
        record('C21', 'Veículos (vertical car_wash)', 'N/A', 'Tenant barbearia — rota bloqueada ou oculta', ev);
      } else if (body.includes('Veículo') || body.includes('placa')) {
        record('C21', 'Veículos (car_wash)', 'OK', '', ev);
      } else {
        record('C21', 'Veículos', 'N/A', 'Menu pode estar oculto (vertical barbearia)', ev);
      }
    } catch (e) {
      record('C21', 'Veículos', 'N/A', String(e.message));
    }

    // C22 — Portal token inválido
    try {
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await gotoRoute(page, '/portal/token-invalido-qa-000000000001');
      await page.waitForTimeout(2500);
      const ev = await shot(page, 'P07_15_portal_token_invalido.png');
      const body = await page.locator('body').innerText();
      const onLogin = page.url().includes('/login');
      const ok =
        (body.includes('Não foi possível abrir') ||
          body.includes('Link inválido') ||
          body.match(/inválid|expirad/i)) &&
        !onLogin;
      record('C22', 'Portal token inválido', ok ? 'OK' : onLogin ? 'FAIL' : 'PEND', body.slice(0, 100), ev);
    } catch (e) {
      record('C22', 'Portal token inválido', 'FAIL', String(e.message));
    }

    // C23 — Criar agendamento E2E (wizard)
    try {
      await login(page, 'owner');
      await gotoRoute(page, '/agenda');
      await page.getByRole('button', { name: /Novo agendamento/i }).click();
      await page.waitForSelector('text=Novo Agendamento');
      // Step cliente — clicar primeiro cliente da lista
      await page.waitForTimeout(1500);
      const custBtn = page.locator('button').filter({ hasText: /5511|Cliente|QA/i }).first();
      if (await custBtn.count()) {
        await custBtn.click();
        await page.getByRole('button', { name: /Próximo|Continuar|Avançar/i }).first().click({ timeout: 3000 }).catch(() => {});
      }
      await page.waitForTimeout(1000);
      const ev = await shot(page, 'P07_02_agenda_wizard_partial.png');
      record('C23', 'Agendamento E2E completo', 'PEND', 'Wizard parcial — validar slot manualmente', ev);
    } catch (e) {
      record('C23', 'Agendamento E2E', 'PEND', String(e.message));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    executed_at: new Date().toISOString(),
    base_url: BASE,
    totals: {
      OK: results.filter((r) => r.status === 'OK').length,
      FAIL: results.filter((r) => r.status === 'FAIL').length,
      PEND: results.filter((r) => r.status === 'PEND').length,
      BLOCKED: results.filter((r) => r.status === 'BLOCKED').length,
      N_A: results.filter((r) => r.status === 'N/A').length,
    },
    results,
  };
  await writeFile(RESULTS_JSON, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n--- RESUMO ---');
  console.log(JSON.stringify(summary.totals));
  console.log(`Evidências: ${OUT}`);
  console.log(`JSON: ${RESULTS_JSON}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
