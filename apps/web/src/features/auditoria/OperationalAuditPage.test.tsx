import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OperationalAuditPage } from './OperationalAuditPage';
import * as auditService from './operationalAuditService';

vi.mock('./operationalAuditService');

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000088',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  entity_type: 'appointment',
  entity_id: '00000000-0000-0000-0000-000000000099',
  event_type: 'appointment_confirmed',
  actor_user_id: '00000000-0000-0000-0000-000000000002',
  actor_role: 'manager',
  source: 'api',
  request_id: 'req-1',
  correlation_id: 'corr-xyz',
  metadata: { previous_status: 'pending' },
  created_at: '2026-05-16T12:00:00.000Z',
};

function renderPage(initialEntries = ['/operacao/auditoria']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <OperationalAuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperationalAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders filters and table', async () => {
    vi.mocked(auditService.listOperationalAuditEvents).mockResolvedValue({
      data: [sampleRow],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderPage();
    expect(screen.getByTestId('operational-audit-page')).toBeInTheDocument();
    expect(screen.getByTestId('operational-audit-filters')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('appointment_confirmed')).toBeInTheDocument());
  });

  it('shows error state', async () => {
    vi.mocked(auditService.listOperationalAuditEvents).mockRejectedValue(new Error('403'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('operational-audit-error')).toBeInTheDocument());
  });

  it('prefills correlation_id from URL', () => {
    vi.mocked(auditService.listOperationalAuditEvents).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    renderPage(['/operacao/auditoria?correlation_id=from-url']);
    expect(screen.getByTestId('operational-audit-filter-correlation')).toHaveValue('from-url');
  });
});
