import { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Users, ScanBarcode, FolderOpen, Pill, LayoutDashboard, CalendarDays, Clock, PanelLeftClose, PanelLeft, Radio, ClipboardList, AlertTriangle, HardDrive, FileText, Database, ShieldX, MessageSquare, UserCog, Ticket, FileStack, Zap, History, Lightbulb } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AnnouncementBell } from '@/components/announcements/AnnouncementBell';
import { ProfileCompletionDialog } from '@/components/profile/ProfileCompletionDialog';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileBottomNav } from './MobileNav';
import { MobileHeader } from './MobileHeader';
import { useOnlineStatus } from '@/components/OfflineRedirect';


interface AppLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
  defaultCollapsed?: boolean;
}

type AppRole = 'auditor' | 'developer' | 'coordinator' | 'owner' | 'office_admin';

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

const allRoles: AppRole[] = ['auditor', 'developer', 'coordinator', 'owner', 'office_admin'];

const navSections: NavSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: allRoles },
      { href: '/live-tracker', label: 'Live Tracker', icon: Radio, roles: allRoles },
      { href: '/tickets', label: 'Ticket Database', icon: Ticket, roles: allRoles },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { href: '/scan', label: 'Audit Projects', icon: ClipboardList, roles: allRoles },
      { href: '/automation', label: 'Automation', icon: Zap, roles: allRoles },
      { href: '/data-template', label: 'Data Templates', icon: FolderOpen, roles: allRoles },
      { href: '/issues', label: 'Issues', icon: AlertTriangle, roles: allRoles },
    ],
  },
  {
    title: 'DATA CENTER',
    items: [
      { href: '/onedrive', label: 'OneDrive Files', icon: HardDrive, roles: allRoles },
      { href: '#', label: 'Reports', icon: FileText, roles: allRoles, disabled: true },
      { href: '/fda', label: 'Master Data', icon: Database, roles: allRoles },
      { href: '/compile', label: 'Compile', icon: FileStack, roles: allRoles },
      { href: '/update-log', label: 'Update Log', icon: History, roles: allRoles },
      { href: '/suggestion', label: 'Suggestion', icon: Lightbulb, roles: allRoles },
    ],
  },
  {
    title: 'HR',
    items: [
      { href: '/timesheet', label: 'Timesheet', icon: Clock, roles: allRoles },
      { href: '/users', label: 'Users', icon: Users, roles: ['developer'] },
    ],
  },
  {
    title: 'COMMUNICATION',
    items: [
      { href: '/chat', label: 'Team Chat', icon: MessageSquare, roles: allRoles },
      { href: '/schedule', label: 'Schedule Hub', icon: CalendarDays, roles: allRoles },
    ],
  },
];

export function AppLayout({ children, fullWidth = false, defaultCollapsed = false }: AppLayoutProps) {
  const { user, roles, isPrivileged, signOut, isLoading: authLoading, rolesLoaded } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);
  const { needsCompletion, isChecking, markCompleted } = useProfileCompletion();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();

  // Only treat as "no role" if auth is done AND roles have been loaded AND still empty AND we're online
  // This prevents showing "Access Restricted" while roles are still being fetched
  const hasNoRole = !authLoading && rolesLoaded && roles.length === 0 && isOnline;
  const offlineAllowedRoute = ['/scan', '/fda', '/auth'].includes(location.pathname);

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
    if (roles.includes('office_admin')) return 'Office Admin';
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

  // Show restricted access screen for users without any role.
  // BUT: when offline, allow opening offline-capable routes (scan/issues).
  if (hasNoRole && (isOnline || !offlineAllowedRoute)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 mx-auto mb-6">
            <ShieldX className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
          <p className="text-muted-foreground mb-6">
            Your account does not have an assigned role. Please contact a developer or administrator to get access to the system.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 text-left">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.user_metadata?.avatar_url} alt="Avatar" />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.user_metadata?.full_name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => signOut()} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // MOBILE LAYOUT
  if (isMobile) {
    return (
      <>
        <ProfileCompletionDialog open={needsCompletion && !isChecking} onComplete={markCompleted} />
        
        <div className="min-h-screen bg-background">
          {/* Mobile Header */}
          <MobileHeader />
          
          {/* Main Content with padding for header and bottom nav */}
          <main className="pt-14 pb-20 px-4">
            {children}
          </main>
          
          {/* Bottom Navigation */}
          <MobileBottomNav roles={roles as AppRole[]} allNavSections={navSections} />
        </div>
      </>
    );
  }

  // DESKTOP LAYOUT
  return (
    <>
      {/* Profile Completion Dialog */}
      <ProfileCompletionDialog open={needsCompletion && !isChecking} onComplete={markCompleted} />
      
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
            <span className="font-bold text-lg tracking-wide">MERIDIAN PORTAL</span>
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
          <Link to="/profile" className="flex items-center gap-3 mb-3 p-2 -m-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
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
            <UserCog className="h-4 w-4 text-white/60" />
          </Link>
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
        {/* Top Right Controls */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
          <AnnouncementBell />
        </div>
        
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
    </>
  );
}