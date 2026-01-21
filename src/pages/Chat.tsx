import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

import { useChat } from '@/hooks/useChat';
import { ChatRoomList } from '@/components/chat/ChatRoomList';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatMessageInput } from '@/components/chat/ChatMessageInput';
import { CreateRoomDialog, AddMemberDialog, ViewMembersDialog } from '@/components/chat/ChatDialogs';

const Chat = () => {
  const { user, session, isLoading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const hasRole = roles.length > 0;

  const {
    rooms,
    selectedRoom,
    setSelectedRoom,
    messages,
    members,
    availableUsers,
    onlineMembers,
    isLoading,
    isLoadingUsers,
    isAdmin,
    fetchAllUsers,
    createRoom,
    sendMessage,
    addMember,
    removeMember,
    leaveRoom,
  } = useChat(user?.id);

  // Dialogs
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [viewMembersOpen, setViewMembersOpen] = useState(false);

  // Check auth
  useEffect(() => {
    if (!authLoading && !hasRole) {
      navigate('/');
    }
  }, [authLoading, hasRole, navigate]);

  // Fetch users when add member dialog opens
  useEffect(() => {
    if (addMemberOpen) {
      fetchAllUsers();
    }
  }, [addMemberOpen, fetchAllUsers]);

  const handleCreateRoom = async (name: string, description: string) => {
    try {
      await createRoom(name, description);
      setCreateRoomOpen(false);
    } catch (err: any) {
      toast.error('Failed to create channel: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage(content);
    } catch (err: any) {
      toast.error('Failed to send message: ' + err.message);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await addMember(userId);
    } catch (err: any) {
      toast.error('Failed to add member: ' + err.message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember(memberId);
    } catch (err: any) {
      toast.error('Failed to remove member: ' + err.message);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
    } catch (err: any) {
      toast.error('Failed to leave channel: ' + err.message);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout fullWidth>
      <div className="flex h-[calc(100vh-8rem)] bg-background rounded-xl border overflow-hidden">
        {/* Sidebar - Room List */}
        <div className="w-64 shrink-0">
          <ChatRoomList
            rooms={rooms}
            selectedRoomId={selectedRoom?.id || null}
            onSelectRoom={setSelectedRoom}
            onCreateRoom={() => setCreateRoomOpen(true)}
          />
        </div>

        {/* Main Chat Area */}
        {selectedRoom ? (
          <div className="flex-1 flex flex-col">
            <ChatHeader
              roomName={selectedRoom.name}
              roomDescription={selectedRoom.description}
              memberCount={members.length}
              onlineMembers={onlineMembers}
              isAdmin={isAdmin}
              onViewMembers={() => setViewMembersOpen(true)}
              onAddMember={() => setAddMemberOpen(true)}
              onLeaveRoom={handleLeaveRoom}
            />
            <ChatMessageList messages={messages} currentUserId={user?.id} />
            <ChatMessageInput onSend={handleSendMessage} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/20">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">Select a channel</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Choose a channel from the list or create a new one
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateRoomDialog
        open={createRoomOpen}
        onOpenChange={setCreateRoomOpen}
        onCreate={handleCreateRoom}
      />

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        availableUsers={availableUsers}
        isLoading={isLoadingUsers}
        onAddMember={handleAddMember}
      />

      <ViewMembersDialog
        open={viewMembersOpen}
        onOpenChange={setViewMembersOpen}
        members={members}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        onRemoveMember={handleRemoveMember}
      />
    </AppLayout>
  );
};

export default Chat;
