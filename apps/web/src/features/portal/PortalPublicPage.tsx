import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRows } from '@/components/shared/SkeletonRows';

type PortalView = {
  appointment_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  service_name: string | null;
  professional_name: string | null;
  customer_name: string | null;
  tenant_display_name: string | null;
  can_confirm: boolean;
  can_cancel: boolean;
};

async function fetchPortal(token: string) {
  const { data } = await axios.get<PortalView>(`/api/v1/public/portal/appointments/${encodeURIComponent(token)}`);
  return data;
}

export function PortalPublicPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['portal', token],
    queryFn: () => fetchPortal(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const runAction = async (action: 'confirm' | 'cancel') => {
    if (!token) return;
    setActionError(null);
    try {
      await axios.post(`/api/v1/public/portal/appointments/${encodeURIComponent(token)}/${action}`);
      await qc.invalidateQueries({ queryKey: ['portal', token] });
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Não foi possível concluir a ação.';
      setActionError(msg);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <EmptyState title="Link inválido" description="Token ausente no endereço." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-8 max-w-lg mx-auto">
        <SkeletonRows rows={4} cols={1} />
      </div>
    );
  }

  if (isError) {
    const msg =
      axios.isAxiosError(error) && error.response?.data?.message
        ? String(error.response.data.message)
        : 'Link inválido ou expirado.';
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <EmptyState title="Não foi possível abrir" description={msg} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg space-y-4">
        <h1 className="text-xl font-semibold">{data.tenant_display_name ?? 'Seu agendamento'}</h1>
        <p className="text-sm text-muted-foreground">{data.service_name ?? 'Serviço'}</p>
        <p className="text-sm">
          {new Date(data.starts_at).toLocaleString('pt-BR')} — {data.status}
        </p>
        {data.professional_name && (
          <p className="text-sm">
            Profissional: <span className="font-medium">{data.professional_name}</span>
          </p>
        )}
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}
        <div className="flex gap-2 pt-2">
          {data.can_confirm && (
            <Button className="flex-1" onClick={() => runAction('confirm')}>
              Confirmar
            </Button>
          )}
          {data.can_cancel && (
            <Button variant="outline" className="flex-1" onClick={() => runAction('cancel')}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
