import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Plane,
  Briefcase,
  MapPin,
  Phone,
  Edit,
  Trash2,
  Hotel,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ScheduleEvent,
  TeamMember,
  getEventsForDate,
} from '@/hooks/useScheduleEvents';

interface ScheduleAgendaViewProps {
  events: ScheduleEvent[];
  teamMembers: TeamMember[];
  startDate: Date;
  endDate: Date;
  onEditEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  hideEmptyDays?: boolean;
}

export function ScheduleAgendaView({
  events,
  teamMembers,
  startDate,
  endDate,
  onEditEvent,
  onDeleteEvent,
  hideEmptyDays = false,
}: ScheduleAgendaViewProps) {
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const getTeamMemberNames = (memberIds: string[] | null) => {
    if (!memberIds) return [];
    return memberIds
      .map((id) => teamMembers.find((m) => m.id === id))
      .filter(Boolean) as TeamMember[];
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-0 bg-card rounded-lg border overflow-hidden">
      {days.map((day, dayIndex) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayEvents = getEventsForDate(events, day);
        if (hideEmptyDays && dayEvents.length === 0) return null;
        const travelEvent = dayEvents.find((e) => e.event_type === 'travel' || e.is_travel_day);
        const workEvents = dayEvents.filter((e) => e.event_type === 'work' && !e.is_travel_day);
        const offEvents = dayEvents.filter((e) => e.event_type === 'off');
        const noteEvents = dayEvents.filter((e) => e.event_type === 'note');

        return (
          <div key={dateStr} className={cn(dayIndex > 0 && 'border-t')}>
            {/* Day Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-foreground">
                  {format(day, 'EEEE, MMM d, yyyy')}
                </span>
                {travelEvent && (
                  <Badge className="bg-red-500 hover:bg-red-600 text-white font-semibold text-xs">
                    Travel ONLY▼
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(workEvents[0]?.invoice_number || travelEvent?.invoice_number) && (
                  <span className="text-sm text-muted-foreground font-mono">
                    {workEvents[0]?.invoice_number || travelEvent?.invoice_number}
                  </span>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Travel Event */}
            {travelEvent && (
              <div className="px-4 py-3 border-t bg-background">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 text-xs">
                      Travel {dayIndex + 1}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {/* Location */}
                    <div className="flex items-center gap-2 text-foreground">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">
                        {travelEvent.location_from && travelEvent.location_to 
                          ? `${travelEvent.location_from} – ${travelEvent.location_to}`
                          : travelEvent.location_to || travelEvent.address || 'Travel destination'}
                      </span>
                    </div>
                    
                    {/* Team Members - simple text */}
                    {travelEvent.team_members && travelEvent.team_members.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {getTeamMemberNames(travelEvent.team_members).map(m => m.name.split(' ')[0]).join(' ')}
                      </div>
                    )}

                    {/* Flight Info */}
                    {travelEvent.travel_info && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Flight:</span>
                        <span className="text-foreground">{travelEvent.travel_info}</span>
                      </div>
                    )}

                    {/* Hotel Info */}
                    {travelEvent.hotel_info && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Motel:</span>
                        <span className="text-foreground">{travelEvent.hotel_info}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvent(travelEvent)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteEvent(travelEvent.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Work Events */}
            {workEvents.map((event) => {
              const members = getTeamMemberNames(event.team_members);
              
              return (
                <div key={event.id} className="px-4 py-4 border-t bg-background">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Start Time Badge */}
                      {event.start_time && (
                        <div className="flex items-center gap-3">
                          <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold px-2">
                            START: {event.start_time}
                          </Badge>
                          {event.arrival_note && (
                            <span className="text-sm text-muted-foreground">
                              NOTE: {event.arrival_note}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Team Members with Avatars */}
                      {members.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-yellow-200 text-yellow-900 hover:bg-yellow-300 font-semibold px-2 text-xs">
                            ({members.length}){members.map(m => m.name.split(' ')[0]).join('+')}
                          </Badge>
                          <div className="flex -space-x-2">
                            {members.slice(0, 6).map((member) => (
                              <Avatar key={member.id} className="h-6 w-6 border-2 border-background">
                                <AvatarFallback 
                                  className="text-[10px] font-medium"
                                  style={member.color ? { backgroundColor: member.color, color: '#fff' } : undefined}
                                >
                                  {getInitials(member.name)}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes Section */}
                      {event.notes && (
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-green-500 rounded-full" />
                          <span className="text-sm text-green-700 dark:text-green-400">{event.notes}</span>
                        </div>
                      )}
                      {event.special_notes && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">***NOTE: {event.special_notes}***</span>
                        </div>
                      )}

                      {/* Client Info */}
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            {event.client_id && <span className="text-primary">{event.client_id} - </span>}
                            {event.client_name}
                          </span>
                        </div>
                        
                        {event.address && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{event.address}</span>
                          </div>
                        )}
                        
                        {event.previous_inventory_value && (
                          <div className="text-muted-foreground">
                            Previous Inventory Value: {event.previous_inventory_value}
                          </div>
                        )}

                        {event.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span>MH: Phone: FacPh: {event.phone}</span>
                          </div>
                        )}

                        {event.onsite_contact && (
                          <div className="text-muted-foreground">Onsite Contact: {event.onsite_contact}</div>
                        )}
                        {event.corporate_contact && (
                          <div className="text-muted-foreground">Corporate Contact: {event.corporate_contact}</div>
                        )}
                        {event.email_data_to && (
                          <div className="text-muted-foreground">Email data to: {event.email_data_to}</div>
                        )}
                        {event.final_invoice_to && (
                          <div className="text-muted-foreground">Final invoice: {event.final_invoice_to}</div>
                        )}
                      </div>

                      {/* Flags */}
                      {(event.exact_count_required || event.partial_inventory || event.client_onsite) && (
                        <div className="flex gap-2 flex-wrap">
                          {event.exact_count_required && (
                            <Badge variant="outline" className="border-orange-500 text-orange-600 bg-orange-50 dark:bg-orange-950 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Exact Count Required
                            </Badge>
                          )}
                          {event.partial_inventory && (
                            <Badge variant="outline" className="border-purple-500 text-purple-600 bg-purple-50 dark:bg-purple-950 text-xs">
                              Partial Inventory
                            </Badge>
                          )}
                          {event.client_onsite && (
                            <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950 text-xs">
                              Client On-site
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Invoice Number and Actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {event.invoice_number && (
                        <span className="text-sm font-mono text-muted-foreground">
                          {event.invoice_number} ▼
                        </span>
                      )}
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvent(event)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteEvent(event.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Off Events */}
            {offEvents.map((event) => (
              <div key={event.id} className="px-4 py-3 border-t bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium">ALL off per schedule</span>
                    {event.event_title && <span>- {event.event_title}</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvent(event)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteEvent(event.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Note Events */}
            {noteEvents.map((event) => (
              <div key={event.id} className="px-4 py-3 border-t bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-blue-800 dark:text-blue-200">{event.event_title || 'Note'}</span>
                    {event.notes && <span className="text-sm text-blue-600 dark:text-blue-400">- {event.notes}</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvent(event)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteEvent(event.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {dayEvents.length === 0 && (
              <div className="px-4 py-6 border-t text-center text-muted-foreground text-sm bg-background">
                No events scheduled
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
