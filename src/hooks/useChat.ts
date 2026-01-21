import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

interface OnlineMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function useChat(userId: string | undefined) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('chat_rooms').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // Fetch room data (messages + members)
  const fetchRoomData = useCallback(async (roomId: string) => {
    try {
      // Messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (messagesError) throw messagesError;

      const userIds = [...new Set((messagesData || []).map(m => m.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds.length > 0 ? userIds : ['none']);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      setMessages((messagesData || []).map(m => ({ ...m, profile: profileMap.get(m.user_id) })));

      // Members
      const { data: membersData, error: membersError } = await supabase.from('chat_room_members').select('*').eq('room_id', roomId);
      if (membersError) throw membersError;

      const memberUserIds = (membersData || []).map(m => m.user_id);
      const { data: memberProfiles } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', memberUserIds.length > 0 ? memberUserIds : ['none']);
      const memberProfileMap = new Map((memberProfiles || []).map(p => [p.id, p]));
      setMembers((membersData || []).map(m => ({ ...m, profile: memberProfileMap.get(m.user_id) })));
    } catch (err) {
      console.error('Error fetching room data:', err);
    }
  }, []);

  useEffect(() => { if (selectedRoom) fetchRoomData(selectedRoom.id); }, [selectedRoom, fetchRoomData]);

  // Realtime messages
  useEffect(() => {
    if (!selectedRoom) return;

    const channel = supabase.channel(`chat_${selectedRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${selectedRoom.id}`
      }, async (payload) => {
        const { data: profile } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('id', (payload.new as any).user_id).single();
        const newMsg = { ...(payload.new as ChatMessage), profile };
        setMessages(prev => [...prev, newMsg]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedRoom]);

  // Presence tracking
  useEffect(() => {
    if (!selectedRoom || !userId) return;

    const presenceChannel = supabase.channel(`presence_${selectedRoom.id}`, { config: { presence: { key: userId } } });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online: OnlineMember[] = [];
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p) => {
            if (p.user_id && p.user_id !== userId) {
              online.push({ id: p.user_id, full_name: p.full_name, avatar_url: p.avatar_url });
            }
          });
        });
        setOnlineMembers(online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const myMember = members.find(m => m.user_id === userId);
          await presenceChannel.track({
            user_id: userId,
            full_name: myMember?.profile?.full_name || null,
            avatar_url: myMember?.profile?.avatar_url || null,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(presenceChannel); };
  }, [selectedRoom, userId, members]);

  // Fetch all users
  const fetchAllUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name', { ascending: true });
      if (error) throw error;
      setAllUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  // Available users (not already members)
  const availableUsers = useMemo(() => {
    return allUsers.filter(u => !members.some(m => m.user_id === u.id));
  }, [allUsers, members]);

  // Create room
  const createRoom = useCallback(async (name: string, description: string) => {
    if (!userId) throw new Error('Not authenticated');
    const { data: room, error: roomError } = await supabase.from('chat_rooms').insert({ name, description: description || null, created_by: userId }).select().single();
    if (roomError) throw roomError;
    const { error: memberError } = await supabase.from('chat_room_members').insert({ room_id: room.id, user_id: userId, is_admin: true });
    if (memberError) throw memberError;
    toast.success('Channel created');
    await fetchRooms();
    setSelectedRoom(room);
  }, [userId, fetchRooms]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!userId || !selectedRoom) throw new Error('Cannot send message');
    const { error } = await supabase.from('chat_messages').insert({ room_id: selectedRoom.id, user_id: userId, content });
    if (error) throw error;
  }, [userId, selectedRoom]);

  // Add member
  const addMember = useCallback(async (profileId: string) => {
    if (!selectedRoom) return;
    const { error } = await supabase.from('chat_room_members').insert({ room_id: selectedRoom.id, user_id: profileId, is_admin: false });
    if (error) throw error;
    toast.success('Member added');
    await fetchRoomData(selectedRoom.id);
    await fetchAllUsers();
  }, [selectedRoom, fetchRoomData, fetchAllUsers]);

  // Remove member
  const removeMember = useCallback(async (memberId: string) => {
    if (!selectedRoom) return;
    const { error } = await supabase.from('chat_room_members').delete().eq('id', memberId);
    if (error) throw error;
    toast.success('Member removed');
    await fetchRoomData(selectedRoom.id);
  }, [selectedRoom, fetchRoomData]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!selectedRoom || !userId) return;
    const myMembership = members.find(m => m.user_id === userId);
    if (!myMembership) return;
    const { error } = await supabase.from('chat_room_members').delete().eq('id', myMembership.id);
    if (error) throw error;
    toast.success('Left the channel');
    setSelectedRoom(null);
    await fetchRooms();
  }, [selectedRoom, userId, members, fetchRooms]);

  const isAdmin = members.find(m => m.user_id === userId)?.is_admin || false;

  return {
    rooms,
    selectedRoom,
    setSelectedRoom,
    messages,
    members,
    allUsers,
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
  };
}
