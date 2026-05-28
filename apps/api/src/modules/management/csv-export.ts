import type { ManagementDashboard } from './service.js';

export function managementDashboardToCsv(dashboard: ManagementDashboard): string {
  const lines: string[] = [
    'metric,value',
    `period_from,${dashboard.period.from}`,
    `period_to,${dashboard.period.to}`,
    `gross_revenue_cents,${dashboard.kpis.gross_revenue_cents}`,
    `net_revenue_cents,${dashboard.kpis.net_revenue_cents}`,
    `appointments_created,${dashboard.kpis.appointments_created}`,
    `appointments_completed,${dashboard.kpis.appointments_completed}`,
    `appointments_cancelled,${dashboard.kpis.appointments_cancelled}`,
    `no_show_count,${dashboard.kpis.no_show_count}`,
    `average_ticket_cents,${dashboard.kpis.average_ticket_cents}`,
    `completion_rate,${dashboard.kpis.completion_rate}`,
    '',
    'top_service_id,top_service_name,count,revenue_cents',
  ];
  for (const s of dashboard.top_services) {
    lines.push(`${s.service_id},${JSON.stringify(s.service_name)},${s.count},${s.revenue_cents}`);
  }
  lines.push('', 'top_professional_id,top_professional_name,completed,revenue_cents');
  for (const p of dashboard.top_professionals) {
    lines.push(`${p.professional_id},${JSON.stringify(p.professional_name)},${p.completed},${p.revenue_cents}`);
  }
  lines.push('', 'outbox_status,count');
  for (const [status, count] of Object.entries(dashboard.outbox.by_status)) {
    lines.push(`${status},${count}`);
  }
  return lines.join('\n');
}
