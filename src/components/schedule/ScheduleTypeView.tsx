import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plane,
  Briefcase,
  Coffee,
  FileText,
  MapPin,
  Edit,
  Trash2,
  Hotel,
  AlertTriangle,
  ArrowRight,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ScheduleEvent,
  TeamMember,
  groupEventsByType,
} from '@/hooks/useScheduleEvents';

interface ScheduleTypeViewProps {
  events: ScheduleEvent[];
  teamMembers: TeamMember[];
  onEditEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function ScheduleTypeView({
  events,
  teamMembers,
  onEditEvent,
  onDeleteEvent,
}: ScheduleTypeViewProps) {
  const navigate = useNavigate();
  const grouped = useMemo(() => groupEventsByType(events), [events]);

  const getTeamMemberNames = (memberIds: string[] | null) => {
    if (!memberIds) return [];
    return memberIds
      .map((id) => teamMembers.find((m) => m.id === id))
      .filter(Boolean) as TeamMember[];
  };

  // Sort events by date
  const sortByDate = (a: ScheduleEvent, b: ScheduleEvent) => 
    new Date(a.job_date).getTime() - new Date(b.job_date).getTime();

  const travelEvents = [...grouped.travel].sort(sortByDate);
  const workEvents = [...grouped.work].sort(sortByDate);
  const offEvents = [...grouped.off].sort(sortByDate);
  const noteEvents = [...grouped.note].sort(sortByDate);

  return (
    <div className="space-y-6">
      {/* Travel Days Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Travel Days: <span className="text-muted-foreground font-normal">({travelEvents.length}Promísão)</span>
          </h2>
        </div>
        
        <Card className="bg-card">
          <CardContent className="p-0 divide-y">
            {travelEvents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No travel days scheduled</div>
            ) : (
              travelEvents.map((event, index) => {
                const members = getTeamMemberNames(event.team_members);
                return (
                  <div key={event.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Plane className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {format(parseISO(event.job_date), 'MMM d')}
                            </span>
                            <span className="font-medium text-foreground">
                              {event.location_from && event.location_to 
                                ? `${event.location_from} – ${event.location_to}`
                                : event.location_to || event.address || 'Travel'}
                            </span>
                          </div>
                          
                          {/* Destination details */}
                          {event.location_to && (
                            <div className="text-sm text-muted-foreground">
                              — {event.location_to}
                            </div>
                          )}
                          
                          {/* Team member names */}
                          {members.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              {members.map(m => m.name.split(' ')[0]).join(' ')} 
                              {event.travel_info && ` ${event.travel_info}`}
                            </div>
                          )}

                          {/* Flight info */}
                          {event.travel_info && (
                            <div className="text-sm text-muted-foreground">
                              Flight: {event.travel_info}
                            </div>
                          )}

                          {/* Hotel info */}
                          {event.hotel_info && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              Motel: {event.hotel_info}
                            </div>
                          )}

                          {/* Additional notes */}
                          {event.notes && (
                            <div className="text-sm text-muted-foreground">
                              {event.notes}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvent(event)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteEvent(event.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Work Days Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Work Days: <span className="text-muted-foreground font-normal">({workEvents.length}Promísão)</span>
          </h2>
        </div>
        
        <Card className="bg-card">
          <CardContent className="p-0 divide-y">
            {workEvents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No work days scheduled</div>
            ) : (
              workEvents.map((event) => {
                const members = getTeamMemberNames(event.team_members);
                return (
                  <div key={event.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Briefcase className="h-4 w-4 text-primary mt-0.5" />
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {format(parseISO(event.job_date), 'EEEE, MMM d')}-
                            </span>
                            <span className="font-medium text-foreground">
                              {event.start_time && `${event.start_time}- `}
                              {event.client_name}
                            </span>
                          </div>
                          
                          {/* Team member badges */}
                          {members.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-center">
                              <span className="text-sm text-muted-foreground mr-1">A</span>
                              {members.map((member) => (
                                <Badge
                                  key={member.id}
                                  variant="secondary"
                                  className="text-xs font-medium px-1.5 py-0"
                                  style={member.color ? { backgroundColor: member.color, color: '#fff' } : undefined}
                                >
                                  {member.name.split(' ')[0]}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Address */}
                          {event.address && (
                            <div className="text-sm text-muted-foreground">
                              {event.address}
                            </div>
                          )}

                          {/* Flags */}
                          {(event.exact_count_required || event.partial_inventory) && (
                            <div className="flex gap-1 flex-wrap">
                              {event.exact_count_required && (
                                <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600 px-1.5 py-0">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                                  Exact
                                </Badge>
                              )}
                              {event.partial_inventory && (
                                <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-600 px-1.5 py-0">
                                  Partial
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-2">
                          {event.tracker_job_id && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] border-primary/50 text-primary cursor-pointer hover:bg-primary/10 gap-1"
                              onClick={() => navigate('/live-tracker')}
                            >
                              <Workflow className="h-3 w-3" />
                              Tracked
                            </Badge>
                          )}
                          {event.invoice_number && (
                            <span className="text-xs font-mono text-muted-foreground">{event.invoice_number}</span>
                          )}
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
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Off Days Section */}
      {offEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Off Days: <span className="text-muted-foreground font-normal">({offEvents.length})</span>
            </h2>
          </div>
          
          <Card className="bg-card">
            <CardContent className="p-0 divide-y">
              {offEvents.map((event) => {
                const members = getTeamMemberNames(event.team_members);
                return (
                  <div key={event.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Coffee className="h-4 w-4 text-slate-500" />
                        <span className="text-sm text-muted-foreground">
                          {format(parseISO(event.job_date), 'MMM d')}
                        </span>
                        <span className="font-medium">{event.event_title || 'Off'}</span>
                        {members.length > 0 && (
                          <span className="text-sm text-muted-foreground">
                            ({members.map(m => m.name).join(', ')})
                          </span>
                        )}
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
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notes Section */}
      {noteEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h2 className="text-lg font-semibold text-foreground">
              Notes: <span className="text-muted-foreground font-normal">({noteEvents.length})</span>
            </h2>
          </div>
          
          <Card className="bg-card">
            <CardContent className="p-0 divide-y">
              {noteEvents.map((event) => (
                <div key={event.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-muted-foreground">
                        {format(parseISO(event.job_date), 'MMM d')}
                      </span>
                      <span className="font-medium">{event.event_title || 'Note'}</span>
                      {event.notes && (
                        <span className="text-sm text-muted-foreground">- {event.notes}</span>
                      )}
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
