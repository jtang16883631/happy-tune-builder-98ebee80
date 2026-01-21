import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { format, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CalendarIcon,
  Plus,
  Plane,
  Briefcase,
  Coffee,
  FileText,
  AlertTriangle,
  X,
  Search,
  Loader2,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ScheduleEvent,
  ScheduleEventType,
  TeamMember,
  useScheduleEventMutation,
  EVENT_TYPE_CONFIG,
} from '@/hooks/useScheduleEvents';
import { usePreviousInvoiceLookup } from '@/hooks/usePreviousInvoiceLookup';

interface FormData {
  event_type: ScheduleEventType;
  job_date: Date;
  end_date: Date | null;
  event_title: string;
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
  travel_info: string;
  hotel_info: string;
  location_from: string;
  location_to: string;
  exact_count_required: boolean;
  partial_inventory: boolean;
  client_onsite: boolean;
}

interface ScheduleBuilderProps {
  event?: ScheduleEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[];
  defaultDate?: Date;
}

const EVENT_TYPE_ICONS = {
  work: Briefcase,
  travel: Plane,
  off: Coffee,
  note: FileText,
};

export function ScheduleBuilder({
  event,
  open,
  onOpenChange,
  teamMembers,
  defaultDate = new Date(),
}: ScheduleBuilderProps) {
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [previousInvoiceInput, setPreviousInvoiceInput] = useState('');
  
  const { isSearching, foundJob, searchPreviousInvoice, clearFoundJob } = usePreviousInvoiceLookup();

  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: {
      event_type: event?.event_type || 'work',
      job_date: event ? new Date(event.job_date + 'T00:00:00') : defaultDate,
      end_date: event?.end_date ? new Date(event.end_date + 'T00:00:00') : null,
      event_title: event?.event_title || '',
      invoice_number: event?.invoice_number || '',
      start_time: event?.start_time || '',
      arrival_note: event?.arrival_note || '',
      client_name: event?.client_name || '',
      client_id: event?.client_id || '',
      address: event?.address || '',
      phone: event?.phone || '',
      previous_inventory_value: event?.previous_inventory_value || '',
      onsite_contact: event?.onsite_contact || '',
      corporate_contact: event?.corporate_contact || '',
      email_data_to: event?.email_data_to || '',
      final_invoice_to: event?.final_invoice_to || '',
      notes: event?.notes || '',
      special_notes: event?.special_notes || '',
      team_members: event?.team_members || [],
      travel_info: event?.travel_info || '',
      hotel_info: event?.hotel_info || '',
      location_from: event?.location_from || '',
      location_to: event?.location_to || '',
      exact_count_required: event?.exact_count_required || false,
      partial_inventory: event?.partial_inventory || false,
      client_onsite: event?.client_onsite || false,
    },
  });

  const eventType = watch('event_type');
  const selectedTeamMembers = watch('team_members');
  const jobDate = watch('job_date');
  const endDate = watch('end_date');

  const mutation = useScheduleEventMutation();

  const handleLookupPreviousInvoice = async () => {
    if (!previousInvoiceInput) return;
    
    const result = await searchPreviousInvoice(previousInvoiceInput);
    if (result) {
      // Auto-populate form fields with found data
      setValue('client_name', result.client_name || '');
      setValue('client_id', result.client_id || '');
      setValue('address', result.address || '');
      setValue('phone', result.phone || '');
      setValue('previous_inventory_value', result.previous_inventory_value || '');
      setValue('onsite_contact', result.onsite_contact || '');
      setValue('corporate_contact', result.corporate_contact || '');
      setValue('email_data_to', result.email_data_to || '');
      setValue('final_invoice_to', result.final_invoice_to || '');
      setValue('notes', result.notes || '');
      setValue('special_notes', result.special_notes || '');
      setValue('exact_count_required', result.exact_count_required || false);
      setValue('partial_inventory', result.partial_inventory || false);
      setValue('client_onsite', result.client_onsite || false);
      setValue('hotel_info', result.hotel_info || '');
    }
  };

  const onSubmit = async (data: FormData) => {
    const payload: Partial<ScheduleEvent> = {
      event_type: data.event_type,
      job_date: format(data.job_date, 'yyyy-MM-dd'),
      end_date: data.end_date ? format(data.end_date, 'yyyy-MM-dd') : null,
      event_title: data.event_title || null,
      invoice_number: data.invoice_number || null,
      start_time: data.start_time || null,
      arrival_note: data.arrival_note || null,
      client_name: data.event_type === 'work' ? data.client_name : (data.event_title || `${EVENT_TYPE_CONFIG[data.event_type].label}`),
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
      is_travel_day: data.event_type === 'travel',
      travel_info: data.travel_info || null,
      hotel_info: data.hotel_info || null,
      location_from: data.location_from || null,
      location_to: data.location_to || null,
      exact_count_required: data.exact_count_required,
      partial_inventory: data.partial_inventory,
      client_onsite: data.client_onsite,
    };

    if (event?.id) {
      payload.id = event.id;
    }

    await mutation.mutateAsync(payload);
    onOpenChange(false);
    reset();
  };

  const toggleTeamMember = (memberId: string) => {
    const current = selectedTeamMembers || [];
    if (current.includes(memberId)) {
      setValue('team_members', current.filter((id) => id !== memberId));
    } else {
      setValue('team_members', [...current, memberId]);
    }
  };

  const EventIcon = EVENT_TYPE_ICONS[eventType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <EventIcon className="h-5 w-5" />
            {event ? 'Edit Schedule Event' : 'Create Schedule Event'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 pt-4 space-y-6">
            {/* Event Type Selection */}
            <div className="space-y-2">
              <Label>Event Type</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(EVENT_TYPE_CONFIG) as ScheduleEventType[]).map((type) => {
                  const Icon = EVENT_TYPE_ICONS[type];
                  const config = EVENT_TYPE_CONFIG[type];
                  const isSelected = eventType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setValue('event_type', type)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                        isSelected
                          ? `border-current ${config.bgClass} ${config.textClass}`
                          : 'border-border hover:border-muted-foreground/50 bg-card'
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(jobDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={jobDate}
                      onSelect={(date) => {
                        if (date) {
                          setValue('job_date', date);
                          setStartDateOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date (optional)</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP') : 'Single day'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2 border-b">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setValue('end_date', null);
                          setEndDateOpen(false);
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear (Single Day)
                      </Button>
                    </div>
                    <Calendar
                      mode="single"
                      selected={endDate || undefined}
                      onSelect={(date) => {
                        if (date) {
                          setValue('end_date', date);
                          setEndDateOpen(false);
                        }
                      }}
                      disabled={(date) => date < jobDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Event Title (for non-work events) */}
            {eventType !== 'work' && (
              <div className="space-y-2">
                <Label>Event Title</Label>
                <Input
                  {...register('event_title')}
                  placeholder={`e.g., ${eventType === 'travel' ? 'Drive to New Orleans' : eventType === 'off' ? 'Team Off Day' : 'Important Note'}`}
                />
              </div>
            )}

            {/* Travel-specific fields */}
            {eventType === 'travel' && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Plane className="h-4 w-4" />
                    Travel Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>From Location</Label>
                      <Input {...register('location_from')} placeholder="e.g., Atlanta, GA" />
                    </div>
                    <div className="space-y-2">
                      <Label>To Location</Label>
                      <Input {...register('location_to')} placeholder="e.g., New Orleans, LA" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Travel Info</Label>
                    <Textarea {...register('travel_info')} placeholder="Flight details, drive instructions..." rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hotel Info</Label>
                    <Input {...register('hotel_info')} placeholder="Hotel name and address..." />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Work-specific fields */}
            {eventType === 'work' && (
              <>
                {/* Previous Invoice Lookup Card */}
                <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <Link className="h-4 w-4" />
                      Link to Previous Year Ticket
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          value={previousInvoiceInput}
                          onChange={(e) => setPreviousInvoiceInput(e.target.value)}
                          placeholder="Enter previous invoice # (e.g., 25090182)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleLookupPreviousInvoice();
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleLookupPreviousInvoice}
                        disabled={isSearching || !previousInvoiceInput}
                        className="gap-2"
                      >
                        {isSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        Lookup
                      </Button>
                    </div>
                    {foundJob && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          Found: {foundJob.client_name}
                        </Badge>
                        <span className="text-muted-foreground">
                          from {foundJob.source === 'scheduled_jobs' ? 'previous schedule' : 'template'} ({foundJob.original_invoice})
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearFoundJob}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Enter a previous invoice number to auto-fill client info from last year's ticket
                    </p>
                  </CardContent>
                </Card>

                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Job Details</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>New Invoice Number</Label>
                      <Input {...register('invoice_number')} placeholder="e.g., 26010001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input {...register('start_time')} placeholder="e.g., 7:00a" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Arrival Note</Label>
                    <Input {...register('arrival_note')} placeholder="e.g., Team should arrive at 6:30a" />
                  </div>

                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input {...register('client_name')} placeholder="e.g., Slidell Memorial Hospital" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <Input {...register('client_id')} placeholder="e.g., 1212173" />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input {...register('phone')} placeholder="e.g., (985)280-2200" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input {...register('address')} placeholder="e.g., 1001 Gause Blvd, Slidell, LA 70458" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Onsite Contact</Label>
                      <Input {...register('onsite_contact')} placeholder="e.g., Amris Willis (DOP)" />
                    </div>
                    <div className="space-y-2">
                      <Label>Corporate Contact</Label>
                      <Input {...register('corporate_contact')} placeholder="e.g., Ryan Pepper" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Previous Inventory Value</Label>
                    <Input {...register('previous_inventory_value')} placeholder="e.g., $1,203,017" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email Data To</Label>
                      <Input {...register('email_data_to')} placeholder="email@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Final Invoice To</Label>
                      <Input {...register('final_invoice_to')} placeholder="email@example.com" />
                    </div>
                  </div>
                </div>

                {/* Flags/Checkboxes */}
                <Card className="border-blue-200 dark:border-blue-800">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <AlertTriangle className="h-4 w-4" />
                      Special Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={watch('exact_count_required')}
                          onCheckedChange={(checked) => setValue('exact_count_required', !!checked)}
                        />
                        <span className="text-sm">Exact Count Required</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={watch('partial_inventory')}
                          onCheckedChange={(checked) => setValue('partial_inventory', !!checked)}
                        />
                        <span className="text-sm">Partial Inventory</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={watch('client_onsite')}
                          onCheckedChange={(checked) => setValue('client_onsite', !!checked)}
                        />
                        <span className="text-sm">Client On-site</span>
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Team Members */}
            <div className="space-y-2">
              <Label>Team Members</Label>
              <div className="flex flex-wrap gap-2 p-4 border rounded-xl min-h-[80px] bg-muted/30">
                {teamMembers.length > 0 ? (
                  teamMembers.map((member) => {
                    const isSelected = selectedTeamMembers?.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleTeamMember(member.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-background hover:bg-muted border'
                        )}
                        style={isSelected && member.color ? { backgroundColor: member.color } : undefined}
                      >
                        {member.name}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No team members available</p>
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
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea {...register('notes')} placeholder="General notes..." rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Special Notes (highlighted)</Label>
                <Textarea
                  {...register('special_notes')}
                  placeholder="Important special instructions..."
                  rows={2}
                  className="border-red-200 dark:border-red-800 focus:border-red-400"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {isSubmitting || mutation.isPending ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
