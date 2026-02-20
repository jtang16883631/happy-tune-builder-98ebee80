import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, Database, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickClockPanel } from '@/components/timesheet/QuickClockPanel';

interface OfflineLayoutProps {
  children: ReactNode;
}

const offlineTabs = [
  { href: '/scan', label: 'Audit Projects', icon: ClipboardList },
  { href: '/fda', label: 'Master Data', icon: Database },
];

/**
 * Minimal layout shown when the app is offline.
 * Only "Audit Projects" and "Master Data" are accessible.
 * All other navigation is hidden to prevent black screens.
 */
export function OfflineLayout({ children }: OfflineLayoutProps) {
  const location = useLocation();
  const cachedUserId = localStorage.getItem('cached_user_id');
  const cachedUserRole: string | null = (() => {
    try {
      const raw = cachedUserId ? localStorage.getItem(`cached_roles:${cachedUserId}`) : null;
      const roles: string[] = raw ? JSON.parse(raw) : [];
      return roles[0] ?? null;
    } catch { return null; }
  })();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="bg-[hsl(215,50%,23%)] text-white h-14 flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2 text-white/80">
          <CloudOff className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-wide">MERIDIAN PORTAL — OFFLINE MODE</span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-white/50">Only Audit & Master Data are available offline</span>
      </header>

      {/* Tab bar */}
      <nav className="bg-[hsl(215,50%,28%)] flex items-center px-4 gap-1 shrink-0">
        {offlineTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.href;
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2',
                isActive
                  ? 'border-white text-white'
                  : 'border-transparent text-white/60 hover:text-white hover:border-white/40'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Quick Clock Panel (offline) */}
      {cachedUserId && (
        <div className="px-6 pt-4">
          <QuickClockPanel userId={cachedUserId} userRole={cachedUserRole} />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-6 w-full">
        {children}
      </main>
    </div>
  );
}
