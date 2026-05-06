import { describe, expect, it } from 'vitest';
import { canAccessPath } from './route-access';

const ROLES = [
  'viewer',
  'attendant',
  'professional',
  'manager',
  'tenant_admin',
  'tenant_owner',
  'platform_admin',
] as const;

describe('canAccessPath (RBAC painel V4)', () => {
  it('dashboard e agenda: viewer ou superior', () => {
    expect(canAccessPath('/dashboard', 'viewer')).toBe(true);
    expect(canAccessPath('/agenda', 'viewer')).toBe(true);
    expect(canAccessPath('/dashboard', undefined)).toBe(true);
  });

  it('conversas e clientes: attendant ou superior', () => {
    expect(canAccessPath('/conversas', 'viewer')).toBe(false);
    expect(canAccessPath('/clientes', 'viewer')).toBe(false);
    expect(canAccessPath('/conversas', 'attendant')).toBe(true);
    expect(canAccessPath('/clientes', 'professional')).toBe(true);
  });

  it('serviços / profissionais / configurações: manager ou superior', () => {
    expect(canAccessPath('/servicos', 'attendant')).toBe(false);
    expect(canAccessPath('/profissionais', 'professional')).toBe(false);
    expect(canAccessPath('/configuracoes', 'manager')).toBe(true);
    expect(canAccessPath('/servicos', 'tenant_owner')).toBe(true);
    expect(canAccessPath('/servicos', 'platform_admin')).toBe(true);
  });

  it('lista de espera: attendant+; auditoria: tenant_admin+; financeiro e comissões: manager+', () => {
    expect(canAccessPath('/lista-espera', 'viewer')).toBe(false);
    expect(canAccessPath('/lista-espera', 'attendant')).toBe(true);
    expect(canAccessPath('/auditoria', 'manager')).toBe(false);
    expect(canAccessPath('/auditoria', 'tenant_admin')).toBe(true);
    expect(canAccessPath('/operacao/financeiro', 'attendant')).toBe(false);
    expect(canAccessPath('/operacao/financeiro', 'manager')).toBe(true);
    expect(canAccessPath('/operacao/comissao', 'viewer')).toBe(false);
    expect(canAccessPath('/operacao/comissao', 'attendant')).toBe(false);
    expect(canAccessPath('/operacao/comissao', 'manager')).toBe(true);
    expect(canAccessPath('/operacao/comissao', 'tenant_admin')).toBe(true);
    expect(canAccessPath('/operacao/comissao', 'tenant_owner')).toBe(true);
  });

  it('matriz: não há regressão entre perfis V4', () => {
    const matrix: Record<string, Record<string, boolean>> = {
      '/dashboard': {
        viewer: true,
        attendant: true,
        manager: true,
        platform_admin: true,
      },
      '/conversas': {
        viewer: false,
        attendant: true,
        manager: true,
        platform_admin: true,
      },
      '/servicos': {
        viewer: false,
        attendant: false,
        manager: true,
        platform_admin: true,
      },
    };
    for (const [path, expected] of Object.entries(matrix)) {
      for (const [role, want] of Object.entries(expected)) {
        expect(canAccessPath(path, role)).toBe(want);
      }
    }
  });

  it('todos os perfis conhecidos acedem a /forbidden (página de erro)', () => {
    for (const r of ROLES) {
      expect(canAccessPath('/forbidden', r)).toBe(true);
    }
  });
});
