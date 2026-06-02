/** Monta POST /appointments — escolhe slot (preferência de horário se informada). */
const row = $input.first().json ?? {};
const slots = Array.isArray(row.slots) ? row.slots : [];

if (!slots.length) {
  return [
    {
      json: {
        ...row,
        appointment_payload: null,
        response_text:
          row.response_text ||
          'No momento nao temos horarios livres para essa data. Quer tentar outro dia?',
      },
    },
  ];
}

function pickSlot(list, preferred) {
  if (!preferred || !/^\d{2}:\d{2}$/.test(preferred)) return list[0];
  const [ph, pm] = preferred.split(':').map((x) => parseInt(x, 10));
  let best = list[0];
  let bestDiff = Number.MAX_SAFE_INTEGER;
  for (const s of list) {
    const d = new Date(s.starts_at);
    const diff = Math.abs(d.getUTCHours() * 60 + d.getUTCMinutes() - (ph * 60 + pm));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

const slot = pickSlot(slots, row.appointment_time);
const execId = String($execution.id);
const payload = {
  customer_id: row.customer_id,
  professional_id: row.professional_id,
  service_id: row.service_id,
  starts_at: slot.starts_at,
  ends_at: slot.ends_at,
  source: 'whatsapp',
  explicit_confirmation: true,
  idempotency_key: `n8n-wf02-appt-${execId}`,
  notes: 'Agendamento via agente WhatsApp (WF02)',
};

return [{ json: { ...row, ...payload, appointment_payload: payload } }];
