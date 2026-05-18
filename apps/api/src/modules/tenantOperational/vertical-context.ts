import { loadTenantVerticalContext } from '../vertical/tenant-vertical.service.js';

export async function getTenantVerticalContext(tenantId: string) {
  return loadTenantVerticalContext(tenantId);
}
