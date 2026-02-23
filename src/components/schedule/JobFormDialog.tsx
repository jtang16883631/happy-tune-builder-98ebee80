import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  color: string | null;
  is_active: boolean | null;
}

interface ScheduledJob {
  id: string;
  invoice_number: string | null;
  job_date: string;
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
  status: string | null;
}

interface FormData {
  invoice_number: string;
  start_time: string;
  arrival_note: string;
  client_name: string;
  client_id: string;
  address: string;
  phone: string;
  previous_inventory_value: string;
  onsite_contact: string;
  corporate_contact: string;
  email_data_to: string;
  final_invoice_to: string;
  notes: string;
  special_notes: string;
  team_members: string[];
  is_travel_day: boolean;
  travel_info: string;
  hotel_info: string;
}

const MAKE_WEBHOOK_URL = import.meta.env.VITE_MAKE_WEBHOOK_URL || '';

function generateLegacyPayload(data: FormData, teamMembers: TeamMember[]) {
  const memberNames = data.team_members
    .map(id => {
      const m = teamMembers.find(tm => tm.id === id);
      return m ? m.name.replace(/\s+/g, '') : id;
    })
    .join('+');

  return {
    line1: data.invoice_number || data.start_time || data.arrival_note
      ? `-Invoice: ${data.invoice_number || ''} START: ${data.start_time || ''} NOTE: ${data.arrival_note || ''}`
      : '',
    line2: data.team_members.length > 0
      ? `(${data.team_members.length})${memberNames}`
      : '',
    line3: data.special_notes
      ? `***NOTE: ${data.special_notes}***`
      : '',
    line4: `Client: ${data.client_id || ''} - ${data.is_travel_day ? 'Travel Day' : data.client_name} | Address: ${data.address || ''}${data.is_travel_day && data.hotel_info ? ` | Hotel info: ${data.hotel_info}` : ''}`,
  };
}

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: ScheduledJob | null;
  selectedDate: Date;
  teamMembers: TeamMember[];
}

export function JobFormDialog({
  open,
  onOpenChange,
  job,
  selectedDate,
  teamMembers,
}: JobFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!job;

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: {
      invoice_number: '',
      start_time: '',
      arrival_note: '',
      client_name: '',
      client_id: '',
      address: '',
      phone: '',
      previous_inventory_value: '',
      onsite_contact: '',
      corporate_contact: '',
      email_data_to: '',
      final_invoice_to: '',
      notes: '',
      special_notes: '',
      team_members: [],
      is_travel_day: false,
      travel_info: '',
      hotel_info: '',
    },
  });

  const isTravelDay = watch('is_travel_day');
  const selectedTeamMembers = watch('team_members');

  useEffect(() => {
    if (open) {
      if (job) {
        reset({
          invoice_number: job.invoice_number || '',
          start_time: job.start_time || '',
          arrival_note: job.arrival_note || '',
          client_name: job.client_name || '',
          client_id: job.client_id || '',
          address: job.address || '',
          phone: job.phone || '',
          previous_inventory_value: job.previous_inventory_value || '',
          onsite_contact: job.onsite_contact || '',
          corporate_contact: job.corporate_contact || '',
          email_data_to: job.email_data_to || '',
          final_invoice_to: job.final_invoice_to || '',
          notes: job.notes || '',
          special_notes: job.special_notes || '',
          team_members: job.team_members || [],
          is_travel_day: job.is_travel_day || false,
          travel_info: job.travel_info || '',
          hotel_info: job.hotel_info || '',
        });
      } else {
        reset({
          invoice_number: '',
          start_time: '',
          arrival_note: '',
          client_name: '',
          client_id: '',
          address: '',
          phone: '',
          previous_inventory_value: '',
          onsite_contact: '',
          corporate_contact: '',
          email_data_to: '',
          final_invoice_to: '',
          notes: '',
          special_notes: '',
          team_members: [],
          is_travel_day: false,
          travel_info: '',
          hotel_info: '',
        });
      }
    }
  }, [open, job, reset]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const previousTeamMemberIds = job?.team_members || [];

      const payload = {
        invoice_number: data.invoice_number || null,
        job_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: data.start_time || null,
        arrival_note: data.arrival_note || null,
        client_name: data.is_travel_day ? 'Travel Day' : data.client_name,
        client_id: data.client_id || null,
        address: data.address || null,
        phone: data.phone || null,
        previous_inventory_value: data.previous_inventory_value || null,
        onsite_contact: data.onsite_contact || null,
        corporate_contact: data.corporate_contact || null,
        email_data_to: data.email_data_to || null,
        final_invoice_to: data.final_invoice_to || null,
        notes: data.notes || null,
        special_notes: data.special_notes || null,
        team_members: data.team_members,
        team_count: data.team_members.length,
        is_travel_day: data.is_travel_day,
        travel_info: data.travel_info || null,
        hotel_info: data.hotel_info || null,
      };

      let savedJobId: string | null = null;

      if (isEditing && job) {
        const { error } = await supabase
          .from('scheduled_jobs')
          .update(payload)
          .eq('id', job.id);
        if (error) throw error;
        savedJobId = job.id;
      } else {
        const { data: inserted, error } = await supabase
          .from('scheduled_jobs')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        savedJobId = inserted?.id ?? null;
      }

      // Fire-and-forget: notify newly added team members
      if (savedJobId && data.team_members.length > 0) {
        supabase.functions.invoke('schedule-assignment-notify', {
          body: {
            eventId: savedJobId,
            newTeamMemberIds: data.team_members,
            previousTeamMemberIds,
          },
        }).catch((err) => console.warn('Notification failed (non-blocking):', err));
      }

      // Send legacy HTML to Make.com webhook
      try {
        const response = await fetch('https://hook.us2.make.com/uz11u4w5w8cs9esg6o4y3uq7w9q34ggw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawData: { ...data, job_date: format(selectedDate, 'yyyy-MM-dd') }, payload: generateLegacyPayload(data, teamMembers) }),
        });
        console.log('Real webhook fired! Status:', response.status);
      } catch (error) {
        console.error('Real webhook failed:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      toast({ title: isEditing ? 'Job updated' : 'Job created' });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast({ title: 'Failed to save job', variant: 'destructive' });
    },
  });

  const onSubmit = (data: FormData) => {
    if (!data.is_travel_day && !data.client_name.trim()) {
      toast({ title: 'Client name is required', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(data);
  };

  const toggleTeamMember = (memberId: string) => {
    const current = selectedTeamMembers || [];
    if (current.includes(memberId)) {
      setValue('team_members', current.filter(id => id !== memberId));
    } else {
      setValue('team_members', [...current, memberId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Job' : 'Add Job'} - {format(selectedDate, 'MMMM d, yyyy')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Travel Day Toggle */}
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
              <Checkbox
                id="is_travel_day"
                checked={isTravelDay}
                onCheckedChange={(checked) => setValue('is_travel_day', !!checked)}
              />
              <Label htmlFor="is_travel_day" className="cursor-pointer">
                This is a Travel Day
              </Label>
            </div>

            {isTravelDay ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="travel_info">Travel Info (e.g., "DRIVE to New Orleans, LA from Atlanta, GA")</Label>
                  <Input id="travel_info" {...register('travel_info')} placeholder="Travel details..." />
                </div>
                <div>
                  <Label htmlFor="hotel_info">Hotel Info</Label>
                  <Input id="hotel_info" {...register('hotel_info')} placeholder="Hotel name and address..." />
                </div>
              </div>
            ) : (
              <>
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="invoice_number">Invoice Number</Label>
                    <Input id="invoice_number" {...register('invoice_number')} placeholder="e.g., 25120378" />
                  </div>
                  <div>
                    <Label htmlFor="start_time">Start Time</Label>
                    <Input id="start_time" {...register('start_time')} placeholder="e.g., 7:00a" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="arrival_note">Arrival Note</Label>
                  <Input id="arrival_note" {...register('arrival_note')} placeholder="e.g., Team should arrive at 6:30a" />
                </div>

                {/* Client Info */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="client_name">Client Name *</Label>
                    <Input id="client_name" {...register('client_name')} placeholder="e.g., Slidell Memorial Hospital" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="client_id">Client ID</Label>
                      <Input id="client_id" {...register('client_id')} placeholder="e.g., 1212173" />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone (Fax/Ph)</Label>
                      <Input id="phone" {...register('phone')} placeholder="e.g., (985)280-2200" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" {...register('address')} placeholder="e.g., 1001 Gause Blvd, Slidell, LA 70458" />
                  </div>
                </div>

                {/* Contacts */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="onsite_contact">Onsite Contact</Label>
                    <Input id="onsite_contact" {...register('onsite_contact')} placeholder="e.g., Amris Willis (DOP)" />
                  </div>
                  <div>
                    <Label htmlFor="corporate_contact">Corporate Contact</Label>
                    <Input id="corporate_contact" {...register('corporate_contact')} placeholder="e.g., Ryan Pepper" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="previous_inventory_value">Previous Inventory Value</Label>
                  <Input id="previous_inventory_value" {...register('previous_inventory_value')} placeholder="e.g., $1,203,017" />
                </div>

                {/* Email Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email_data_to">Email Data To</Label>
                    <Input id="email_data_to" {...register('email_data_to')} placeholder="email@example.com" />
                  </div>
                  <div>
                    <Label htmlFor="final_invoice_to">Final Invoice To</Label>
                    <Input id="final_invoice_to" {...register('final_invoice_to')} placeholder="email@example.com" />
                  </div>
                </div>
              </>
            )}

            {/* Team Members */}
            <div className="space-y-2">
              <Label>Team Members</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg min-h-[60px]">
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleTeamMember(member.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedTeamMembers?.includes(member.id)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {member.name}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No team members. Add them from the Team button.</p>
                )}
              </div>
              {selectedTeamMembers && selectedTeamMembers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedTeamMembers.length} member{selectedTeamMembers.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" {...register('notes')} placeholder="General notes..." rows={2} />
              </div>
              <div>
                <Label htmlFor="special_notes">Special Notes (highlighted in red)</Label>
                <Textarea id="special_notes" {...register('special_notes')} placeholder="Important special instructions..." rows={2} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Update Job' : 'Add Job'}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}