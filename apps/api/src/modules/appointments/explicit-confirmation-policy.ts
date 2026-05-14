import { hasRequiredRole } from '../../middlewares/rbac.js';
import { AppError } from '../../shared/errors.js';

export type ImplicitConfirmationCaller = { sub?: string; role?: string };

/**
 * `explicit_confirmation: false` não representa confirmação explícita do cliente (CT-073 / CT-073-B).
 * Permitido: `tenant_admin`+ em criação administrativa, ou `walk_in` operado por `attendant`+.
 */
export function validateImplicitAppointmentConfirmation(
  input: { explicit_confirmation: boolean; source: string },
  caller: ImplicitConfirmationCaller | undefined,
): void {
  if (input.explicit_confirmation) return;
  if (!caller?.sub) {
    throw new AppError('FORBIDDEN', 'Autenticação necessária.', 403);
  }
  if (caller.role === 'professional') {
    throw new AppError(
      'FORBIDDEN',
      'Perfil profissional deve criar com confirmação explícita (dois passos ou canal WhatsApp).',
      403,
    );
  }
  const allowedImplicit =
    hasRequiredRole(caller.role, 'tenant_admin') ||
    (input.source === 'walk_in' && hasRequiredRole(caller.role, 'attendant'));
  if (!allowedImplicit) {
    throw new AppError(
      'FORBIDDEN',
      'Criação sem confirmação explícita do cliente é administrativa: restrita a tenant_admin/owner ou walk-in operado por perfil de balcão (attendant+).',
      403,
    );
  }
}
