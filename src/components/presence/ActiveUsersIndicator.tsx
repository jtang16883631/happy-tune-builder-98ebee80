import { usePresence, PresenceUser } from '@/hooks/usePresence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Users } from 'lucide-react';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function UserAvatar({
  user,
  showBorder = true,
  isCurrentUser = false,
}: {
  user: PresenceUser;
  showBorder?: boolean;
  isCurrentUser?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar
            className={`h-8 w-8 ${showBorder ? 'ring-2 ring-background' : ''} cursor-pointer transition-transform hover:scale-110`}
          >
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.fullName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
              {getInitials(user.fullName)}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-sm">
          <p className="font-medium">
            {user.fullName} {isCurrentUser && '(you)'}
          </p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ActiveUsersIndicator() {
  const { presentUsers, currentUserPresence, totalOnline } = usePresence();
  const MAX_VISIBLE = 3;

  // Show nothing if we haven't connected yet
  if (!currentUserPresence) {
    return null;
  }

  // All users including current user for display
  const allUsers = [currentUserPresence, ...presentUsers];
  const visibleUsers = allUsers.slice(0, MAX_VISIBLE);
  const overflowCount = allUsers.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center -space-x-2">
        {visibleUsers.map((user, idx) => (
          <UserAvatar 
            key={user.id} 
            user={user} 
            isCurrentUser={idx === 0}
          />
        ))}
        
        {overflowCount > 0 && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="h-8 w-8 rounded-full bg-muted ring-2 ring-background flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors">
                <span className="text-xs font-medium text-muted-foreground">
                  +{overflowCount}
                </span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-48">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {totalOnline} online
                </p>
                <div className="flex flex-col gap-1">
                  {allUsers.slice(MAX_VISIBLE).map((user) => (
                    <div key={user.id} className="flex items-center gap-2 text-sm">
                      <UserAvatar user={user} showBorder={false} />
                      <span className="truncate">{user.fullName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>
      
      {/* Live indicator dot */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
        <span className="font-medium">{totalOnline}</span>
      </div>
    </div>
  );
}
