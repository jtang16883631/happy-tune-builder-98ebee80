import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hash, Plus, Users } from 'lucide-react';
import { ChatRoom } from '@/hooks/useTeamChat';
import { cn } from '@/lib/utils';

interface ChatRoomListProps {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onSelectRoom: (room: ChatRoom) => void;
  onCreateRoom: () => void;
}

export function ChatRoomList({ rooms, currentRoom, onSelectRoom, onCreateRoom }: ChatRoomListProps) {
  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Chat Rooms</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCreateRoom}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {rooms.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No chat rooms yet</p>
              <Button variant="link" size="sm" onClick={onCreateRoom}>
                Create your first room
              </Button>
            </div>
          ) : (
            rooms.map((room) => (
              <Button
                key={room.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-2 h-auto py-2 px-3",
                  currentRoom?.id === room.id && "bg-accent"
                )}
                onClick={() => onSelectRoom(room)}
              >
                <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-left min-w-0">
                  <div className="font-medium truncate">{room.name}</div>
                  {room.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {room.description}
                    </div>
                  )}
                </div>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
