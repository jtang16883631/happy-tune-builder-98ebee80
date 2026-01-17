import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Users, 
  Settings, 
  Loader2,
  UserPlus,
  LogOut,
  MoreVertical,
  Hash,
  Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface ChatMember {
  id: string;
  room_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string;
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const Chat = () => {
  const { user, isLoading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const hasRole = roles.length > 0;
  
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  
  // Dialogs
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check auth
  useEffect(() => {
    if (!authLoading && !hasRole) {
      navigate('/');
    }
  }, [authLoading, hasRole, navigate]);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setRooms([]);
        return;
      }

      const { data, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Fetch messages and members when room selected
  const fetchRoomData = useCallback(async (roomId: string) => {
    try {
      // Fetch messages with profile info
      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      
      if (messagesError) throw messagesError;

      // Fetch profiles for messages
      const userIds = [...new Set((messagesData || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const messagesWithProfiles = (messagesData || []).map(m => ({
        ...m,
        profile: profileMap.get(m.user_id)
      }));
      
      setMessages(messagesWithProfiles);

      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('chat_room_members')
        .select('*')
        .eq('room_id', roomId);
      
      if (membersError) throw membersError;

      // Fetch profiles for members
      const memberUserIds = (membersData || []).map(m => m.user_id);
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', memberUserIds);
      
      const memberProfileMap = new Map((memberProfiles || []).map(p => [p.id, p]));
      const membersWithProfiles = (membersData || []).map(m => ({
        ...m,
        profile: memberProfileMap.get(m.user_id)
      }));
      
      setMembers(membersWithProfiles);
    } catch (err) {
      console.error('Error fetching room data:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      fetchRoomData(selectedRoom.id);
    }
  }, [selectedRoom, fetchRoomData]);

  // Real-time subscription for messages
  useEffect(() => {
    if (!selectedRoom) return;

    const channel = supabase
      .channel(`chat_${selectedRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${selectedRoom.id}`
        },
        async (payload) => {
          // Fetch profile for new message
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', payload.new.user_id)
            .single();
          
          const newMsg = {
            ...payload.new as ChatMessage,
            profile
          };
          
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create room
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const authedUserId = sessionData.session?.user?.id;

    if (!authedUserId) {
      toast.error('请先登录后再创建聊天室');
      navigate('/auth');
      return;
    }

    try {
      const { data: room, error: roomError } = await supabase
        .from('chat_rooms')
        .insert({
          name: newRoomName.trim(),
          description: newRoomDesc.trim() || null,
          created_by: authedUserId,
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add creator as admin member
      const { error: memberError } = await supabase
        .from('chat_room_members')
        .insert({
          room_id: room.id,
          user_id: authedUserId,
          is_admin: true,
        });

      if (memberError) throw memberError;

      toast.success('Chat room created');
      setCreateRoomOpen(false);
      setNewRoomName('');
      setNewRoomDesc('');
      fetchRooms();
      setSelectedRoom(room);
    } catch (err: any) {
      // Most common cause: user is not actually authenticated yet
      toast.error('Failed to create room: ' + (err?.message || 'Unknown error'));
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !user?.id) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          room_id: selectedRoom.id,
          user_id: user.id,
          content: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');
    } catch (err: any) {
      toast.error('Failed to send message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  // Fetch all registered users when add member dialog opens
  const fetchAllUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  // Fetch users when dialog opens
  useEffect(() => {
    if (addMemberOpen) {
      fetchAllUsers();
      setSearchQuery('');
    }
  }, [addMemberOpen, fetchAllUsers]);

  // Filter users: exclude existing members and apply search
  const availableUsers = allUsers.filter(u => {
    const isMember = members.some(m => m.user_id === u.id);
    if (isMember) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
    );
  });

  // Add member
  const handleAddMember = async (profileId: string) => {
    if (!selectedRoom) return;

    try {
      const { error } = await supabase
        .from('chat_room_members')
        .insert({
          room_id: selectedRoom.id,
          user_id: profileId,
          is_admin: false
        });

      if (error) throw error;
      
      toast.success('Member added');
      fetchRoomData(selectedRoom.id);
      fetchAllUsers(); // Refresh the user list
    } catch (err: any) {
      toast.error('Failed to add member: ' + err.message);
    }
  };

  // Remove member
  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('chat_room_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      
      toast.success('Member removed');
      if (selectedRoom) {
        fetchRoomData(selectedRoom.id);
      }
    } catch (err: any) {
      toast.error('Failed to remove member: ' + err.message);
    }
  };

  // Leave room
  const handleLeaveRoom = async () => {
    if (!selectedRoom || !user?.id) return;

    const myMembership = members.find(m => m.user_id === user.id);
    if (!myMembership) return;

    try {
      const { error } = await supabase
        .from('chat_room_members')
        .delete()
        .eq('id', myMembership.id);

      if (error) throw error;
      
      toast.success('Left the room');
      setSelectedRoom(null);
      fetchRooms();
    } catch (err: any) {
      toast.error('Failed to leave room: ' + err.message);
    }
  };

  const isAdmin = members.find(m => m.user_id === user?.id)?.is_admin || false;

  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        {/* Rooms List */}
        <Card className="w-72 shrink-0 flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chat Rooms
              </CardTitle>
              <Button size="sm" onClick={() => setCreateRoomOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {rooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">
                    No chat rooms yet
                  </p>
                ) : (
                  rooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedRoom?.id === room.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 shrink-0" />
                        <span className="font-medium truncate">{room.name}</span>
                      </div>
                      {room.description && (
                        <p className={`text-xs mt-1 truncate ${
                          selectedRoom?.id === room.id 
                            ? 'text-primary-foreground/70' 
                            : 'text-muted-foreground'
                        }`}>
                          {room.description}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Area */}
        {selectedRoom ? (
          <Card className="flex-1 flex flex-col">
            {/* Header */}
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    {selectedRoom.name}
                  </CardTitle>
                  {selectedRoom.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedRoom.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    {members.length}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setManageMembersOpen(true)}>
                        <Users className="h-4 w-4 mr-2" />
                        View Members
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => setAddMemberOpen(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={handleLeaveRoom}
                        className="text-destructive"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Leave Room
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>

            {/* Messages */}
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full p-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.user_id === user?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={msg.profile?.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(msg.profile?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`max-w-[70%] ${isOwn ? 'text-right' : ''}`}>
                            <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'justify-end' : ''}`}>
                              <span className="text-xs font-medium">
                                {msg.profile?.full_name || 'Unknown'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.created_at), 'HH:mm')}
                              </span>
                            </div>
                            <div
                              className={`inline-block px-3 py-2 rounded-lg ${
                                isOwn 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </CardContent>

            {/* Input */}
            <div className="p-4 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isSending}
                  className="flex-1"
                />
                <Button type="submit" disabled={isSending || !newMessage.trim()}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg">Select a chat room</h3>
              <p className="text-muted-foreground mt-1">
                Choose a room from the list or create a new one
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Create Room Dialog */}
      <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Chat Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Room Name</label>
              <Input
                placeholder="e.g., General, Project Updates"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="What's this room for?"
                value={newRoomDesc}
                onChange={(e) => setNewRoomDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoomOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRoom} disabled={!newRoomName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            
            {isLoadingUsers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableUsers.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-2 pr-4">
                  {availableUsers.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{profile.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleAddMember(profile.id)}>
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {searchQuery ? 'No users found' : 'All users are already members'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room Members ({members.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto py-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {member.profile?.full_name || 'Unknown'}
                      </p>
                      {member.is_admin && (
                        <Badge variant="secondary" className="text-xs">Admin</Badge>
                      )}
                      {member.user_id === user?.id && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                  </div>
                </div>
                {isAdmin && member.user_id !== user?.id && (
                  <Button 
                    size="icon" 
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Chat;
