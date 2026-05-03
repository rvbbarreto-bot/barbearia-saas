/**
 * Alinhado a `tenant_settings.settings.commission_enabled` e a defaults operacionais (default false).
 * Evita importar `tenantOperational/service` (pool/env) em caminhos de teste unitário.
 */
export function isCommissionEnabledInSettingsJson(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  return (settings as Record<string, unknown>).commission_enabled === true;
}
