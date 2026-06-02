/** Preserva payload WF01 + contexto multi-mensagem da sessão WhatsApp. */
const t = $input.first().json ?? {};
const enrichment = t.enrichment ?? {};
const normalized = t.normalized ?? {};
const core = t.core_response ?? {};
const conv = enrichment.conversation_context ?? t.conversation_context ?? {};

const sessionText = String(
  conv.session_text ?? conv.sessionText ?? normalized.text ?? '',
).trim();
const lastMessage = String(normalized.text ?? '').trim();

return [
  {
    json: {
      ...t,
      enrichment,
      normalized,
      core_response: core,
      conversation_context: conv,
      inbound: {
        phone: normalized.phone ?? null,
        message: lastMessage,
        session_text: sessionText || lastMessage,
        recent_messages: Array.isArray(conv.recent_messages) ? conv.recent_messages : [],
        push_name: normalized.push_name ?? null,
        customer_name: normalized.push_name ?? normalized.name ?? null,
        customer_id: enrichment.customer_id ?? core.customerId ?? null,
        tenant_id: enrichment.tenant_id ?? core.tenantId ?? null,
        message_id: enrichment.message_id ?? core.messageId ?? null,
        scheduling_draft:
          conv.scheduling_draft && typeof conv.scheduling_draft === 'object'
            ? conv.scheduling_draft
            : {},
      },
    },
  },
];
