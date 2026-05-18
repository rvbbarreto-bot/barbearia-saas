import { Car, LayoutGrid } from 'lucide-react';
import type { AppNavItem } from './nav';

/** Itens extras visíveis apenas para vertical car_wash. */
export const CAR_WASH_NAV: AppNavItem[] = [
  { to: '/veiculos', label: 'Veículos', icon: Car, minRole: 'attendant' },
  { to: '/operacao/lava-rapido', label: 'Pátio', icon: LayoutGrid, minRole: 'attendant' },
];
