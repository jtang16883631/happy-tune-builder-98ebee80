import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export type JobWorkflowStage = 
  | 'making_price_files'
  | 'pricing_complete'
  | 'files_built'
  | 'needs_automation'
  | 'jobs_on_hold'
  | 'ready_for_review'
  | 'out_on_draft'
  | 'in_for_updates'
  | 'out_for_final'
  | 'to_be_invoiced'
  | 'final_approved';

export interface LiveTrackerJob {
  id: string;
  promise_invoice_number: string | null;
  template_done: string | null;
  ticket_done: string | null;
  ptf_sum: string | null;
  job_number: string | null;
  group_name: string | null;
  job_name: string;
  stage: JobWorkflowStage;
  pricing_done: boolean | null;
  who_has_auto: string | null;
  automation_notes: string | null;
  master_review_by: string | null;
  draft_out_date: string | null;
  updates_date: string | null;
  closed_final_date: string | null;
  invoiced_date: string | null;
  comments: string | null;
  stage_changed_at: string | null;
  overdue_days: number | null;
  created_by: string | null;
  assigned_to: string | null;
  schedule_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageHistory {
  id: string;
  job_id: string;
  from_stage: JobWorkflowStage | null;
  to_stage: JobWorkflowStage;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

export const STAGE_CONFIG: Record<JobWorkflowStage, { label: string; color: string; order: number }> = {
  making_price_files: { label: 'MAKING PRICE FILES', color: 'bg-red-500', order: 1 },
  pricing_complete: { label: 'Pricing Complete - Ready for template', color: 'bg-orange-500', order: 2 },
  files_built: { label: 'FILES BUILT, COLLECTION FILE MADE', color: 'bg-yellow-500', order: 3 },
  needs_automation: { label: 'Compiled: NEEDS AUTOMATION/REPORTS', color: 'bg-lime-500', order: 4 },
  jobs_on_hold: { label: 'JOBS ON HOLD', color: 'bg-gray-500', order: 5 },
  ready_for_review: { label: 'FILES COMPILED READY FOR REVIEW', color: 'bg-teal-500', order: 6 },
  out_on_draft: { label: 'OUT ON DRAFT', color: 'bg-cyan-500', order: 7 },
  in_for_updates: { label: 'IN FOR UPDATES', color: 'bg-blue-500', order: 8 },
  out_for_final: { label: 'OUT FOR FINAL', color: 'bg-indigo-500', order: 9 },
  to_be_invoiced: { label: 'TO BE INVOICED', color: 'bg-purple-500', order: 10 },
  final_approved: { label: 'FINAL APPROVED/ARCHIVE', color: 'bg-green-500', order: 11 },
};

export const STAGE_ORDER: JobWorkflowStage[] = [
  'making_price_files',
  'pricing_complete',
  'files_built',
  'needs_automation',
  'jobs_on_hold',
  'ready_for_review',
  'out_on_draft',
  'in_for_updates',
  'out_for_final',
  'to_be_invoiced',
  'final_approved',
];

export function useLiveTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all jobs
  const { data: jobs, isLoading, error } = useQuery({
    queryKey: ['live-tracker-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_tracker_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as LiveTrackerJob[];
    },
    enabled: !!user,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('live-tracker-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_tracker_jobs',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
          
          // Show toast for stage changes
          if (payload.eventType === 'UPDATE' && payload.old && payload.new) {
            const oldJob = payload.old as LiveTrackerJob;
            const newJob = payload.new as LiveTrackerJob;
            if (oldJob.stage !== newJob.stage) {
              toast({
                title: 'Job stage updated',
                description: `${newJob.job_name} moved to ${STAGE_CONFIG[newJob.stage].label}`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Create job mutation
  const createJob = useMutation({
    mutationFn: async (job: Partial<LiveTrackerJob>) => {
      const insertData = {
        job_name: job.job_name || 'Untitled Job',
        promise_invoice_number: job.promise_invoice_number,
        template_done: job.template_done,
        ticket_done: job.ticket_done,
        ptf_sum: job.ptf_sum,
        job_number: job.job_number,
        group_name: job.group_name,
        stage: job.stage || 'making_price_files',
        pricing_done: job.pricing_done,
        who_has_auto: job.who_has_auto,
        automation_notes: job.automation_notes,
        master_review_by: job.master_review_by,
        draft_out_date: job.draft_out_date,
        updates_date: job.updates_date,
        closed_final_date: job.closed_final_date,
        invoiced_date: job.invoiced_date,
        comments: job.comments,
        overdue_days: job.overdue_days || 3,
        created_by: user?.id,
        assigned_to: job.assigned_to,
      };
      
      const { data, error } = await supabase
        .from('live_tracker_jobs')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      toast({ title: 'Job created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create job', description: error.message, variant: 'destructive' });
    },
  });

  // Update job mutation
  const updateJob = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LiveTrackerJob> & { id: string }) => {
      const { data, error } = await supabase
        .from('live_tracker_jobs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
    },
    onError: (error) => {
      toast({ title: 'Failed to update job', description: error.message, variant: 'destructive' });
    },
  });

  // Update stage mutation (for drag and drop)
  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: JobWorkflowStage }) => {
      const { data, error } = await supabase
        .from('live_tracker_jobs')
        .update({ stage })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
    },
    onError: (error) => {
      toast({ title: 'Failed to update stage', description: error.message, variant: 'destructive' });
    },
  });

  // Delete job mutation
  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('live_tracker_jobs')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      toast({ title: 'Job deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete job', description: error.message, variant: 'destructive' });
    },
  });

  // Group jobs by stage
  const jobsByStage = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = jobs?.filter((job) => job.stage === stage) || [];
    return acc;
  }, {} as Record<JobWorkflowStage, LiveTrackerJob[]>);

  // Check if a job is overdue
  const isJobOverdue = (job: LiveTrackerJob): boolean => {
    if (!job.stage_changed_at || !job.overdue_days) return false;
    const stageChangedAt = new Date(job.stage_changed_at);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= job.overdue_days;
  };

  return {
    jobs,
    jobsByStage,
    isLoading,
    error,
    createJob,
    updateJob,
    updateStage,
    deleteJob,
    isJobOverdue,
  };
}

export function useStageHistory(jobId: string) {
  return useQuery({
    queryKey: ['stage-history', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_tracker_stage_history')
        .select('*')
        .eq('job_id', jobId)
        .order('changed_at', { ascending: false });
      
      if (error) throw error;
      return data as StageHistory[];
    },
    enabled: !!jobId,
  });
}
