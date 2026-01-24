import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTeamChat } from '@/hooks/useTeamChat';
import { useAuth } from '@/contexts/AuthContext';
import { ChatRoomList } from '@/components/chat/ChatRoomList';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { CreateRoomDialog } from '@/components/chat/CreateRoomDialog';
import { AddMemberDialog } from '@/components/chat/AddMemberDialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Hash, Loader2, MessageSquare, UserPlus, Users } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const Chat = () => {
  const { user } = useAuth();
  const {
    rooms,
    currentRoom,
    messages,
    members,
    isLoading,
    isSending,
    selectRoom,
    sendMessage,
    createRoom,
    addMember,
  } = useTeamChat();

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border bg-background">
        {/* Room List Sidebar */}
        <div className="w-64 border-r shrink-0 hidden md:block">
          <ChatRoomList
            rooms={rooms}
            currentRoom={currentRoom}
            onSelectRoom={selectRoom}
            onCreateRoom={() => setShowCreateRoom(true)}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentRoom ? (
            <>
              {/* Room Header */}
              <div className="border-b px-4 py-3 flex items-center justify-between bg-background shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{currentRoom.name}</h2>
                    {currentRoom.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {currentRoom.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Member Avatars */}
                  <TooltipProvider>
                    <div className="flex -space-x-2">
                      {members.slice(0, 4).map((member) => (
                        <Tooltip key={member.id}>
                          <TooltipTrigger>
                            <Avatar className="h-7 w-7 border-2 border-background">
                              <AvatarImage src={member.user_avatar || undefined} />
                              <AvatarFallback className="text-xs">
                                {member.user_name?.slice(0, 2).toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>{member.user_name}</TooltipContent>
                        </Tooltip>
                      ))}
                      {members.length > 4 && (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
                          +{members.length - 4}
                        </div>
                      )}
                    </div>
                  </TooltipProvider>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowAddMember(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ChatMessageList messages={messages} currentUserId={user?.id} />

              {/* Input */}
              <ChatInput onSend={sendMessage} isSending={isSending} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Team Chat</h3>
              <p className="text-sm text-center mb-4">
                {rooms.length === 0
                  ? 'Create a chat room to start collaborating with your team.'
                  : 'Select a chat room to start messaging.'}
              </p>
              
              {/* Mobile Room List */}
              <div className="md:hidden w-full max-w-sm">
                {rooms.length > 0 ? (
                  <div className="space-y-2">
                    {rooms.map((room) => (
                      <Button
                        key={room.id}
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => selectRoom(room)}
                      >
                        <Hash className="h-4 w-4" />
                        {room.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              <Button onClick={() => setShowCreateRoom(true)} className="gap-2">
                <Users className="h-4 w-4" />
                Create Chat Room
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateRoomDialog
        open={showCreateRoom}
        onOpenChange={setShowCreateRoom}
        onCreate={createRoom}
      />

      {currentRoom && (
        <AddMemberDialog
          open={showAddMember}
          onOpenChange={setShowAddMember}
          roomId={currentRoom.id}
          currentMembers={members}
          onAddMember={addMember}
        />
      )}
    </AppLayout>
  );
};

export default Chat;
