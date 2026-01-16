import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Users, ScanBarcode, FolderOpen, Pill, LayoutDashboard } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

const navItems = [
  { href: '/', label: 'Data Template', icon: FolderOpen, roles: ['scanner', 'manager'] },
  { href: '/scan', label: 'Scanner', icon: ScanBarcode, roles: ['scanner', 'manager'] },
  { href: '/fda', label: 'FDA', icon: Pill, roles: ['manager'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['manager'] },
];

export function AppLayout({ children, fullWidth = false }: AppLayoutProps) {
  const { user, roles, isManager, signOut } = useAuth();
  const location = useLocation();

  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const visibleNavItems = navItems.filter((item) =>
    item.roles.some((role) => roles.includes(role as 'scanner' | 'manager'))
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Sidebar */}
      <aside className="w-56 bg-[hsl(215,50%,23%)] text-white flex flex-col fixed h-screen">
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-wide">MERIDIAN</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link key={item.href} to={item.href}>
                <div
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.user_metadata?.avatar_url} alt="Avatar" />
              <AvatarFallback className="bg-white/20 text-white text-sm">
                {getInitials(user?.user_metadata?.full_name || user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.user_metadata?.full_name || 'User'}
              </p>
              {isManager && (
                <span className="text-xs text-white/60">Manager</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-56">
        <main className={cn("p-6", fullWidth ? "" : "max-w-7xl mx-auto")}>{children}</main>
      </div>
    </div>
  );
}
