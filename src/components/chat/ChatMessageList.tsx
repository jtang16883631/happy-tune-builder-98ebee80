import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatMessage } from '@/hooks/useTeamChat';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { FileText, Download } from 'lucide-react';
import type { Attachment } from './ChatInput';

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string | undefined;
}

function formatMessageDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'h:mm a');
  } else if (isYesterday(date)) {
    return 'Yesterday ' + format(date, 'h:mm a');
  }
  return format(date, 'MMM d, h:mm a');
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isImage(type: string) {
  return type.startsWith('image/');
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreview({ attachment, isOwn }: { attachment: Attachment; isOwn: boolean }) {
  if (isImage(attachment.type)) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-xs rounded-lg overflow-hidden mt-2"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-w-full max-h-60 object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 mt-2 px-3 py-2 rounded-lg transition-colors",
        isOwn 
          ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" 
          : "bg-background hover:bg-accent"
      )}
    >
      <FileText className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{attachment.name}</p>
        <p className={cn("text-xs", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

export function ChatMessageList({ messages, currentUserId }: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
      <div className="space-y-4">
        {messages.map((message, index) => {
          const isOwn = message.user_id === currentUserId;
          const showAvatar = index === 0 || messages[index - 1].user_id !== message.user_id;
          const attachments = (message.attachments || []) as Attachment[];
          
          return (
            <div
              key={message.id}
              ref={index === messages.length - 1 ? lastMessageRef : undefined}
              className={cn(
                "flex gap-3",
                isOwn && "flex-row-reverse"
              )}
            >
              {showAvatar ? (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={message.user_avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(message.user_name || 'U')}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-8 shrink-0" />
              )}
              
              <div className={cn("max-w-[70%] min-w-0", isOwn && "items-end")}>
                {showAvatar && (
                  <div className={cn(
                    "flex items-center gap-2 mb-1",
                    isOwn && "flex-row-reverse"
                  )}>
                    <span className="text-sm font-medium">{message.user_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMessageDate(message.created_at)}
                    </span>
                  </div>
                )}
                
                {message.content && (
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 break-words",
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.content}
                  </div>
                )}

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className={cn("space-y-1", !message.content && "mt-0")}>
                    {attachments.map((attachment, i) => (
                      <AttachmentPreview key={i} attachment={attachment} isOwn={isOwn} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
