import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { fetchCustomerOverview } from './customer360Service';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}

export function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const customerId = id ?? '';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customer-360', customerId],
    queryFn: () => fetchCustomerOverview(customerId),
    enabled: Boolean(customerId),
  });

  if (!customerId) {
    return <EmptyState title="Cliente inválido" description="Identificador ausente na URL." />;
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <SkeletonRows rows={8} cols={2} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Erro ao carregar visão 360"
          description={error instanceof Error ? error.message : 'Tente novamente.'}
          actionLabel="Tentar de novo"
          onAction={() => refetch()}
        />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Cliente não encontrado" description="Verifique o identificador." />;
  }

  const c = data.customer as { name?: string; phone?: string; email?: string };
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle className="h-7 w-7" />
          Cliente 360 — {c.name ?? c.phone ?? customerId.slice(0, 8)}
        </h1>
        <Button asChild>
          <Link to="/agenda">Novo agendamento</Link>
        </Button>
      </div>

      <Section title="Cadastro">
        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Telefone:</span> {String(c.phone ?? '—')}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail:</span> {String(c.email ?? '—')}
          </p>
          <p>
            <span className="text-muted-foreground">WhatsApp opt-in:</span>{' '}
            {data.whatsapp_opt_in ? 'Sim' : 'Não'}
          </p>
        </div>
      </Section>

      <Section title={`Agendamentos (${data.appointments.length})`}>
        {data.appointments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem histórico.</p>
        ) : (
          <ul className="text-sm space-y-1 max-h-48 overflow-auto">
            {data.appointments.slice(0, 15).map((a) => (
              <li key={String(a.id)}>
                {String(a.starts_at)} — {String(a.status)} — {String(a.service_name ?? '')}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.vertical === 'car_wash' && (
        <Section title={`Veículos (${data.vehicles.length})`}>
          {data.vehicles.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum veículo cadastrado.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {data.vehicles.map((v) => (
                <li key={String(v.id)}>
                  {String(v.plate)} — {String(v.model ?? '')}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Financeiro recente">
        {data.financials.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem lançamentos.</p>
        ) : (
          <ul className="text-sm space-y-1 max-h-40 overflow-auto">
            {data.financials.slice(0, 10).map((f, i) => (
              <li key={i}>
                {String(f.appointment_starts_at)} — serviço {String(f.service_price_cents)} centavos
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
