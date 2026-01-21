import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Hash, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface ChatRoomListProps {
  rooms: ChatRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (room: ChatRoom) => void;
  onCreateRoom: () => void;
}

export function ChatRoomList({ rooms, selectedRoomId, onSelectRoom, onCreateRoom }: ChatRoomListProps) {
  return (
    <div className="flex flex-col h-full bg-muted/30 border-r">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Channels</h2>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateRoom}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Room List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              No channels yet
            </p>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-2',
                  selectedRoomId === room.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                <Hash className="h-4 w-4 shrink-0 opacity-70" />
                <span className="truncate font-medium text-sm">{room.name}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
