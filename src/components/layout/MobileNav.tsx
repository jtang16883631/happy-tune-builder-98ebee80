import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Radio, 
  CalendarDays,
  MoreHorizontal
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';

type AppRole = 'auditor' | 'developer' | 'coordinator' | 'owner' | 'office_admin';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const primaryNavItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['auditor', 'developer', 'coordinator', 'owner', 'office_admin'] },
  { href: '/scan', label: 'Projects', icon: ClipboardList, roles: ['auditor', 'developer', 'coordinator', 'owner', 'office_admin'] },
  { href: '/live-tracker', label: 'Tracker', icon: Radio, roles: ['auditor', 'developer', 'coordinator', 'owner', 'office_admin'] },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays, roles: ['auditor', 'developer', 'coordinator', 'owner', 'office_admin'] },
];

interface MobileNavProps {
  roles: AppRole[];
  allNavSections: {
    title: string;
    items: {
      href: string;
      label: string;
      icon: React.ElementType;
      roles: AppRole[];
      disabled?: boolean;
    }[];
  }[];
}

export function MobileBottomNav({ roles, allNavSections }: MobileNavProps) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { unreadCount } = useUnreadMessages();

  const visibleItems = primaryNavItems.filter(item =>
    item.roles.some(role => roles.includes(role))
  );

  // Get all other nav items for "More" menu
  const moreItems = allNavSections
    .flatMap(section => section.items)
    .filter(item => 
      !primaryNavItems.some(primary => primary.href === item.href) &&
      item.roles.some(role => roles.includes(role)) &&
      !item.disabled
    );

  // Check if any "More" item has unread messages (Team Chat)
  const hasUnreadInMore = moreItems.some(item => item.href === '/chat') && unreadCount > 0;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {visibleItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5 mb-1', isActive && 'text-primary')} />
              <span className="text-[10px] font-medium truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}

        {/* More menu */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors relative',
                moreOpen ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <MoreHorizontal className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">More</span>
              {hasUnreadInMore && (
                <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full" />
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-xl">
            <SheetHeader className="mb-4">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                const showBadge = item.href === '/chat' && unreadCount > 0;
                
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center justify-center p-4 rounded-xl transition-colors relative',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/50 text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="h-6 w-6 mb-2" />
                    <span className="text-xs font-medium text-center">{item.label}</span>
                    {showBadge && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-2 right-2 h-5 min-w-5 px-1.5 text-xs font-bold"
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
