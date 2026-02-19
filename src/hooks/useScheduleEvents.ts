import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, parseISO, isWithinInterval } from 'date-fns';

// Helper function to create OneDrive folder for a work event
async function createOneDriveFolderForEvent(invoiceNumber: string, clientName: string, jobDate: string) {
  try {
    // Get company OneDrive tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('onedrive_company_tokens')
      .select('access_token')
      .single();

    if (tokenError || !tokenData?.access_token) {
      console.log('OneDrive not connected, skipping folder creation');
      return;
    }

    const accessToken = tokenData.access_token;
    const date = parseISO(jobDate);
    const year = format(date, 'yyyy');
    const monthNumber = format(date, 'M');
    const monthName = format(date, 'MMMM');
    const monthFolder = `${monthNumber}-${monthName} ${year}`;
    const folderName = `${invoiceNumber} ${clientName}`.trim();

    // Step 1: Find or create "MIS Client Files" folder
    let misClientFilesId = await findOrCreateFolder(accessToken, null, 'MIS Client Files');
    if (!misClientFilesId) return;

    // Step 2: Find or create year folder (e.g., "2026")
    let yearFolderId = await findOrCreateFolder(accessToken, misClientFilesId, year);
    if (!yearFolderId) return;

    // Step 3: Find or create month folder (e.g., "1-January 2026")
    let monthFolderId = await findOrCreateFolder(accessToken, yearFolderId, monthFolder);
    if (!monthFolderId) return;

    // Step 4: Create the job folder (e.g., "INV12345 Facility Name")
    await findOrCreateFolder(accessToken, monthFolderId, folderName);

    console.log(`Successfully created OneDrive folder: MIS Client Files/${year}/${monthFolder}/${folderName}`);
    toast({ title: 'OneDrive folder created', description: `Created folder: ${folderName}` });
  } catch (error) {
    console.error('Error creating OneDrive folder:', error);
    // Don't show error toast as this is a background operation
  }
}

// Helper to find or create a folder
async function findOrCreateFolder(accessToken: string, parentId: string | null, folderName: string): Promise<string | null> {
  try {
    // First, list contents to check if folder exists
    const { data: listData, error: listError } = await supabase.functions.invoke('onedrive-api', {
      body: {
        action: 'list-files',
        accessToken,
        folderId: parentId,
      }
    });

    if (listError) {
      console.error('Error listing OneDrive folder:', listError);
      return null;
    }

    // Check if folder already exists
    const existingFolder = listData?.value?.find(
      (item: any) => item.folder && item.name.toLowerCase() === folderName.toLowerCase()
    );

    if (existingFolder) {
      return existingFolder.id;
    }

    // Folder doesn't exist, create it
    const { data: createData, error: createError } = await supabase.functions.invoke('onedrive-api', {
      body: {
        action: 'create-folder',
        accessToken,
        folderId: parentId,
        fileName: folderName,
      }
    });

    if (createError || createData?.error) {
      console.error('Error creating OneDrive folder:', createError || createData?.error);
      return null;
    }

    return createData?.id || null;
  } catch (error) {
    console.error('Error in findOrCreateFolder:', error);
    return null;
  }
}

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

// Fetch team members from profiles table (registered users)
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url')
        .order('full_name');

      if (error) throw error;
      
      // Map profiles to TeamMember format for compatibility
      return (data || []).map(profile => ({
        id: profile.id,
        name: profile.full_name || profile.email || 'Unknown User',
        email: profile.email,
        phone: profile.phone,
        color: null,
        is_active: true,
      })) as TeamMember[];
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

// Helper function to sync schedule to Google Docs
async function syncScheduleToGoogleDocs(jobDate: string, teamMembers: TeamMember[]) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('No session, skipping Google Doc sync');
      return;
    }

    // Get the week containing the job date
    const date = parseISO(jobDate);
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // End of week (Saturday)

    const startStr = format(startOfWeek, 'yyyy-MM-dd');
    const endStr = format(endOfWeek, 'yyyy-MM-dd');

    // Fetch all events for that week
    const { data: weekEvents, error: fetchError } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .gte('job_date', startStr)
      .lte('job_date', endStr)
      .order('job_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (fetchError) {
      console.error('Error fetching week events for sync:', fetchError);
      return;
    }

    // Map team member IDs to names
    const eventsWithNames = (weekEvents || []).map(event => ({
      ...event,
      team_member_names: (event.team_members || [])
        .map((id: string) => teamMembers.find(m => m.id === id)?.name)
        .filter(Boolean) as string[],
    }));

    // Call the export function
    const { error } = await supabase.functions.invoke('export-schedule-to-docs', {
      body: {
        startDate: startStr,
        endDate: endStr,
        events: eventsWithNames,
      }
    });

    if (error) {
      console.error('Google Doc sync error:', error);
    } else {
      console.log('Schedule synced to Google Docs');
    }
  } catch (error) {
    console.error('Error syncing to Google Docs:', error);
  }
}

// Create/Update event mutation with optional sections
export function useScheduleEventMutation(teamMembers: TeamMember[] = []) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventWithSections: Partial<ScheduleEvent> & { id?: string; _sections?: ScheduledJobSection[]; _previousTeamMemberIds?: string[] }) => {
      const { id, created_at, updated_at, _sections, _previousTeamMemberIds, ...payload } = eventWithSections;

      // Ensure event_type is set based on is_travel_day for backwards compatibility
      if (payload.is_travel_day && !payload.event_type) {
        payload.event_type = 'travel';
      }

      let eventId = id;
      const isNewEvent = !id;
      const previousTeamMemberIds = _previousTeamMemberIds || [];

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
        await supabase
          .from('scheduled_job_sections')
          .delete()
          .eq('schedule_job_id', eventId);

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

      // Create OneDrive folder for new work events with invoice number
      if (isNewEvent && payload.event_type === 'work' && payload.invoice_number && payload.client_name && payload.job_date) {
        createOneDriveFolderForEvent(
          payload.invoice_number,
          payload.client_name,
          payload.job_date
        );
      }

      // Fire-and-forget: notify newly added team members
      console.log('[Notify] eventId:', eventId, 'team_members:', payload.team_members, 'previous:', previousTeamMemberIds);
      if (eventId && payload.team_members && payload.team_members.length > 0) {
        console.log('[Notify] Invoking schedule-assignment-notify...');
        supabase.functions.invoke('schedule-assignment-notify', {
          body: {
            eventId,
            newTeamMemberIds: payload.team_members,
            previousTeamMemberIds,
          },
        }).then((res) => {
          console.log('[Notify] Response:', res);
        }).catch((err) => console.warn('[Notify] Failed:', err));
      } else {
        console.log('[Notify] Skipped: no team members or no eventId');
      }

      return { jobDate: payload.job_date };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-events-all'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-event-sections'] });
      toast({ title: 'Event saved successfully' });

      // Sync to Google Docs in background
      if (result?.jobDate && teamMembers.length > 0) {
        syncScheduleToGoogleDocs(result.jobDate, teamMembers);
      }
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
