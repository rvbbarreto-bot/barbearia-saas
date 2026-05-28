/**
 * Rodada 2 — Aceite funcional + portal tokenizado + regressivo API/UI
 * Saída: docs/evidencias/piloto_staging_07/rodada2/
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const BASE = process.env.QA_PORTAL_URL || 'http://localhost:3001';
const OUT = join(ROOT, 'docs/evidencias/piloto_staging_07/rodada2');
const PRINTS = join(OUT, 'prints');
const JSON_OUT = join(OUT, '08_resultados_aceite.json');

const TENANT = '00000000-0000-0000-0000-000000000001';
const CUST = '00000000-0000-4000-8000-000000004031';
const PROF = '00000000-0000-4000-8000-000000004011';
const SVC = '00000000-0000-4000-8000-000000004021';

const USERS = {
  owner: { email: 'admin@demo.local', password: 'admin12345' },
  attendant: { email: 'atendente@demo.local', password: 'admin12345' },
  professional: { email: 'fred.barbeiro@demo.local', password: 'admin12345' },
};

/** @type {Array<{id:string;area:string;steps:string[];expected:string;actual:string;status:'OK'|'FAIL'|'N/A';evidence?:string;defect?:string}>} */
const cases = [];

function add(id, area, steps, expected, actual, status, evidence = '', defect = '') {
  cases.push({ id, area, steps, expected, actual, status, evidence, defect });
  const mark = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${mark} [${id}] ${area} — ${status}`);
  if (status === 'FAIL') console.log(`    esperado: ${expected}`);
  console.log(`    obtido: ${actual}`);
}

async function api(method, path, token, body) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function loginApi(role) {
  const u = USERS[role];
  const r = await api('POST', '/auth/login', null, { email: u.email, password: u.password });
  if (r.status !== 200) throw new Error(`login ${role} ${r.status}`);
  return r.data.access_token;
}

async function findSlot(token) {
  const profId = PROF;
  const svcId = SVC;
  for (let d = 1; d <= 21; d++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + d);
    const date = dt.toISOString().slice(0, 10);
    const r = await api(
      'GET',
      `/api/v1/availability?professional_id=${profId}&service_id=${svcId}&date=${date}&min_advance_minutes=0`,
      token,
    );
    if (r.status !== 200) continue;
    const slots = r.data?.slots ?? r.data ?? [];
    const available = Array.isArray(slots)
      ? slots.filter((s) => s.available !== false && s.starts_at && s.ends_at)
      : [];
    if (available.length) return { date, slot: available[0] };
  }
  return null;
}

async function shot(page, name) {
  const p = join(PRINTS, name);
  await page.screenshot({ path: p, fullPage: true });
  return name;
}

async function browserLogin(page, role) {
  const u = USERS[role];
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.removeItem('barbearia-auth'));
  await page.reload();
  await page.fill('#email', u.email);
  await page.fill('#password', u.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(dashboard|agenda)/, { timeout: 20000 });
}

async function runApiSuite() {
  const owner = await loginApi('owner');
  const att = await loginApi('attendant');
  const pro = await loginApi('professional');

  // F01 — Slot + criar agendamento awaiting_confirmation
  const found = await findSlot(att);
  if (!found) {
    add(
      'F01',
      'Agenda API',
      ['GET /availability D+1..21', 'POST /appointments'],
      'Slot disponível e agendamento criado',
      'Nenhum slot em 21 dias',
      'FAIL',
      '',
      'MASSA/horário — verificar business_hours seed',
    );
  } else {
    const key = `qa-r2-${Date.now()}`;
    const cr = await api('POST', '/api/v1/appointments', att, {
      customer_id: CUST,
      professional_id: PROF,
      service_id: SVC,
      starts_at: found.slot.starts_at,
      ends_at: found.slot.ends_at,
      idempotency_key: key,
      explicit_confirmation: true,
      source: 'manual',
      notes: 'QA Rodada2 F01',
    });
    const ok = cr.status === 200 || cr.status === 201;
    add(
      'F01',
      'Agenda API — criar',
      [
        `GET availability date=${found.date}`,
        'POST /appointments explicit_confirmation=true',
      ],
      '201/200 status awaiting_confirmation',
      `HTTP ${cr.status} status=${cr.data?.status}`,
      ok ? 'OK' : 'FAIL',
    );
    const apptId = cr.data?.id;

    // F02 — Lifecycle
    if (apptId && ok) {
      const steps = [];
      let st = cr.data.status;
      const confirm = await api('PATCH', `/api/v1/appointments/${apptId}/confirm`, att, {});
      steps.push(`confirm→${confirm.status}`);
      st = confirm.data?.status ?? st;
      const checkin = await api('PATCH', `/api/v1/appointments/${apptId}/check-in`, att, {});
      steps.push(`check-in→${checkin.status}`);
      const start = await api('PATCH', `/api/v1/appointments/${apptId}/start`, att, {});
      steps.push(`start→${start.status}`);
      const complete = await api('PATCH', `/api/v1/appointments/${apptId}/complete`, pro, {});
      steps.push(`complete→${complete.status}`);
      const lcOk =
        confirm.status === 200 &&
        checkin.status === 200 &&
        start.status === 200 &&
        complete.status === 200 &&
        complete.data?.status === 'completed';
      add(
        'F02',
        'Agenda API — lifecycle',
        steps,
        'confirmed→checked_in→in_service→completed',
        `final=${complete.data?.status}`,
        lcOk ? 'OK' : 'FAIL',
        '',
        lcOk ? '' : 'Transição de status',
      );
    }

    // F03 — Portal token (API) — slot dedicado
    const foundPortal = await findSlot(att);
    const key2 = `qa-r2-portal-${Date.now()}`;
    const cr2 = foundPortal
      ? await api('POST', '/api/v1/appointments', att, {
          customer_id: CUST,
          professional_id: PROF,
          service_id: SVC,
          starts_at: foundPortal.slot.starts_at,
          ends_at: foundPortal.slot.ends_at,
          idempotency_key: key2,
          explicit_confirmation: true,
          source: 'manual',
        })
      : { status: 0, data: null };
    const portalApptId = cr2.data?.id;
    let portalToken = null;
    if (portalApptId) {
      const tok = await api('POST', `/api/v1/appointments/${portalApptId}/portal-token`, owner, {});
      const tokOk = tok.status === 201 && tok.data?.token?.length > 20;
      portalToken = tok.data?.token;
      add(
        'F03',
        'Portal API — gerar token',
        ['POST /appointments/:id/portal-token (manager+)'],
        '201 + token plaintext + expires_at',
        `HTTP ${tok.status} len=${portalToken?.length ?? 0}`,
        tokOk ? 'OK' : 'FAIL',
      );

      const pub = await api('GET', `/api/v1/public/portal/appointments/${encodeURIComponent(portalToken)}`, null);
      add(
        'F04',
        'Portal API — consulta pública',
        ['GET /public/portal/appointments/:token sem auth'],
        '200 + can_confirm=true para awaiting_confirmation',
        `HTTP ${pub.status} can_confirm=${pub.data?.can_confirm} status=${pub.data?.status}`,
        pub.status === 200 && pub.data?.can_confirm ? 'OK' : 'FAIL',
      );

      const pConfirm = await api(
        'POST',
        `/api/v1/public/portal/appointments/${encodeURIComponent(portalToken)}/confirm`,
        null,
        {},
      );
      add(
        'F05',
        'Portal API — confirmar',
        ['POST /public/portal/appointments/:token/confirm'],
        '200 status=confirmed',
        `HTTP ${pConfirm.status} status=${pConfirm.data?.status}`,
        pConfirm.status === 200 && pConfirm.data?.status === 'confirmed' ? 'OK' : 'FAIL',
      );

      // Guardar para browser
      if (typeof globalThis !== 'undefined') {
        globalThis.__portalToken = portalToken;
        globalThis.__portalApptId = portalApptId;
      }
      await writeFile(join(OUT, '_portal_token.txt'), portalToken ?? '', 'utf8');
    } else {
      add(
        'F03',
        'Portal API — gerar token',
        ['POST appointment dedicado para portal'],
        'Agendamento criado',
        `cr2 HTTP ${cr2.status}`,
        'FAIL',
      );
    }

    // F06 — Negativo data passada
    const past = await api('POST', '/api/v1/appointments', att, {
      customer_id: CUST,
      professional_id: PROF,
      service_id: SVC,
      starts_at: '2020-01-01T14:00:00.000Z',
      ends_at: '2020-01-01T14:30:00.000Z',
      idempotency_key: `qa-past-${Date.now()}`,
      explicit_confirmation: true,
      source: 'manual',
    });
    add(
      'F06',
      'Agenda API — negativo data passada',
      ['POST /appointments starts_at 2020'],
      '422 ou 400 VALIDATION',
      `HTTP ${past.status} error=${past.data?.error}`,
      past.status === 422 || past.status === 400 ? 'OK' : 'FAIL',
    );

    // F07 — Conflito mesmo slot
    const dup = await api('POST', '/api/v1/appointments', att, {
      customer_id: CUST,
      professional_id: PROF,
      service_id: SVC,
      starts_at: found.slot.starts_at,
      ends_at: found.slot.ends_at,
      idempotency_key: `qa-dup-${Date.now()}`,
      explicit_confirmation: true,
      source: 'manual',
    });
    add(
      'F07',
      'Agenda API — conflito slot',
      ['POST mesmo profissional/intervalo'],
      '409 SLOT_CONFLICT ou similar',
      `HTTP ${dup.status} error=${dup.data?.error}`,
      dup.status === 409 ? 'OK' : 'FAIL',
    );

    // F08 — Professional POST (defeito GAP-01: API não retorna 403)
    const foundPro = await findSlot(pro);
    let f08Status = 'N/A';
    let f08Defect = '';
    if (foundPro) {
      const proCreate = await api('POST', '/api/v1/appointments', pro, {
        customer_id: CUST,
        professional_id: PROF,
        service_id: SVC,
        starts_at: foundPro.slot.starts_at,
        ends_at: foundPro.slot.ends_at,
        idempotency_key: `qa-pro-${Date.now()}`,
        explicit_confirmation: true,
        source: 'manual',
      });
      f08Status = proCreate.status;
      if (proCreate.status === 403) {
        f08Defect = '';
      } else if (proCreate.status === 201 || proCreate.status === 200) {
        f08Defect = 'GAP-01: API permitiu POST /appointments com role professional (UI bloqueia)';
      } else {
        f08Defect = `GAP-01: esperado 403; obtido ${proCreate.status} (${proCreate.data?.error}) — RBAC não barra antes da regra de slot`;
      }
    }
    add(
      'F08',
      'RBAC API — professional não cria appointment',
      ['POST /appointments como professional em slot livre'],
      '403 FORBIDDEN',
      `HTTP ${f08Status}`,
      f08Status === 403 ? 'OK' : 'FAIL',
      '',
      f08Defect,
    );

    // F09 — CRUD cliente update
    const phone = `5511988${String(Date.now()).slice(-6)}`;
    const nc = await api('POST', '/api/v1/customers', att, { phone, name: 'QA R2 Create' });
    if (nc.status === 200 || nc.status === 201) {
      const upd = await api('PATCH', `/api/v1/customers/${nc.data.id}`, att, { name: 'QA R2 Updated' });
      add(
        'F09',
        'CRUD Clientes API',
        ['POST /customers', 'PATCH /customers/:id'],
        '200 + nome atualizado',
        `PATCH HTTP ${upd.status} name=${upd.data?.name}`,
        upd.status === 200 && upd.data?.name === 'QA R2 Updated' ? 'OK' : 'FAIL',
      );
    }

    // F10 — CRUD serviço (owner)
    const ns = await api('POST', '/api/v1/services', owner, {
      name: `QA Svc R2 ${Date.now()}`,
      duration_minutes: 25,
      price_cents: 4500,
      active: true,
    });
    if (ns.status === 200 || ns.status === 201) {
      const us = await api('PATCH', `/api/v1/services/${ns.data.id}`, owner, { price_cents: 5000 });
      add(
        'F10',
        'CRUD Serviços API',
        ['POST /services', 'PATCH price_cents'],
        '200 price_cents=5000',
        `PATCH HTTP ${us.status} price=${us.data?.price_cents}`,
        us.status === 200 && us.data?.price_cents === 5000 ? 'OK' : 'FAIL',
      );
    }
  }

  // F11 — Portal token inválido API
  const inv = await api('GET', '/api/v1/public/portal/appointments/token-invalido-qa', null);
  add(
    'F11',
    'Portal API — token inválido',
    ['GET token inválido'],
    '404 PORTAL_TOKEN_INVALID',
    `HTTP ${inv.status} error=${inv.data?.error}`,
    inv.status === 404 ? 'OK' : 'FAIL',
  );
}

async function runBrowserSuite() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    // B01 — Wizard E2E
    const stepsB01 = [];
    try {
      await browserLogin(page, 'attendant');
      stepsB01.push('Login atendente OK');
      await page.goto(`${BASE}/agenda`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Novo agendamento/i }).click();
      await page.waitForSelector('text=Novo Agendamento');
      stepsB01.push('Modal aberto');
      await page.fill('input[placeholder*="Buscar cliente"]', '5511999990001');
      await page.waitForTimeout(1200);
      await page.locator('button').filter({ hasText: /5511999990001|Cliente QA/i }).first().click();
      stepsB01.push('Cliente selecionado');
      await page.getByRole('button', { name: 'Próximo' }).click();
      await page.locator('button').filter({ hasText: 'Corte masculino' }).first().click();
      stepsB01.push('Serviço selecionado');
      await page.getByRole('button', { name: 'Próximo' }).click();
      await page.locator('button').filter({ hasText: 'Fred' }).first().click();
      stepsB01.push('Profissional Fred');
      await page.getByRole('button', { name: 'Próximo' }).click();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const dateStr = tomorrow.toISOString().slice(0, 10);
      await page.getByRole('dialog').locator('input[type="date"]').fill(dateStr);
      await page.waitForTimeout(2000);
      const slotBtn = page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
      if (await slotBtn.count()) {
        await slotBtn.click();
        stepsB01.push(`Slot ${dateStr}`);
        await page.getByRole('button', { name: 'Confirmar' }).last().click();
        await page.waitForSelector('text=criado com sucesso', { timeout: 15000 });
        stepsB01.push('Toast sucesso');
        const ev = await shot(page, 'R2_B01_agenda_criar_e2e.png');
        add(
          'B01',
          'Agenda UI — wizard E2E',
          stepsB01,
          'Agendamento criado com toast',
          'Sucesso',
          'OK',
          ev,
        );
      } else {
        const ev = await shot(page, 'R2_B01_agenda_sem_slot.png');
        add(
          'B01',
          'Agenda UI — wizard E2E',
          stepsB01,
          'Slot clicável na data',
          `Sem slots em ${dateStr}`,
          'FAIL',
          ev,
        );
      }
    } catch (e) {
      const ev = await shot(page, 'R2_B01_agenda_fail.png');
      add('B01', 'Agenda UI — wizard E2E', stepsB01, 'Fluxo completo', e.message, 'FAIL', ev);
    }

    // B02 — Portal browser válido
    let token = globalThis.__portalToken;
    try {
      const { readFile } = await import('fs/promises');
      const t = await readFile(join(OUT, '_portal_token.txt'), 'utf8');
      if (t?.trim()) token = t.trim();
    } catch {
      /* ignore */
    }
    if (token) {
      try {
        await page.context().clearCookies();
        await page.evaluate(() => localStorage.clear());
        await page.goto(`${BASE}/portal/${token}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        const body = await page.locator('body').innerText();
        const ev1 = await shot(page, 'R2_P01_portal_token_valido.png');
        const hasData = body.includes('Corte') || body.includes('Fred') || body.includes('Barão');
        add(
          'P01',
          'Portal UI — token válido',
          [`Acessar /portal/${token.slice(0, 8)}…`],
          'Dados do agendamento visíveis',
          hasData ? 'Dados exibidos' : body.slice(0, 80),
          hasData ? 'OK' : 'FAIL',
          ev1,
        );
      } catch (e) {
        add('P01', 'Portal UI — token válido', [], 'Página portal', e.message, 'FAIL');
      }
    } else {
      add('P01', 'Portal UI — token válido', [], 'Token da F03', 'Token não gerado na API', 'FAIL');
    }

    // B03 — Portal inválido
    try {
      await page.goto(`${BASE}/portal/token-revogado-invalido-xyz`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText();
      const ev = await shot(page, 'R2_P02_portal_token_invalido.png');
      const ok =
        body.includes('Não foi possível abrir') ||
        body.includes('inválido') ||
        body.includes('expirado');
      add(
        'P02',
        'Portal UI — token inválido',
        ['GET /portal/token-invalido'],
        'Mensagem amigável sem dados sensíveis',
        body.slice(0, 100),
        ok ? 'OK' : 'FAIL',
        ev,
      );
    } catch (e) {
      add('P02', 'Portal UI — token inválido', [], 'Erro amigável', e.message, 'FAIL');
    }

    // B04 — CRUD cliente UI update
    try {
      await browserLogin(page, 'attendant');
      await page.goto(`${BASE}/clientes`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Novo Cliente/i }).click();
      const phone = `5511977${String(Date.now()).slice(-6)}`;
      await page.fill('#c-phone', phone);
      await page.fill('#c-name', 'QA UI Create');
      await page.getByRole('button', { name: /^Salvar$/i }).click();
      await page.waitForTimeout(2000);
      await page.fill('input[placeholder*="Buscar"]', phone);
      await page.waitForTimeout(1500);
      await page.locator('table tbody tr').first().click();
      await page.waitForSelector('text=Editar Cliente');
      await page.fill('#c-name', 'QA UI Updated');
      await page.getByRole('button', { name: /^Salvar$/i }).click();
      await page.waitForTimeout(2000);
      const ev = await shot(page, 'R2_C01_cliente_update.png');
      const body = await page.locator('body').innerText();
      add(
        'C01',
        'CRUD Clientes UI',
        ['Novo cliente', 'Editar nome', 'Salvar'],
        'Nome QA UI Updated na lista',
        body.includes('QA UI Updated') ? 'OK' : 'Nome não listado',
        body.includes('QA UI Updated') ? 'OK' : 'FAIL',
        ev,
      );
    } catch (e) {
      add('C01', 'CRUD Clientes UI', [], 'Update via drawer', e.message, 'FAIL');
    }

    // B05 — Cancelar agendamento UI (criar + cancelar)
    try {
      await browserLogin(page, 'attendant');
      await page.goto(`${BASE}/agenda`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Novo agendamento/i }).click();
      await page.fill('input[placeholder*="Buscar cliente"]', '5511999990001');
      await page.waitForTimeout(1000);
      await page.locator('button').filter({ hasText: /5511999990001|Cliente/i }).first().click();
      await page.getByRole('button', { name: 'Próximo' }).click();
      await page.locator('button').filter({ hasText: 'Barba' }).first().click();
      await page.getByRole('button', { name: 'Próximo' }).click();
      await page.locator('button').filter({ hasText: 'Fred' }).first().click();
      await page.getByRole('button', { name: 'Próximo' }).click();
      const d = new Date();
      d.setDate(d.getDate() + 3);
      await page.getByRole('dialog').locator('input[type="date"]').fill(d.toISOString().slice(0, 10));
      await page.waitForTimeout(2000);
      const slot = page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
      if (await slot.count()) {
        await slot.click();
        await page.getByRole('button', { name: 'Confirmar' }).last().click();
        await page.waitForSelector('text=criado com sucesso', { timeout: 15000 });
        await page.waitForTimeout(2000);
        await page.locator('.rbc-event').first().click({ timeout: 10000 });
        await page.waitForSelector('text=Cancelar agendamento', { timeout: 8000 });
        await page.getByText('Cancelar agendamento').click();
        await page.fill('#cancel-reason', 'QA cancelamento rodada 2');
        await page.getByRole('button', { name: /Confirmar cancelamento/i }).click();
        await page.waitForSelector('text=cancelado', { timeout: 12000 });
        const ev = await shot(page, 'R2_B02_agenda_cancelar.png');
        add(
          'B02',
          'Agenda UI — cancelar',
          ['Criar', 'Abrir evento', 'Cancelar com motivo'],
          'Toast cancelado',
          'OK',
          'OK',
          ev,
        );
      } else {
        add('B02', 'Agenda UI — cancelar', [], 'Slot disponível', 'Sem slot D+3', 'FAIL');
      }
    } catch (e) {
      const ev = await shot(page, 'R2_B02_cancel_fail.png').catch(() => '');
      add('B02', 'Agenda UI — cancelar', [], 'Cancelamento', e.message, 'FAIL', ev);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(PRINTS, { recursive: true });
  console.log('=== Rodada 2 — Aceite funcional ===\n');
  console.log('-- API --');
  await runApiSuite();
  console.log('\n-- Browser --');
  await runBrowserSuite();

  const totals = {
    OK: cases.filter((c) => c.status === 'OK').length,
    FAIL: cases.filter((c) => c.status === 'FAIL').length,
    N_A: cases.filter((c) => c.status === 'N/A').length,
  };
  const summary = {
    executed_at: new Date().toISOString(),
    base_url: BASE,
    migration_applied: '107_appointment_portal_tokens.sql (manual docker exec)',
    totals,
    cases,
  };
  await writeFile(JSON_OUT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n--- TOTAIS ---', totals);
  console.log('JSON:', JSON_OUT);
  console.log('Prints:', PRINTS);
  process.exit(totals.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
