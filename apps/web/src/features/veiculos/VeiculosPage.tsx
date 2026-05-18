import { useState } from 'react';
import { Car, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useTenantVertical } from '@/hooks/useTenantVertical';
import { listClientes } from '../clientes/clientesService';
import { createVehicle, listVehicles, type Vehicle } from './veiculosService';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';

const columns: Column<Vehicle>[] = [
  { key: 'plate', header: 'Placa', cell: (r) => r.plate ?? '—' },
  {
    key: 'model',
    header: 'Modelo',
    cell: (r) => [r.brand, r.model].filter(Boolean).join(' ') || '—',
  },
  { key: 'color', header: 'Cor', cell: (r) => r.color ?? '—' },
];

export function VeiculosPage() {
  const { labels } = useTenantVertical();
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [customerId, setCustomerId] = useState('');
  const qc = useQueryClient();

  const { data, isLoading, search, setSearch, page, setPage, limit } = usePaginatedQuery<Vehicle>({
    queryKey: 'veiculos',
    fetcher: (p) => listVehicles(p),
  });

  const { data: clientes } = useQuery({
    queryKey: ['veiculos-clientes'],
    queryFn: () => listClientes({ page: 1, limit: 50, search: '' }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      createVehicle({
        customer_id: customerId,
        plate: plate.toUpperCase(),
        brand: brand || undefined,
        model: model || undefined,
        color: color || undefined,
      }),
    onSuccess: () => {
      toast.success(`${labels.vehicle} cadastrado.`);
      qc.invalidateQueries({ queryKey: ['veiculos'] });
      setOpen(false);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao cadastrar veículo.')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{labels.vehicles}</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} cadastrados</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Novo {labels.vehicle}
        </Button>
      </div>

      <Input
        placeholder="Buscar por placa ou modelo..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        aria-label="Buscar veículos"
      />

      {!isLoading && !data?.data.length && !search ? (
        <EmptyState
          icon={Car}
          title={`Nenhum ${labels.vehicle.toLowerCase()} cadastrado`}
          description="Cadastre o primeiro veículo."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <DataTable<Vehicle>
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            page={page}
            limit={limit}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo {labels.vehicle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>{labels.customer}</Label>
              <select
                className="rounded-md border px-3 py-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {(clientes?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.phone}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Placa</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1D23" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Marca</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Cor</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <Button
              disabled={!customerId || !plate || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
