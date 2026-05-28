import { useQuery } from '@tanstack/react-query';
import { fetchTenantVertical } from '@/features/vertical/verticalService';
import { getVerticalLabels } from '@/lib/vertical/labels';

export function useTenantVertical() {
  const q = useQuery({
    queryKey: ['tenant-vertical'],
    queryFn: fetchTenantVertical,
    staleTime: 5 * 60_000,
  });

  const vertical = q.data?.vertical ?? 'barbershop';
  const labels = q.data?.labels ?? getVerticalLabels('barbershop');
  const isCarWash = vertical === 'car_wash';

  return {
    ...q,
    vertical,
    labels,
    isCarWash,
    carWash: q.data?.car_wash,
  };
}
