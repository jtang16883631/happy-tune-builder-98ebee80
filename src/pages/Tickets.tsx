import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllScheduleEvents, useTeamMembers, ScheduleEvent } from '@/hooks/useScheduleEvents';
import { useLiveTracker, STAGE_CONFIG } from '@/hooks/useLiveTracker';
import { format } from 'date-fns';
import { Search, Ticket, Loader2, ArrowLeft, Printer, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TicketDetail } from '@/components/tickets/TicketDetail';

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

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
  const getTrackerJob = (ticketId: string) => {
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
  };

  const handleBack = () => {
    setSelectedEvent(null);
  };

  // If a ticket is selected, show the detail view
  if (selectedEvent) {
    return (
      <AppLayout fullWidth>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Tickets
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {getTrackerJob(selectedEvent.id) && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/live-tracker')}
                className="gap-2"
              >
                <Radio className="h-4 w-4" />
                View in Tracker
              </Button>
            )}
          </div>
          <TicketDetail 
            event={selectedEvent} 
            teamMembers={teamMembers}
            trackerJob={getTrackerJob(selectedEvent.id)}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Ticket className="h-6 w-6" />
              Job Tickets
            </h1>
            <p className="text-muted-foreground">
              View all scheduled work tickets
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
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Invoice #</TableHead>
                  <TableHead className="font-semibold">Facility Name</TableHead>
                  <TableHead className="font-semibold">Job Date</TableHead>
                  <TableHead className="font-semibold">Address</TableHead>
                  <TableHead className="font-semibold">Team</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
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
                      <TableCell className="font-mono font-bold text-primary">
                        {ticket.invoice_number}
                      </TableCell>
                      <TableCell className="font-medium">
                        {ticket.client_name}
                      </TableCell>
                      <TableCell>
                        {format(new Date(ticket.job_date), 'M/d/yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[250px] truncate">
                        {ticket.address || '-'}
                      </TableCell>
                      <TableCell>
                        {teamNames.length > 0 ? teamNames.join(', ') : '-'}
                      </TableCell>
                      <TableCell>
                        {trackerJob ? (
                          <Badge 
                            className={cn(
                              "text-xs text-white",
                              STAGE_CONFIG[trackerJob.stage].color
                            )}
                          >
                            {STAGE_CONFIG[trackerJob.stage].label.substring(0, 20)}...
                          </Badge>
                        ) : (
                          <Badge variant="outline">Scheduled</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}