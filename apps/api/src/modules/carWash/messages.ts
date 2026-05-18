import type { PoolClient } from 'pg';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';
import { blocksTransactionalReminders, loadCustomerConsentFlags } from '../notificationJobs/consent.js';
import { resolveWhatsAppOutboundRouting } from '../notificationJobs/routing.js';
import { formatVehicleLabel } from '../vehicles/plate.js';
import { loadTenantTimeZone } from '../notificationJobs/schedule.js';

export async function loadVehicleLabelForAppointment(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<string | null> {
  const r = await client.query<{
    plate: string | null;
    brand: string | null;
    model: string | null;
    color: string | null;
  }>(
    `SELECT v.plate, v.brand, v.model, v.color
       FROM car_wash_jobs j
       JOIN customer_vehicles v ON v.tenant_id = j.tenant_id AND v.id = j.vehicle_id
      WHERE j.tenant_id = $1 AND j.appointment_id = $2
      LIMIT 1`,
    [tenantId, appointmentId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return formatVehicleLabel(row);
}

export async function buildCarWashConfirmationText(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  customerName: string,
  tenantName: string,
  dateTimeLabel: string,
  serviceName: string,
): Promise<string> {
  const vehicle = await loadVehicleLabelForAppointment(client, tenantId, appointmentId);
  const vehicleLine = vehicle ? `\nVeículo: ${vehicle}.` : '';
  return (
    `Olá, ${customerName}. Seu agendamento no ${tenantName} foi confirmado para ${dateTimeLabel}.` +
    `${vehicleLine}\nServiço: ${serviceName}.`
  );
}

export async function enqueueCarWashReadyNotification(
  client: PoolClient,
  tenantId: string,
  jobId: string,
  appointmentId: string,
  customerId: string,
  correlationId: string,
): Promise<{ inserted: boolean; skipped?: string }> {
  const flags = await loadCustomerConsentFlags(client, tenantId, customerId);
  if (
    blocksTransactionalReminders(
      flags.whatsapp_opt_in,
      flags.whatsapp_opt_out,
      flags.latest.transactional,
    )
  ) {
    return { inserted: false, skipped: 'SKIP_REMINDER_CONSENT' };
  }

  const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
  if (!routing) {
    return { inserted: false, skipped: 'SKIP_NO_ROUTING' };
  }

  const ctx = await client.query<{
    customer_name: string | null;
    trade_name: string;
    plate: string | null;
    brand: string | null;
    model: string | null;
    color: string | null;
  }>(
    `SELECT c.name AS customer_name, t.trade_name,
            v.plate, v.brand, v.model, v.color
       FROM car_wash_jobs j
       JOIN appointments a ON a.tenant_id = j.tenant_id AND a.id = j.appointment_id
       JOIN customers c ON c.tenant_id = a.tenant_id AND c.id = a.customer_id
       JOIN tenants t ON t.id = j.tenant_id
       JOIN customer_vehicles v ON v.tenant_id = j.tenant_id AND v.id = j.vehicle_id
      WHERE j.tenant_id = $1 AND j.id = $2
      LIMIT 1`,
    [tenantId, jobId],
  );
  const row = ctx.rows[0];
  if (!row) return { inserted: false, skipped: 'SKIP_JOB_NOT_FOUND' };

  const nome = row.customer_name?.trim() || 'Cliente';
  const vehicleLabel = formatVehicleLabel(row);
  const text = `Olá, ${nome}. Seu veículo ${vehicleLabel} está pronto para retirada.\nObrigado por escolher o ${row.trade_name}.`;
  const idempotencyKey = `car_wash_ready:${jobId}`;

  const enq = await enqueueOutboundMessage(
    {
      tenantId,
      customerId,
      payload: { type: 'text', text },
      metadata: {
        phone: routing.phone,
        instance_name: routing.instance_name,
        provider: 'evolution',
      },
      idempotencyKey,
      correlationId,
    },
    client,
  );
  return enq;
}

export async function formatAppointmentDateTimeLabel(
  client: PoolClient,
  tenantId: string,
  startsAt: Date | string,
): Promise<string> {
  const tz = await loadTenantTimeZone(client, tenantId);
  const d = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const data = d.toLocaleDateString('pt-BR', { timeZone: tz });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
}
