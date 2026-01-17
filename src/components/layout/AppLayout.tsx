import { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Users, ScanBarcode, FolderOpen, Pill, LayoutDashboard, CalendarDays, Clock, PanelLeftClose, PanelLeft, Radio, ClipboardList, AlertTriangle, HardDrive, FileText, Database } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

type AppRole = 'auditor' | 'developer' | 'coordinator' | 'owner';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: AppRole[];
  disabled?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['auditor', 'developer', 'coordinator', 'owner'] },
      { href: '/schedule', label: 'Schedule Hub', icon: CalendarDays, roles: ['auditor', 'developer', 'coordinator', 'owner'] },
      { href: '#', label: 'Live Tracker', icon: Radio, roles: ['auditor', 'developer', 'coordinator', 'owner'], disabled: true },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { href: '/scan', label: 'Audit Projects', icon: ClipboardList, roles: ['auditor', 'developer', 'coordinator', 'owner'] },
      { href: '/data-template', label: 'Data Templates', icon: FolderOpen, roles: ['auditor', 'developer', 'coordinator', 'owner'] },
      { href: '#', label: 'Field Issues', icon: AlertTriangle, roles: ['auditor', 'developer', 'coordinator', 'owner'], disabled: true },
    ],
  },
  {
    title: 'DATA CENTER',
    items: [
      { href: '#', label: 'OneDrive Files', icon: HardDrive, roles: ['auditor', 'developer', 'coordinator', 'owner'], disabled: true },
      { href: '#', label: 'Reports', icon: FileText, roles: ['auditor', 'developer', 'coordinator', 'owner'], disabled: true },
      { href: '/fda', label: 'Master Data', icon: Database, roles: ['developer', 'owner'] },
    ],
  },
  {
    title: 'HR',
    items: [
      { href: '/timesheet', label: 'Timesheet', icon: Clock, roles: ['auditor', 'developer', 'coordinator', 'owner'] },
      { href: '/users', label: 'Users', icon: Users, roles: ['developer', 'owner'] },
    ],
  },
];

export function AppLayout({ children, fullWidth = false }: AppLayoutProps) {
  const { user, roles, isPrivileged, signOut } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = () => {
    if (roles.includes('owner')) return 'Owner';
    if (roles.includes('developer')) return 'Developer';
    if (roles.includes('coordinator')) return 'Coordinator';
    if (roles.includes('auditor')) return 'Auditor';
    return null;
  };

  const getVisibleSections = () => {
    return navSections.map(section => ({
      ...section,
      items: section.items.filter(item =>
        item.roles.some(role => roles.includes(role as AppRole))
      )
    })).filter(section => section.items.length > 0);
  };

  const visibleSections = getVisibleSections();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Sidebar */}
      <aside 
        className={cn(
          "bg-[hsl(215,50%,23%)] text-white flex flex-col fixed h-screen transition-all duration-300",
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-56"
        )}
      >
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
        <nav className="flex-1 py-4 px-2 space-y-4 overflow-y-auto">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <div className="px-3 mb-2">
                <span className="text-xs font-semibold text-white/50 tracking-wider">
                  {section.title}
                </span>
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  const isDisabled = item.disabled;
                  
                  if (isDisabled) {
                    return (
                      <div
                        key={item.href + item.label}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/40 cursor-not-allowed"
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                    );
                  }
                  
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
              </div>
            </div>
          ))}
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
              {getRoleLabel() && (
                <span className="text-xs text-white/60">{getRoleLabel()}</span>
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
      <div className={cn(
        "flex-1 transition-all duration-300",
        sidebarCollapsed ? "ml-0" : "ml-56"
      )}>
        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            "fixed top-4 z-50 h-9 w-9 transition-all duration-300",
            sidebarCollapsed 
              ? "left-4 bg-[hsl(215,50%,23%)] text-white hover:bg-[hsl(215,50%,30%)]" 
              : "left-[14.5rem] text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
        
        <main className={cn("p-6 pt-16", fullWidth ? "" : "max-w-7xl mx-auto")}>{children}</main>
      </div>
    </div>
  );
}