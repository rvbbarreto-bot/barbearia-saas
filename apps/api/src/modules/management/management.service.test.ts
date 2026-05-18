import { describe, expect, it } from 'vitest';
import { managementDashboardToCsv } from './csv-export.js';

const sampleDashboard = {
  period: { from: '2026-05-01', to: '2026-05-07' },
  kpis: {
    gross_revenue_cents: 10000,
    net_revenue_cents: 9000,
    appointments_created: 5,
    appointments_completed: 4,
    appointments_cancelled: 1,
    no_show_count: 0,
    average_ticket_cents: 2500,
    completion_rate: 0.8,
  },
  top_services: [{ service_id: 's1', service_name: 'Corte', count: 3, revenue_cents: 7500 }],
  top_professionals: [
    { professional_id: 'p1', professional_name: 'João', completed: 4, revenue_cents: 10000 },
  ],
  outbox: { by_status: { pending: 2, sent: 10 }, pending: 2, dead: 0 },
  recent_operational_errors: [],
};

describe('managementDashboardToCsv', () => {
  it('inclui KPIs e rankings no CSV', () => {
    const csv = managementDashboardToCsv(sampleDashboard);
    expect(csv).toContain('gross_revenue_cents,10000');
    expect(csv).toContain('top_service_id,top_service_name');
    expect(csv).toContain('Corte');
    expect(csv).toContain('outbox_status,count');
    expect(csv).toContain('pending,2');
  });
});
