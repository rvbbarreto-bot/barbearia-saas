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
