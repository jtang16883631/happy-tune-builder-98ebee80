import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, Database, CloudOff, FileSpreadsheet, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickClockPanel } from '@/components/timesheet/QuickClockPanel';
import { Button } from '@/components/ui/button';
import { isForceOfflineMode, setForceOfflineMode } from '@/components/OfflineRedirect';

interface OfflineLayoutProps {
  children: ReactNode;
}

const offlineTabs = [
  { href: '/scan', label: 'Audit Projects', icon: ClipboardList },
  { href: '/compile', label: 'Compile', icon: FileSpreadsheet },
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
        {isForceOfflineMode() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setForceOfflineMode(false);
              window.location.reload();
            }}
            className="text-white/70 hover:text-white hover:bg-white/10 gap-2 text-xs"
          >
            <Wifi className="h-3.5 w-3.5" />
            Go Online
          </Button>
        )}
        <span className="text-xs text-white/50">Audit, Compile & Master Data available offline</span>
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
