import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, parseISO, isWithinInterval, eachDayOfInterval } from 'date-fns';

export type ScheduleEventType = 'work' | 'travel' | 'off' | 'note';

export interface ScheduleEvent {
  id: string;
  job_date: string;
  end_date: string | null;
  event_type: ScheduleEventType;
  event_title: string | null;
  invoice_number: string | null;
  start_time: string | null;
  arrival_note: string | null;
  client_name: string;
  client_id: string | null;
  address: string | null;
  phone: string | null;
  previous_inventory_value: string | null;
  onsite_contact: string | null;
  corporate_contact: string | null;
  email_data_to: string | null;
  final_invoice_to: string | null;
  notes: string | null;
  special_notes: string | null;
  team_members: string[] | null;
  team_count: number | null;
  is_travel_day: boolean | null;
  travel_info: string | null;
  hotel_info: string | null;
  location_from: string | null;
  location_to: string | null;
  exact_count_required: boolean | null;
  partial_inventory: boolean | null;
  client_onsite: boolean | null;
  status: string | null;
  tracker_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  color: string | null;
  is_active: boolean | null;
}

// Fetch events for a date range
export function useScheduleEvents(startDate: Date, endDate: Date) {
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['schedule-events', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .or(`job_date.gte.${startStr},end_date.gte.${startStr}`)
        .or(`job_date.lte.${endStr},end_date.lte.${endStr}`)
        .order('job_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as ScheduleEvent[];
    },
  });
}

// Fetch all events (for type view)
export function useAllScheduleEvents() {
  return useQuery({
    queryKey: ['schedule-events-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .order('job_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as ScheduleEvent[];
    },
  });
}

// Fetch team members
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as TeamMember[];
    },
  });
}

// Section type for scheduled job sections
export interface ScheduledJobSection {
  id?: string;
  schedule_job_id?: string;
  sect: string;
  description: string | null;
  full_section: string | null;
  cost_sheet: string | null;
}

// Fetch sections for a specific schedule event
export function useScheduleEventSections(scheduleJobId: string | undefined) {
  return useQuery({
    queryKey: ['schedule-event-sections', scheduleJobId],
    enabled: !!scheduleJobId,
    queryFn: async () => {
      if (!scheduleJobId) return [];
      const { data, error } = await supabase
        .from('scheduled_job_sections')
        .select('*')
        .eq('schedule_job_id', scheduleJobId)
        .order('sect');
      
      if (error) throw error;
      return data as ScheduledJobSection[];
    },
  });
}

// Create/Update event mutation with optional sections
export function useScheduleEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventWithSections: Partial<ScheduleEvent> & { id?: string; _sections?: ScheduledJobSection[] }) => {
      const { id, created_at, updated_at, _sections, ...payload } = eventWithSections;

      // Ensure event_type is set based on is_travel_day for backwards compatibility
      if (payload.is_travel_day && !payload.event_type) {
        payload.event_type = 'travel';
      }

      let eventId = id;

      if (id) {
        const { error } = await supabase
          .from('scheduled_jobs')
          .update(payload as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('scheduled_jobs')
          .insert(payload as any)
          .select('id')
          .single();
        if (error) throw error;
        eventId = data.id;
      }

      // If sections are provided, insert them (for new events from previous lookup)
      if (_sections && _sections.length > 0 && eventId) {
        // First, delete any existing sections for this event (in case of update)
        await supabase
          .from('scheduled_job_sections')
          .delete()
          .eq('schedule_job_id', eventId);

        // Insert the new sections
        const sectionsToInsert = _sections.map((s) => ({
          schedule_job_id: eventId,
          sect: s.sect,
          description: s.description,
          full_section: s.full_section,
          cost_sheet: s.cost_sheet,
        }));

        const { error: sectError } = await supabase
          .from('scheduled_job_sections')
          .insert(sectionsToInsert);

        if (sectError) {
          console.error('Error inserting sections:', sectError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-events-all'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-event-sections'] });
      toast({ title: 'Event saved successfully' });
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast({ title: 'Failed to save event', variant: 'destructive' });
    },
  });
}

// Delete event mutation
export function useDeleteScheduleEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_jobs')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-events-all'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      toast({ title: 'Event deleted' });
    },
    onError: () => {
      toast({ title: 'Failed to delete event', variant: 'destructive' });
    },
  });
}

// Helper to get events for a specific date
export function getEventsForDate(events: ScheduleEvent[], date: Date): ScheduleEvent[] {
  const dateStr = format(date, 'yyyy-MM-dd');
  return events.filter((event) => {
    if (event.end_date) {
      const start = parseISO(event.job_date);
      const end = parseISO(event.end_date);
      return isWithinInterval(date, { start, end });
    }
    return event.job_date === dateStr;
  });
}

// Helper to group events by type
export function groupEventsByType(events: ScheduleEvent[]) {
  return {
    work: events.filter((e) => e.event_type === 'work' || (!e.event_type && !e.is_travel_day)),
    travel: events.filter((e) => e.event_type === 'travel' || e.is_travel_day),
    off: events.filter((e) => e.event_type === 'off'),
    note: events.filter((e) => e.event_type === 'note'),
  };
}

// Event type config for colors and labels
export const EVENT_TYPE_CONFIG: Record<ScheduleEventType, { label: string; color: string; bgClass: string; textClass: string }> = {
  work: {
    label: 'Work Day',
    color: '#3B82F6',
    bgClass: 'bg-blue-100 dark:bg-blue-950',
    textClass: 'text-blue-800 dark:text-blue-200',
  },
  travel: {
    label: 'Travel Day',
    color: '#F59E0B',
    bgClass: 'bg-amber-100 dark:bg-amber-950',
    textClass: 'text-amber-800 dark:text-amber-200',
  },
  off: {
    label: 'Off Day',
    color: '#10B981',
    bgClass: 'bg-emerald-100 dark:bg-emerald-950',
    textClass: 'text-emerald-800 dark:text-emerald-200',
  },
  note: {
    label: 'Note',
    color: '#8B5CF6',
    bgClass: 'bg-violet-100 dark:bg-violet-950',
    textClass: 'text-violet-800 dark:text-violet-200',
  },
};
