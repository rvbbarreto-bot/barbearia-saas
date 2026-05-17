import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OutboxMessagesPage } from './OutboxMessagesPage';
import * as outboxService from './outboxMessagesService';

const authState = vi.hoisted(() => ({ user: { role: 'manager' as string } }));

vi.mock('./outboxMessagesService');
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000099',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  channel: 'whatsapp',
  provider: 'evolution',
  status: 'failed',
  destination: '****7766',
  payload_summary: { type: 'text', preview: 'Olá' },
  last_error: 'HTTP 401 Unauthorized',
  error_class: 'auth' as const,
  attempts: 1,
  max_attempts: 5,
  correlation_id: 'corr-1',
  appointment_id: null,
  idempotency_key: 'idem-1',
  customer_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  created_at: '2026-05-16T12:00:00.000Z',
  updated_at: '2026-05-16T12:00:00.000Z',
  sent_at: null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/operacao/mensagens']}>
        <OutboxMessagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OutboxMessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { role: 'manager' };
  });

  it('renders list with filters and table', async () => {
    vi.mocked(outboxService.listOutboxMessages).mockResolvedValue({
      data: [sampleRow],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderPage();
    expect(screen.getByTestId('outbox-page')).toBeInTheDocument();
    expect(screen.getByTestId('outbox-filters')).toBeInTheDocument();
    expect(screen.getByTestId('outbox-filter-status')).toBeInTheDocument();
    expect(screen.getByTestId('outbox-filter-customer-id')).toBeInTheDocument();
    expect(screen.getByTestId('outbox-filter-error-class')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('outbox-table')).toBeInTheDocument();
    });
  });

  it('shows empty state when no rows', async () => {
    vi.mocked(outboxService.listOutboxMessages).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('outbox-empty-state')).toBeInTheDocument();
    });
  });

  it('shows error banner when query fails', async () => {
    vi.mocked(outboxService.listOutboxMessages).mockRejectedValue(new Error('network down'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('outbox-error-banner')).toBeInTheDocument();
    });
  });

});
