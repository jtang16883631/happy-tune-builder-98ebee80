import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  user_name?: string;
  user_avatar?: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string;
  // Joined from profiles
  user_name?: string;
  user_avatar?: string;
}

export function useTeamChat() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Fetch all rooms the user is a member of
  const fetchRooms = useCallback(async () => {
    if (!user) return;

    try {
      // Get rooms where user is a member
      const { data: membershipData, error: memberError } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', user.id);

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
    } catch (error: any) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load chat rooms');
    }
  }, [user]);

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

      const formattedMessages: ChatMessage[] = (data || []).map((msg: any) => ({
        id: msg.id,
        room_id: msg.room_id,
        user_id: msg.user_id,
        content: msg.content,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        user_name: msg.profiles?.full_name || 'Unknown',
        user_avatar: msg.profiles?.avatar_url,
      }));

      setMessages(formattedMessages);
    } catch (error: any) {
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

      const formattedMembers: RoomMember[] = (data || []).map((m: any) => ({
        id: m.id,
        room_id: m.room_id,
        user_id: m.user_id,
        is_admin: m.is_admin || false,
        joined_at: m.joined_at,
        user_name: m.profiles?.full_name || 'Unknown',
        user_avatar: m.profiles?.avatar_url,
      }));

      setMembers(formattedMembers);
    } catch (error: any) {
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
    if (!user || !currentRoom || !content.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          room_id: currentRoom.id,
          user_id: user.id,
          content: content.trim(),
        });

      if (error) throw error;
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [user, currentRoom]);

  // Create a new room
  const createRoom = useCallback(async (name: string, description?: string) => {
    if (!user) return null;

    try {
      const { data: room, error: roomError } = await supabase
        .from('chat_rooms')
        .insert({
          name,
          description,
          created_by: user.id,
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add creator as admin member
      const { error: memberError } = await supabase
        .from('chat_room_members')
        .insert({
          room_id: room.id,
          user_id: user.id,
          is_admin: true,
        });

      if (memberError) throw memberError;

      await fetchRooms();
      toast.success('Chat room created!');
      return room;
    } catch (error: any) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room');
      return null;
    }
  }, [user, fetchRooms]);

  // Add member to room
  const addMember = useCallback(async (roomId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('chat_room_members')
        .insert({
          room_id: roomId,
          user_id: userId,
          is_admin: false,
        });

      if (error) throw error;

      if (currentRoom?.id === roomId) {
        await fetchMembers(roomId);
      }
      toast.success('Member added!');
    } catch (error: any) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    }
  }, [currentRoom, fetchMembers]);

  // Initial load
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadRooms = async () => {
      setIsLoading(true);
      await fetchRooms();
      setIsLoading(false);
    };

    loadRooms();
  }, [user, fetchRooms]);

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
          // Fetch the new message with profile data
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
            .single();

          if (data) {
            const newMessage: ChatMessage = {
              id: data.id,
              room_id: data.room_id,
              user_id: data.user_id,
              content: data.content,
              created_at: data.created_at,
              updated_at: data.updated_at,
              user_name: (data as any).profiles?.full_name || 'Unknown',
              user_avatar: (data as any).profiles?.avatar_url,
            };

            setMessages(prev => {
              // Avoid duplicates
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
    fetchRooms,
    setCurrentRoom,
  };
}
