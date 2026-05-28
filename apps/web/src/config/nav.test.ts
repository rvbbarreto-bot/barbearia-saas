import { describe, expect, it } from 'vitest';
import { APP_NAV } from './nav';
import { hasMinRole } from '@/lib/rbac';

describe('APP_NAV — Comissões visível só para manager+ (DEV/QA-07.1)', () => {
  it('atendente não vê item Comissões após filtro do Sidebar', () => {
    const visible = APP_NAV.filter((item) => hasMinRole('attendant', item.minRole));
    expect(visible.some((i) => i.to === '/operacao/comissao')).toBe(false);
  });

  it('gerente vê Comissões', () => {
    const visible = APP_NAV.filter((item) => hasMinRole('manager', item.minRole));
    expect(visible.some((i) => i.to === '/operacao/comissao')).toBe(true);
  });
});

describe('APP_NAV — Mensagens outbox (PILOTO-05 Bloco 1)', () => {
  it('attendant+ vê /operacao/mensagens; viewer não', () => {
    expect(APP_NAV.some((i) => i.to === '/operacao/mensagens')).toBe(true);
    expect(hasMinRole('attendant', 'attendant')).toBe(true);
    expect(hasMinRole('viewer', 'attendant')).toBe(false);
    const visibleAtt = APP_NAV.filter((item) => hasMinRole('attendant', item.minRole));
    expect(visibleAtt.some((i) => i.to === '/operacao/mensagens')).toBe(true);
    const visibleViewer = APP_NAV.filter((item) => hasMinRole('viewer', item.minRole));
    expect(visibleViewer.some((i) => i.to === '/operacao/mensagens')).toBe(false);
  });
});
