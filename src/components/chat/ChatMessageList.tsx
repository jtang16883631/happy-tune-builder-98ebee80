import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string | undefined;
}

function getInitials(name?: string | null) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatMessageTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'HH:mm')}`;
  }
  return format(date, 'MMM d, HH:mm');
}

export function ChatMessageList({ messages, currentUserId }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="py-4 space-y-4">
        {messages.map((msg) => {
          const isOwn = msg.user_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={cn('flex gap-3', isOwn && 'flex-row-reverse')}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={msg.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(msg.profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[70%]', isOwn && 'text-right')}>
                <div className={cn('flex items-center gap-2 mb-1', isOwn && 'justify-end')}>
                  <span className="text-xs font-medium text-foreground">
                    {isOwn ? 'You' : (msg.profile?.full_name || 'Unknown')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
                <div
                  className={cn(
                    'inline-block px-3 py-2 rounded-2xl text-sm',
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
