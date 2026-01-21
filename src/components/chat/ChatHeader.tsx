import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hash, Users, MoreVertical, UserPlus, LogOut, Settings } from 'lucide-react';

interface OnlineMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface ChatHeaderProps {
  roomName: string;
  roomDescription?: string | null;
  memberCount: number;
  onlineMembers: OnlineMember[];
  isAdmin: boolean;
  onViewMembers: () => void;
  onAddMember: () => void;
  onLeaveRoom: () => void;
}

function getInitials(name?: string | null) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function ChatHeader({
  roomName,
  roomDescription,
  memberCount,
  onlineMembers,
  isAdmin,
  onViewMembers,
  onAddMember,
  onLeaveRoom,
}: ChatHeaderProps) {
  return (
    <div className="px-4 py-3 border-b bg-background flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Hash className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold">{roomName}</h2>
          {roomDescription && (
            <p className="text-xs text-muted-foreground">{roomDescription}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Online members preview */}
        {onlineMembers.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="flex -space-x-2">
              {onlineMembers.slice(0, 3).map((member) => (
                <Avatar key={member.id} className="h-7 w-7 border-2 border-background">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {onlineMembers.length > 3 && (
              <span className="text-xs text-muted-foreground ml-1">
                +{onlineMembers.length - 3}
              </span>
            )}
          </div>
        )}

        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" />
          {memberCount}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onViewMembers}>
              <Users className="h-4 w-4 mr-2" />
              View Members
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={onAddMember}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLeaveRoom} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Leave Channel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
