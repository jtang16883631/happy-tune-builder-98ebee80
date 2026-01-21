import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAllScheduleEvents, useTeamMembers, ScheduleEvent } from '@/hooks/useScheduleEvents';
import { useLiveTracker, LiveTrackerJob, STAGE_CONFIG } from '@/hooks/useLiveTracker';
import { format } from 'date-fns';
import { Search, Ticket, Radio, CalendarDays, Loader2, MapPin, Phone, Mail, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: allEvents = [], isLoading: eventsLoading } = useAllScheduleEvents();
  const { data: teamMembers = [] } = useTeamMembers();
  const { jobs } = useLiveTracker();

  // Filter to only show work events with invoice numbers (tickets)
  const tickets = allEvents.filter(
    (e) => e.event_type === 'work' && e.invoice_number
  );

  // Handle direct link via URL parameter
  useEffect(() => {
    const ticketId = searchParams.get('id');
    if (ticketId && tickets.length > 0) {
      const ticket = tickets.find((t) => t.id === ticketId);
      if (ticket) {
        setSelectedEvent(ticket);
        setDetailOpen(true);
        setSearchParams({});
      }
    }
  }, [searchParams, tickets, setSearchParams]);

  // Filter tickets by search
  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.invoice_number?.toLowerCase().includes(query) ||
      ticket.client_name?.toLowerCase().includes(query) ||
      ticket.address?.toLowerCase().includes(query)
    );
  });

  // Get linked tracker job for a ticket
  const getTrackerJob = (ticketId: string): LiveTrackerJob | undefined => {
    return jobs?.find((job) => job.schedule_job_id === ticketId);
  };

  // Get team member names
  const getTeamMemberNames = (memberIds: string[] | null): string[] => {
    if (!memberIds) return [];
    return memberIds
      .map((id) => teamMembers.find((m) => m.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const handleViewTicket = (ticket: ScheduleEvent) => {
    setSelectedEvent(ticket);
    setDetailOpen(true);
  };

  const handleGoToTracker = (jobId: string) => {
    navigate(`/live-tracker`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Ticket className="h-6 w-6" />
              Tickets
            </h1>
            <p className="text-muted-foreground">
              View all scheduled work tickets with invoice numbers
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {tickets.length} tickets
          </Badge>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice, client, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tickets Table */}
        {eventsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {tickets.length === 0
              ? 'No tickets found. Create a work event with an invoice number in Schedule Hub.'
              : 'No tickets match your search.'}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Tracker Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => {
                  const trackerJob = getTrackerJob(ticket.id);
                  const teamNames = getTeamMemberNames(ticket.team_members);
                  
                  return (
                    <TableRow 
                      key={ticket.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewTicket(ticket)}
                    >
                      <TableCell className="font-mono font-medium">
                        {ticket.invoice_number}
                      </TableCell>
                      <TableCell className="font-medium">
                        {ticket.client_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(ticket.job_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {ticket.address || '-'}
                      </TableCell>
                      <TableCell>
                        {teamNames.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{teamNames.length}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {trackerJob ? (
                          <Badge 
                            className={cn(
                              "text-xs text-white",
                              STAGE_CONFIG[trackerJob.stage].color
                            )}
                          >
                            {STAGE_CONFIG[trackerJob.stage].label.substring(0, 15)}...
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewTicket(ticket);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Ticket Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-6">
              {/* Invoice & Client */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Invoice Number</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-mono font-bold">{selectedEvent.invoice_number}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Client</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{selectedEvent.client_name}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Date & Time */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="font-medium">
                    {format(new Date(selectedEvent.job_date), 'EEEE, MMMM d, yyyy')}
                  </p>
                  {selectedEvent.start_time && (
                    <p className="text-muted-foreground">Start: {selectedEvent.start_time}</p>
                  )}
                </CardContent>
              </Card>

              {/* Location */}
              {selectedEvent.address && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{selectedEvent.address}</p>
                  </CardContent>
                </Card>
              )}

              {/* Contact Info */}
              {(selectedEvent.onsite_contact || selectedEvent.phone || selectedEvent.email_data_to) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Contact Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedEvent.onsite_contact && (
                      <p>Contact: {selectedEvent.onsite_contact}</p>
                    )}
                    {selectedEvent.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {selectedEvent.phone}
                      </p>
                    )}
                    {selectedEvent.email_data_to && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {selectedEvent.email_data_to}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Team Members */}
              {selectedEvent.team_members && selectedEvent.team_members.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Team Members
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {getTeamMemberNames(selectedEvent.team_members).map((name) => (
                        <Badge key={name} variant="secondary">{name}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {selectedEvent.special_notes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{selectedEvent.special_notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Linked Tracker Job */}
              {(() => {
                const trackerJob = getTrackerJob(selectedEvent.id);
                if (!trackerJob) return null;
                
                return (
                  <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        Live Tracker Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge 
                          className={cn(
                            "text-white",
                            STAGE_CONFIG[trackerJob.stage].color
                          )}
                        >
                          {STAGE_CONFIG[trackerJob.stage].label}
                        </Badge>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleGoToTracker(trackerJob.id)}
                        className="gap-2"
                      >
                        <Radio className="h-4 w-4" />
                        View in Live Tracker
                      </Button>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}