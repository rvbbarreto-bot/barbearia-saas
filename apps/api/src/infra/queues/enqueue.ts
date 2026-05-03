/**
 * enqueue.ts — re-exporta a API pública do outbox.
 *
 * Mantido para não quebrar imports existentes.
 * Novos módulos devem importar de './outbox.service.js' diretamente.
 */
export { enqueueOutboundMessage, enqueueWhatsAppMessage } from './outbox.service.js';
export type { EnqueueOutboundInput, OutboundPayload, OutboundMetadata } from './outbox.service.js';
