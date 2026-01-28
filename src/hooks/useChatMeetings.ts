import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatMeeting {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  creator_name?: string;
}

export function useChatMeetings(roomId: string | null) {
  const [meetings, setMeetings] = useState<ChatMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMeetings = useCallback(async () => {
    if (!roomId) {
      setMeetings([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_meetings')
        .select(`
          *,
          profiles:created_by (
            full_name
          )
        `)
        .eq('room_id', roomId)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      const formattedMeetings: ChatMeeting[] = (data || []).map((meeting: Record<string, unknown>) => ({
        id: meeting.id as string,
        room_id: meeting.room_id as string,
        title: meeting.title as string,
        description: meeting.description as string | null,
        scheduled_at: meeting.scheduled_at as string,
        duration_minutes: meeting.duration_minutes as number,
        created_by: meeting.created_by as string,
        created_at: meeting.created_at as string,
        updated_at: meeting.updated_at as string,
        status: meeting.status as ChatMeeting['status'],
        creator_name: (meeting.profiles as Record<string, unknown>)?.full_name as string || 'Unknown',
      }));

      setMeetings(formattedMeetings);
    } catch (error) {
      console.error('Error fetching meetings:', error);
      toast.error('Failed to load meetings');
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const scheduleMeeting = useCallback(async (
    title: string,
    scheduledAt: Date,
    durationMinutes: number,
    description?: string
  ) => {
    if (!roomId) return null;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    if (!userId) {
      toast.error('You must be logged in to schedule a meeting');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('chat_meetings')
        .insert({
          room_id: roomId,
          title,
          description: description || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: durationMinutes,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      await fetchMeetings();
      toast.success('Meeting scheduled!');
      return data;
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      toast.error('Failed to schedule meeting');
      return null;
    }
  }, [roomId, fetchMeetings]);

  const updateMeetingStatus = useCallback(async (meetingId: string, status: ChatMeeting['status']) => {
    try {
      const { error } = await supabase
        .from('chat_meetings')
        .update({ status })
        .eq('id', meetingId);

      if (error) throw error;

      await fetchMeetings();
      toast.success(`Meeting ${status === 'in_progress' ? 'started' : status}!`);
    } catch (error) {
      console.error('Error updating meeting:', error);
      toast.error('Failed to update meeting');
    }
  }, [fetchMeetings]);

  const deleteMeeting = useCallback(async (meetingId: string) => {
    try {
      const { error } = await supabase
        .from('chat_meetings')
        .delete()
        .eq('id', meetingId);

      if (error) throw error;

      await fetchMeetings();
      toast.success('Meeting deleted!');
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error('Failed to delete meeting');
    }
  }, [fetchMeetings]);

  // Fetch meetings when room changes
  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Real-time subscription for meetings
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`chat_meetings_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_meetings',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchMeetings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchMeetings]);

  return {
    meetings,
    isLoading,
    scheduleMeeting,
    updateMeetingStatus,
    deleteMeeting,
    fetchMeetings,
  };
}
