import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTeamChat } from '@/hooks/useTeamChat';
import { useNavigate } from 'react-router-dom';

import { ChatRoomList } from '@/components/chat/ChatRoomList';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { CreateRoomDialog } from '@/components/chat/CreateRoomDialog';
import { AddMemberDialog } from '@/components/chat/AddMemberDialog';
import { MeetingsPanel } from '@/components/chat/MeetingsPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Hash, Loader2, MessageSquare, UserPlus, Users, Trash2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const Chat = () => {
  const navigate = useNavigate();
  const {
    userId,
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
    deleteRoom,
  } = useTeamChat();

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const isOwner = currentRoom?.owner_id === userId;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Chat requires authentication (RLS enforces it); avoid firing 403s by gating the UI.
  if (!userId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] p-6">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">Team Chat</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You need to be signed in to create rooms and send messages.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button onClick={() => navigate('/auth')} className="gap-2">
                <Users className="h-4 w-4" />
                Go to Login
              </Button>
            </div>
          </div>
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

                  {/* Meetings Panel */}
                  <MeetingsPanel
                    roomId={currentRoom?.id || null}
                    userId={userId}
                    userName={members.find((m) => m.user_id === userId)?.user_name || 'User'}
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowAddMember(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>

                  {/* Delete Room Button - Only for owner */}
                  {isOwner && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Chat Room</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{currentRoom.name}"? This will permanently delete all messages and remove all members. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteRoom(currentRoom.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Room
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {/* Messages */}
              <ChatMessageList messages={messages} currentUserId={userId ?? undefined} />

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
