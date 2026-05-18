import { NavLink } from 'react-router-dom';
import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAV } from '@/config/nav';
import { CAR_WASH_NAV } from '@/config/navCarWash';
import { hasMinRole } from '@/lib/rbac';
import { useAuthStore } from '@/store/authStore';
import { useTenantVertical } from '@/hooks/useTenantVertical';

export function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  const { isCarWash, labels } = useTenantVertical();
  const baseNav = APP_NAV.map((item) => {
    if (item.to === '/profissionais' && isCarWash) {
      return { ...item, label: labels.professionals };
    }
    return item;
  });
  const items = [...baseNav, ...(isCarWash ? CAR_WASH_NAV : [])].filter((item) =>
    hasMinRole(role, item.minRole),
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Scissors className="size-5 text-primary" />
          {isCarWash ? 'Lava-rápido' : 'Barbearia'}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
