import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

function createAuthedDb(accessToken: string): SupabaseClient<Database> {
  // Important: use the official `accessToken` callback.
  // This ensures the client uses the user's JWT for BOTH database + realtime,
  // avoiding `auth.uid()` being null (which triggers RLS failures).
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => accessToken,
    // When accessToken is provided, the auth namespace can't be used (that's fine here).
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function useChat(accessToken: string | undefined, userId: string | undefined) {
  const db = useMemo(() => {
    if (!accessToken) return null;
    return createAuthedDb(accessToken);
  }, [accessToken]);

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
    if (!db) { setRooms([]); setIsLoading(false); return; }
    try {
      const { data, error } = await db.from('chat_rooms').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // Fetch room data (messages + members)
  const fetchRoomData = useCallback(async (roomId: string) => {
    if (!db) return;
    try {
      // Messages
      const { data: messagesData, error: messagesError } = await db
        .from('chat_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (messagesError) throw messagesError;

      const userIds = [...new Set((messagesData || []).map(m => m.user_id))];
      const { data: profiles } = await db.from('profiles').select('id, full_name, avatar_url').in('id', userIds.length > 0 ? userIds : ['none']);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      setMessages((messagesData || []).map(m => ({ ...m, profile: profileMap.get(m.user_id) })));

      // Members
      const { data: membersData, error: membersError } = await db.from('chat_room_members').select('*').eq('room_id', roomId);
      if (membersError) throw membersError;

      const memberUserIds = (membersData || []).map(m => m.user_id);
      const { data: memberProfiles } = await db.from('profiles').select('id, full_name, email, avatar_url').in('id', memberUserIds.length > 0 ? memberUserIds : ['none']);
      const memberProfileMap = new Map((memberProfiles || []).map(p => [p.id, p]));
      setMembers((membersData || []).map(m => ({ ...m, profile: memberProfileMap.get(m.user_id) })));
    } catch (err) {
      console.error('Error fetching room data:', err);
    }
  }, [db]);

  useEffect(() => { if (selectedRoom) fetchRoomData(selectedRoom.id); }, [selectedRoom, fetchRoomData]);

  // Realtime messages
  useEffect(() => {
    if (!selectedRoom || !db) return;

    const channel = db.channel(`chat_${selectedRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${selectedRoom.id}`
      }, async (payload) => {
        const { data: profile } = await db.from('profiles').select('id, full_name, avatar_url').eq('id', (payload.new as any).user_id).single();
        const newMsg = { ...(payload.new as ChatMessage), profile };
        setMessages(prev => [...prev, newMsg]);
      })
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [selectedRoom, db]);

  // Presence tracking
  useEffect(() => {
    if (!selectedRoom || !db || !userId) return;

    const presenceChannel = db.channel(`presence_${selectedRoom.id}`, { config: { presence: { key: userId } } });

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

    return () => { db.removeChannel(presenceChannel); };
  }, [selectedRoom, db, userId, members]);

  // Fetch all users
  const fetchAllUsers = useCallback(async () => {
    if (!db) return;
    setIsLoadingUsers(true);
    try {
      const { data, error } = await db.from('profiles').select('id, full_name, email, avatar_url').order('full_name', { ascending: true });
      if (error) throw error;
      setAllUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [db]);

  // Available users (not already members)
  const availableUsers = useMemo(() => {
    return allUsers.filter(u => !members.some(m => m.user_id === u.id));
  }, [allUsers, members]);

  // Create room
  const createRoom = useCallback(async (name: string, description: string) => {
    if (!db || !userId) throw new Error('Not authenticated');
    const { data: room, error: roomError } = await db.from('chat_rooms').insert({ name, description: description || null, created_by: userId }).select().single();
    if (roomError) throw roomError;
    const { error: memberError } = await db.from('chat_room_members').insert({ room_id: room.id, user_id: userId, is_admin: true });
    if (memberError) throw memberError;
    toast.success('Channel created');
    await fetchRooms();
    setSelectedRoom(room);
  }, [db, userId, fetchRooms]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!db || !userId || !selectedRoom) throw new Error('Cannot send message');
    const { error } = await db.from('chat_messages').insert({ room_id: selectedRoom.id, user_id: userId, content });
    if (error) throw error;
  }, [db, userId, selectedRoom]);

  // Add member
  const addMember = useCallback(async (profileId: string) => {
    if (!db || !selectedRoom) return;
    const { error } = await db.from('chat_room_members').insert({ room_id: selectedRoom.id, user_id: profileId, is_admin: false });
    if (error) throw error;
    toast.success('Member added');
    await fetchRoomData(selectedRoom.id);
    await fetchAllUsers();
  }, [db, selectedRoom, fetchRoomData, fetchAllUsers]);

  // Remove member
  const removeMember = useCallback(async (memberId: string) => {
    if (!db || !selectedRoom) return;
    const { error } = await db.from('chat_room_members').delete().eq('id', memberId);
    if (error) throw error;
    toast.success('Member removed');
    await fetchRoomData(selectedRoom.id);
  }, [db, selectedRoom, fetchRoomData]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!db || !selectedRoom || !userId) return;
    const myMembership = members.find(m => m.user_id === userId);
    if (!myMembership) return;
    const { error } = await db.from('chat_room_members').delete().eq('id', myMembership.id);
    if (error) throw error;
    toast.success('Left the channel');
    setSelectedRoom(null);
    await fetchRooms();
  }, [db, selectedRoom, userId, members, fetchRooms]);

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
