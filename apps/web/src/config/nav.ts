import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCircle,
  Settings,
  MessageCircle,
  ClipboardList,
  ListOrdered,
  Wallet,
  Percent,
  Inbox,
} from 'lucide-react';
import { ROLE_LEVEL } from '@/lib/rbac';

export type NavMinRole = keyof typeof ROLE_LEVEL;

export type AppNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  minRole: NavMinRole;
};

/** Ordem do menu; cada item exige pelo menos `minRole` (níveis V4 alinhados à API). */
export const APP_NAV: AppNavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'viewer' },
  { to: '/agenda', label: 'Agenda', icon: Calendar, minRole: 'viewer' },
  { to: '/conversas', label: 'Conversas', icon: MessageCircle, minRole: 'attendant' },
  { to: '/clientes', label: 'Clientes', icon: Users, minRole: 'attendant' },
  { to: '/servicos', label: 'Serviços', icon: Scissors, minRole: 'manager' },
  { to: '/profissionais', label: 'Profissionais', icon: UserCircle, minRole: 'manager' },
  { to: '/lista-espera', label: 'Lista de espera', icon: ListOrdered, minRole: 'attendant' },
  { to: '/operacao/financeiro', label: 'Financeiro', icon: Wallet, minRole: 'manager' },
  { to: '/operacao/mensagens', label: 'Mensagens', icon: Inbox, minRole: 'attendant' },
  { to: '/operacao/auditoria', label: 'Auditoria operacional', icon: ClipboardList, minRole: 'manager' },
  { to: '/operacao/comissao', label: 'Comissões', icon: Percent, minRole: 'manager' },
  { to: '/auditoria', label: 'Auditoria', icon: ClipboardList, minRole: 'tenant_admin' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, minRole: 'manager' },
];
