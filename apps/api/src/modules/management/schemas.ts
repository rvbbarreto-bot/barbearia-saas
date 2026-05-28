import { z } from 'zod';

export const managementDashboardQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  professional_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  appointment_status: z.string().optional(),
});

export type ManagementDashboardQuery = z.infer<typeof managementDashboardQuerySchema>;
