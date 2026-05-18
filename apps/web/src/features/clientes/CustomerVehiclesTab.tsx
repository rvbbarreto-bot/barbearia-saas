import { useQuery } from '@tanstack/react-query';
import { listVehicles } from '../veiculos/veiculosService';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { useTenantVertical } from '@/hooks/useTenantVertical';

export function CustomerVehiclesTab({ customerId }: { customerId: string }) {
  const { labels, isCarWash } = useTenantVertical();
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-vehicles', customerId],
    queryFn: () => listVehicles({ customer_id: customerId, page: 1, limit: 50 }),
  });

  if (!isCarWash) {
    return (
      <p className="text-sm text-muted-foreground">
        Aba de {labels.vehicles.toLowerCase()} disponível para tenants lava-rápido.
      </p>
    );
  }

  if (isLoading) return <SkeletonRows rows={4} cols={2} />;

  if (!data?.data.length) {
    return <p className="text-sm text-muted-foreground">Nenhum {labels.vehicle.toLowerCase()} vinculado.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {data.data.map((v) => (
        <li key={v.id} className="rounded-md border px-3 py-2">
          <span className="font-medium">{v.plate}</span>
          <span className="text-muted-foreground">
            {' '}
            — {[v.brand, v.model, v.color].filter(Boolean).join(' ')}
          </span>
        </li>
      ))}
    </ul>
  );
}
