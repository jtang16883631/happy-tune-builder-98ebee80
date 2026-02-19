import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  LayoutGrid,
  Users,
  FileText,
  Copy,
  Loader2,
  RefreshCw,
  MoreHorizontal,
  Search,
  Upload,
} from 'lucide-react';
import { ScheduleBuilder } from '@/components/schedule/ScheduleBuilder';
import { ScheduleAgendaView } from '@/components/schedule/ScheduleAgendaView';
import { ScheduleCalendarView } from '@/components/schedule/ScheduleCalendarView';
import { ScheduleTypeView } from '@/components/schedule/ScheduleTypeView';
import { TeamMemberDialog } from '@/components/schedule/TeamMemberDialog';
import { BulkImportDialog } from '@/components/schedule/BulkImportDialog';
import {
  useScheduleEvents,
  useAllScheduleEvents,
  useTeamMembers,
  useDeleteScheduleEvent,
  ScheduleEvent,
} from '@/hooks/useScheduleEvents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';


export default function ScheduleHub() {
  const { roles, user } = useAuth();
  const isAuditor = roles.includes('auditor') && !roles.includes('owner') && !roles.includes('developer') && !roles.includes('coordinator') && !roles.includes('office_admin');

  const [searchParams, setSearchParams] = useSearchParams();
  const [viewTab, setViewTab] = useState<'agenda' | 'calendar' | 'type' | 'mine'>('agenda');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [myScheduleMonth, setMyScheduleMonth] = useState(() => startOfMonth(new Date()));
  const [isExporting, setIsExporting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const weekEnd = endOfWeek(weekStart);

  const { data: weekEvents = [], isLoading, refetch } = useScheduleEvents(weekStart, weekEnd);
  const { data: allEvents = [] } = useAllScheduleEvents();
  const { data: teamMembers = [] } = useTeamMembers();
  const deleteMutation = useDeleteScheduleEvent();

  // Handle direct link to a specific job via URL parameter
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (jobId && allEvents.length > 0) {
      const event = allEvents.find((e) => e.id === jobId);
      if (event) {
        setEditingEvent(event);
        setBuilderOpen(true);
        // Clear the URL param after opening
        setSearchParams({});
      }
    }
  }, [searchParams, allEvents, setSearchParams]);

  const handleEditEvent = (event: ScheduleEvent) => {
    if (isAuditor) return; // view-only for auditors
    setEditingEvent(event);
    setBuilderOpen(true);
  };

  const handleDeleteEvent = (id: string) => {
    if (isAuditor) return; // view-only for auditors
    if (confirm('Delete this event?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSelectDate = (date: Date) => {
    if (isAuditor) return; // view-only for auditors
    setEditingEvent(null);
    setBuilderOpen(true);
  };

  const getTeamMemberNames = (memberIds: string[] | null): string[] => {
    if (!memberIds) return [];
    return memberIds
      .map((id) => teamMembers.find((m) => m.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const handleExport = async (copyToClipboard: boolean = false) => {
    setIsExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Please log in to export', variant: 'destructive' });
        return;
      }

      const eventsToExport = viewTab === 'agenda' ? weekEvents : allEvents;
      const eventsWithNames = eventsToExport.map(event => ({
        ...event,
        team_member_names: getTeamMemberNames(event.team_members),
      }));

      const response = await supabase.functions.invoke('export-schedule-to-docs', {
        body: { 
          startDate: format(weekStart, 'yyyy-MM-dd'),
          endDate: format(weekEnd, 'yyyy-MM-dd'),
          events: eventsWithNames,
        }
      });

      if (response.error) {
        throw response.error;
      }

      if (copyToClipboard && response.data?.content) {
        await navigator.clipboard.writeText(response.data.content);
        toast({ title: 'Schedule copied to clipboard!', description: 'Paste into Google Docs or any text editor.' });
      } else if (response.data?.documentUrl) {
        window.open(response.data.documentUrl, '_blank');
        toast({ title: 'Schedule exported to Google Docs!' });
        setLastSyncTime(new Date());
      } else if (response.data?.content) {
        await navigator.clipboard.writeText(response.data.content);

        const serverMessage = typeof response.data?.message === 'string' ? response.data.message.trim() : '';
        const serverError = typeof response.data?.error === 'string' ? response.data.error.trim() : '';

        // If Google Docs export failed for reasons other than missing credentials,
        // surface the server-provided message instead of always blaming the key.
        const description =
          serverMessage ||
          (serverError ? 'Google Docs export failed (details in logs). Content copied to clipboard.' : undefined);

        toast({
          title: 'Schedule copied to clipboard',
          description: description,
        });

        if (serverError) {
          // Keep details out of the UI but available for debugging.
          console.error('Google Docs export error:', serverError);
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Export failed', description: 'Please try again', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({ title: 'Schedule refreshed' });
  };

  return (
    <AppLayout fullWidth>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
            <span className="text-2xl font-light text-muted-foreground">Hub</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Sync Status */}
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 text-muted-foreground text-xs"
              onClick={() => handleExport(false)}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Synced with Google Doc
              {lastSyncTime && (
                <span>({format(lastSyncTime, 'h:mm')}ago)</span>
              )}
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Search className="h-4 w-4" />
            </Button>
            
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background">
                  {!isAuditor && (
                    <DropdownMenuItem onClick={() => setBulkImportOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Import from Google Doc
                    </DropdownMenuItem>
                  )}
                  {!isAuditor && (
                    <DropdownMenuItem onClick={() => setTeamDialogOpen(true)}>
                      <Users className="h-4 w-4 mr-2" />
                      Manage Team
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleExport(true)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(false)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export to Google Docs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>

        {/* View Tabs */}
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as any)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <TabsList className="bg-muted/50 h-9">
              <TabsTrigger value="agenda" className="gap-1.5 text-xs data-[state=active]:bg-background px-3">
                <List className="h-3.5 w-3.5" />
                Agenda view
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5 text-xs data-[state=active]:bg-background px-3">
                <Calendar className="h-3.5 w-3.5" />
                Calendar view
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-1.5 text-xs data-[state=active]:bg-background px-3">
                <LayoutGrid className="h-3.5 w-3.5" />
                Type view
              </TabsTrigger>
              <TabsTrigger value="mine" className="gap-1.5 text-xs data-[state=active]:bg-background px-3">
                <Users className="h-3.5 w-3.5" />
                My Schedule
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 ml-auto">
              {/* Quick Actions */}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <Users className="h-3.5 w-3.5" />
                Sylon Nodes
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <LayoutGrid className="h-3.5 w-3.5" />
                Saw Columing
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refreshin
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* New Schedule Event button and Date Navigation */}
          <div className="flex items-center justify-between py-4 border-b">
            {!isAuditor ? (
              <Button 
                size="sm" 
                onClick={() => { setEditingEvent(null); setBuilderOpen(true); }}
                className="gap-1.5 text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                New Schedule Event
              </Button>
            ) : (
              <div />
            )}
            
            {viewTab === 'agenda' && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">
                  {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="agenda" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScheduleAgendaView
                events={weekEvents}
                teamMembers={teamMembers}
                startDate={weekStart}
                endDate={weekEnd}
                onEditEvent={handleEditEvent}
                onDeleteEvent={handleDeleteEvent}
              />
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <ScheduleCalendarView
              events={allEvents}
              teamMembers={teamMembers}
              onSelectDate={handleSelectDate}
              onEditEvent={handleEditEvent}
            />
          </TabsContent>

          <TabsContent value="type" className="mt-4">
            <ScheduleTypeView
              events={allEvents}
              teamMembers={teamMembers}
              onEditEvent={handleEditEvent}
              onDeleteEvent={handleDeleteEvent}
            />
          </TabsContent>

          <TabsContent value="mine" className="mt-4">
            {/* Month navigation for My Schedule */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMyScheduleMonth(subMonths(myScheduleMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{format(myScheduleMonth, 'MMMM yyyy')}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMyScheduleMonth(addMonths(myScheduleMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (() => {
              const monthStart = startOfMonth(myScheduleMonth);
              const monthEnd = endOfMonth(myScheduleMonth);
              const monthStartStr = format(monthStart, 'yyyy-MM-dd');
              const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
              const myEvents = allEvents.filter(e => {
                const isAssigned = user?.id && Array.isArray(e.team_members) && e.team_members.includes(user.id);
                if (!isAssigned) return false;
                const jobDate = e.job_date;
                const endDate = e.end_date || jobDate;
                return jobDate <= monthEndStr && endDate >= monthStartStr;
              });
              return myEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <Users className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No events assigned to you in {format(myScheduleMonth, 'MMMM yyyy')}.</p>
                </div>
              ) : (
                <ScheduleAgendaView
                  events={myEvents}
                  teamMembers={teamMembers}
                  startDate={monthStart}
                  endDate={monthEnd}
                  onEditEvent={handleEditEvent}
                  onDeleteEvent={handleDeleteEvent}
                  hideEmptyDays
                />
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>

      {!isAuditor && (
        <ScheduleBuilder
          event={editingEvent}
          open={builderOpen}
          onOpenChange={(open) => {
            setBuilderOpen(open);
            if (!open) {
              setEditingEvent(null);
            }
          }}
          teamMembers={teamMembers}
          defaultDate={weekStart}
        />
      )}

      {!isAuditor && (
        <TeamMemberDialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen} />
      )}
      
      {!isAuditor && (
        <BulkImportDialog 
          open={bulkImportOpen} 
          onOpenChange={setBulkImportOpen} 
          teamMembers={teamMembers}
        />
      )}
    </AppLayout>
  );
}
