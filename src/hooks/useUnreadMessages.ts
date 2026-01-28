import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RoomUnreadInfo {
  roomId: string;
  unreadCount: number;
}

export function useUnreadMessages() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [roomUnreads, setRoomUnreads] = useState<RoomUnreadInfo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const initDone = useRef(false);

  // Get auth state
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    let active = true;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
    });

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setUserId(sessionData?.session?.user?.id ?? null);
    })();

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Fetch unread message counts
  const fetchUnreadCounts = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      setRoomUnreads([]);
      return;
    }

    try {
      // Get user's room memberships with last_read_at
      const { data: memberships, error: memberError } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', userId);

      if (memberError) throw memberError;
      if (!memberships || memberships.length === 0) {
        setUnreadCount(0);
        setRoomUnreads([]);
        return;
      }

      // For each room, count messages newer than last_read_at
      const unreadPromises = memberships.map(async (membership) => {
        const lastReadAt = membership.last_read_at || new Date(0).toISOString();
        
        const { count, error } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', membership.room_id)
          .gt('created_at', lastReadAt)
          .neq('user_id', userId); // Don't count own messages

        if (error) {
          console.error('Error counting messages:', error);
          return { roomId: membership.room_id, unreadCount: 0 };
        }

        return { roomId: membership.room_id, unreadCount: count || 0 };
      });

      const results = await Promise.all(unreadPromises);
      setRoomUnreads(results);
      setUnreadCount(results.reduce((sum, r) => sum + r.unreadCount, 0));
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  }, [userId]);

  // Mark room as read
  const markRoomAsRead = useCallback(async (roomId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('chat_room_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', userId);

      if (error) throw error;

      // Refresh counts
      await fetchUnreadCounts();
    } catch (error) {
      console.error('Error marking room as read:', error);
    }
  }, [userId, fetchUnreadCounts]);

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!userId) return;

    fetchUnreadCounts();

    // Subscribe to new messages across all rooms
    const channel = supabase
      .channel('unread_messages_tracker')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        () => {
          // Refresh counts when any new message arrives
          fetchUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchUnreadCounts]);

  return {
    unreadCount,
    roomUnreads,
    markRoomAsRead,
    refreshCounts: fetchUnreadCounts,
  };
}
