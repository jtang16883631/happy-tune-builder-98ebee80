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

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
];

function getColorForUser(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function UserAvatar({ user, showBorder = true }: { user: PresenceUser; showBorder?: boolean }) {
  const color = getColorForUser(user.id);
  
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
            <AvatarFallback className={`${color} text-white text-xs font-medium`}>
              {getInitials(user.fullName)}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-sm">
          <p className="font-medium">{user.fullName}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ActiveUsersIndicator() {
  const { presentUsers } = usePresence();
  const MAX_VISIBLE = 3;

  if (presentUsers.length === 0) {
    return null;
  }

  const visibleUsers = presentUsers.slice(0, MAX_VISIBLE);
  const overflowCount = presentUsers.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center -space-x-2">
        {visibleUsers.map((user) => (
          <UserAvatar key={user.id} user={user} />
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
                  {presentUsers.length} users online
                </p>
                <div className="flex flex-col gap-1">
                  {presentUsers.slice(MAX_VISIBLE).map((user) => (
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
      
      <div className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      </div>
    </div>
  );
}
