import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  owner_id?: string;
  meta?: Json;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_avatar?: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string;
  user_name?: string;
  user_avatar?: string;
}

/**
 * Gets the current session user id.
 */
async function getSessionUserId(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.user?.id ?? null;
}

export function useTeamChat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const initDone = useRef(false);

  // Keep userId in sync with auth session
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    let active = true;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
    });

    (async () => {
      const uid = await getSessionUserId();
      if (!active) return;
      setUserId(uid);
      setIsLoading(false);
    })();

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Fetch rooms the user is a member of
  const fetchRooms = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: membershipData, error: memberError } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', userId);

      if (memberError) throw memberError;

      if (!membershipData || membershipData.length === 0) {
        setRooms([]);
        return;
      }

      const roomIds = membershipData.map(m => m.room_id);

      const { data: roomsData, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .order('name');

      if (roomsError) throw roomsError;

      setRooms(roomsData || []);
    } catch (error: unknown) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load chat rooms');
    }
  }, [userId]);

  // Fetch messages for current room
  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const formattedMessages: ChatMessage[] = (data || []).map((msg: Record<string, unknown>) => ({
        id: msg.id as string,
        room_id: msg.room_id as string,
        user_id: msg.user_id as string,
        content: msg.content as string,
        created_at: msg.created_at as string,
        updated_at: msg.updated_at as string,
        user_name: (msg.profiles as Record<string, unknown>)?.full_name as string || 'Guest',
        user_avatar: (msg.profiles as Record<string, unknown>)?.avatar_url as string | undefined,
      }));

      setMessages(formattedMessages);
    } catch (error: unknown) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    }
  }, []);

  // Fetch room members
  const fetchMembers = useCallback(async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_room_members')
        .select(`
          *,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq('room_id', roomId);

      if (error) throw error;

      const formattedMembers: RoomMember[] = (data || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        room_id: m.room_id as string,
        user_id: m.user_id as string,
        is_admin: (m.is_admin as boolean) || false,
        joined_at: m.joined_at as string,
        user_name: (m.profiles as Record<string, unknown>)?.full_name as string || 'Guest',
        user_avatar: (m.profiles as Record<string, unknown>)?.avatar_url as string | undefined,
      }));

      setMembers(formattedMembers);
    } catch (error: unknown) {
      console.error('Error fetching members:', error);
    }
  }, []);

  // Select a room
  const selectRoom = useCallback(async (room: ChatRoom) => {
    setCurrentRoom(room);
    await Promise.all([fetchMessages(room.id), fetchMembers(room.id)]);
  }, [fetchMessages, fetchMembers]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!userId || !currentRoom || !content.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          room_id: currentRoom.id,
          user_id: userId,
          content: content.trim(),
        });

      if (error) throw error;
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [userId, currentRoom]);

  // Create a new room via Edge Function (no direct insert)
  const createRoom = useCallback(async (name: string, description?: string) => {
    const uid = await getSessionUserId();
    setUserId(uid);

    if (!uid) {
      toast.error('Please log in to create a chat room.');
      return null;
    }

    try {
      console.log('Calling create-room edge function...');
      
      const { data, error } = await supabase.functions.invoke('create-room', {
        body: { 
          name, 
          meta: description ? { description } : {} 
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error(error.message || 'Failed to create room');
        return null;
      }

      if (!data?.room) {
        console.error('No room in response:', data);
        toast.error('Failed to create room - no data returned');
        return null;
      }

      console.log('Room created via edge function:', data.room);
      
      await fetchRooms();
      toast.success('Chat room created!');
      return data.room as ChatRoom;
    } catch (error: unknown) {
      console.error('Error creating room:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to create room';
      toast.error(errMsg);
      return null;
    }
  }, [fetchRooms]);

  // Add member to room
  const addMember = useCallback(async (roomId: string, targetUserId: string) => {
    try {
      const { error } = await supabase
        .from('chat_room_members')
        .insert({
          room_id: roomId,
          user_id: targetUserId,
          is_admin: false,
        });

      if (error) throw error;

      if (currentRoom?.id === roomId) {
        await fetchMembers(roomId);
      }
      toast.success('Member added!');
    } catch (error: unknown) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    }
  }, [currentRoom, fetchMembers]);

  // Delete a room (owner only)
  const deleteRoom = useCallback(async (roomId: string) => {
    try {
      // First delete all members
      await supabase
        .from('chat_room_members')
        .delete()
        .eq('room_id', roomId);

      // Then delete all messages
      await supabase
        .from('chat_messages')
        .delete()
        .eq('room_id', roomId);

      // Finally delete the room
      const { error } = await supabase
        .from('chat_rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;

      // Clear current room if it was deleted
      if (currentRoom?.id === roomId) {
        setCurrentRoom(null);
        setMessages([]);
        setMembers([]);
      }

      await fetchRooms();
      toast.success('Room deleted!');
    } catch (error: unknown) {
      console.error('Error deleting room:', error);
      toast.error('Failed to delete room');
    }
  }, [currentRoom, fetchRooms]);

  // Reload rooms when userId becomes available
  useEffect(() => {
    if (userId) {
      fetchRooms();
    }
  }, [userId, fetchRooms]);

  // Real-time subscription for messages
  useEffect(() => {
    if (!currentRoom) return;

    const channel = supabase
      .channel(`chat_room_${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('chat_messages')
            .select(`
              *,
              profiles:user_id (
                full_name,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .maybeSingle();

          if (data) {
            const profiles = (data as { profiles?: { full_name?: string; avatar_url?: string } }).profiles;
            const newMessage: ChatMessage = {
              id: data.id,
              room_id: data.room_id,
              user_id: data.user_id,
              content: data.content,
              created_at: data.created_at,
              updated_at: data.updated_at,
              user_name: profiles?.full_name || 'Guest',
              user_avatar: profiles?.avatar_url,
            };

            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom]);

  return {
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
    fetchRooms,
    setCurrentRoom,
  };
}
