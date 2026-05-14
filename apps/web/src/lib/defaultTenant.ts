/**
 * UUID do tenant demo usado quando o campo Tenant no login está vazio ou quando o build
 * define `VITE_DEFAULT_TENANT_ID` como string vazia (comum no Docker sem ARG explícito).
 */
export const DEMO_TENANT_ID_FALLBACK = '00000000-0000-0000-0000-000000000001';

/** Em JS `??` não substitui `""`; builds Docker podem deixar `VITE_DEFAULT_TENANT_ID` vazio. */
export function getDefaultTenantId(): string {
  const v = import.meta.env.VITE_DEFAULT_TENANT_ID;
  if (typeof v !== 'string') return DEMO_TENANT_ID_FALLBACK;
  const t = v.trim();
  return t !== '' ? t : DEMO_TENANT_ID_FALLBACK;
}
