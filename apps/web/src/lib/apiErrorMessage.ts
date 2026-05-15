import axios from 'axios';

/** Códigos `error` devolvidos pela API (ver `AppError` / middlewares). */
const API_ERROR_MESSAGES: Record<string, string> = {
  SLOT_UNAVAILABLE: 'Horário indisponível. Escolha outro horário.',
  TENANT_REQUIRED: 'Não foi possível identificar a unidade. Faça login novamente.',
  TENANT_MISMATCH: 'Você não tem permissão para acessar dados desta unidade.',
  CUSTOMER_NOT_FOUND: 'Cliente não encontrado.',
  PROFESSIONAL_NOT_FOUND: 'Profissional não encontrado.',
  SERVICE_NOT_FOUND: 'Serviço não encontrado.',
  APPOINTMENT_IN_PAST: 'Não é possível agendar no passado.',
  DUPLICATE_IDEMPOTENCY_KEY: 'Esta operação já foi processada. Atualize a tela.',
  FORBIDDEN: 'Você não tem permissão para executar esta ação.',
  UNAUTHORIZED: 'Sessão inválida ou expirada. Faça login novamente.',
  SESSION_REVOKED: 'Sessão revogada. Faça login novamente.',
  OUTBOX_SEND_FAILED: 'Mensagem não enviada. Verifique o painel de mensagens.',
  OUTBOX_RETRY_NOT_ALLOWED: 'Não é possível re-enfileirar esta mensagem neste estado.',
  NOT_FOUND: 'Registo não encontrado.',
  VALIDATION_ERROR: 'Dados inválidos. Verifique os campos e tente novamente.',
  INTERNAL_ERROR: 'Não foi possível concluir a operação. Tente novamente ou contacte o suporte.',
};

const FALLBACK = 'Não foi possível concluir a operação. Tente novamente ou contacte o suporte.';

function isUnsafeTechnicalMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('stack') ||
    m.includes('axios') ||
    m.includes('network error') ||
    m.includes('request failed') ||
    m.includes('fetch failed') ||
    m.includes('econnrefused') ||
    m.includes('timeout')
  );
}

/**
 * Mensagem amigável para operadores (sem stack traces nem erros crus de rede).
 */
export function getApiErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    const code = typeof data?.error === 'string' ? data.error : undefined;
    if (code && API_ERROR_MESSAGES[code]) {
      return API_ERROR_MESSAGES[code]!;
    }
    if (status === 401) {
      return API_ERROR_MESSAGES.UNAUTHORIZED!;
    }
    if (status === 403) {
      if (code === 'TENANT_MISMATCH') return API_ERROR_MESSAGES.TENANT_MISMATCH!;
      return API_ERROR_MESSAGES.FORBIDDEN!;
    }
    const msg = typeof data?.message === 'string' ? data.message.trim() : '';
    if (msg && !isUnsafeTechnicalMessage(msg)) {
      return msg;
    }
    if (!err.response) {
      return 'Sem ligação ao servidor. Verifique a rede e tente novamente.';
    }
  }
  if (err instanceof Error && err.message && !isUnsafeTechnicalMessage(err.message)) {
    return err.message;
  }
  return fallback;
}

export function registerApiErrorCode(code: string, message: string): void {
  API_ERROR_MESSAGES[code] = message;
}
