import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAllScheduleEvents, useTeamMembers, ScheduleEvent } from '@/hooks/useScheduleEvents';
import { useLiveTracker, STAGE_CONFIG } from '@/hooks/useLiveTracker';
import { useCloudTemplates } from '@/hooks/useCloudTemplates';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format, getYear } from 'date-fns';
import { 
  Search, Loader2, ArrowLeft, Printer, Radio, Database, Calendar, 
  Upload, FileText, CheckCircle, XCircle, FileSpreadsheet 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import * as XLSX from 'xlsx';

interface ImportProgress {
  status: 'idle' | 'parsing' | 'importing' | 'complete' | 'error';
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
  currentGroup?: string;
}

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { roles } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const ticketInputRef = useRef<HTMLInputElement>(null);

  const { data: allEvents = [], isLoading: eventsLoading } = useAllScheduleEvents();
  const { data: teamMembers = [] } = useTeamMembers();
  const { jobs } = useLiveTracker();
  const { importTicketOnly, refetch: refetchTemplates } = useCloudTemplates();

  const [importProgress, setImportProgress] = useState<ImportProgress>({
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  });

  const hasRole = roles.length > 0;

  // Filter to only show work events with invoice numbers (tickets)
  const tickets = allEvents.filter(
    (e) => e.event_type === 'work' && e.invoice_number
  );

  // Get unique years from tickets
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    tickets.forEach((ticket) => {
      const year = getYear(new Date(ticket.job_date));
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [tickets]);

  // Set default year to current year if available
  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === 'all') {
      const currentYear = new Date().getFullYear();
      if (availableYears.includes(currentYear)) {
        setSelectedYear(String(currentYear));
      } else {
        setSelectedYear(String(availableYears[0]));
      }
    }
  }, [availableYears, selectedYear]);

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

  // Filter tickets by search and year
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (selectedYear !== 'all') {
        const ticketYear = getYear(new Date(ticket.job_date));
        if (ticketYear !== parseInt(selectedYear)) return false;
      }

      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        ticket.invoice_number?.toLowerCase().includes(query) ||
        ticket.client_name?.toLowerCase().includes(query) ||
        ticket.address?.toLowerCase().includes(query)
      );
    });
  }, [tickets, selectedYear, searchQuery]);

  // Get ticket counts by year
  const ticketCountsByYear = useMemo(() => {
    const counts: Record<number, number> = {};
    tickets.forEach((ticket) => {
      const year = getYear(new Date(ticket.job_date));
      counts[year] = (counts[year] || 0) + 1;
    });
    return counts;
  }, [tickets]);

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

  // Excel parsing helper
  const parseExcelFile = (file: File): Promise<{ rows: any[]; rawData: any[][] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
          const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
          resolve({ rows: jsonData, rawData });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const extractInvNumber = (fileName: string): string | null => {
    const s = fileName.toLowerCase();
    const m1 = s.match(/(?:\binv\b|invoice)[^\d]{0,5}(\d{6,12})/i);
    if (m1?.[1]) return m1[1];
    const m2 = fileName.match(/\d{7,9}/g);
    if (m2?.length) return m2[0];
    const matches = fileName.match(/\d{6,12}/g);
    if (!matches?.length) return null;
    return matches.sort((a, b) => Math.abs(a.length - 8) - Math.abs(b.length - 8))[0];
  };

  const isTicketFile = (fileName: string): boolean => {
    const s = fileName.toLowerCase();
    return (
      s.includes('jobticket') ||
      s.includes('job ticket') ||
      s.includes('job_ticket') ||
      s.includes('jobtickettemplate') ||
      s.includes('job ticket template') ||
      s.startsWith('jc ') ||
      s.startsWith('jt ') ||
      s.startsWith('bljc ') ||
      s.includes('bljc') ||
      s.includes(' ticket')
    );
  };

  // Handle tickets-only import
  const handleTicketsImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      await supabase.auth.refreshSession();
    } catch {
      // ignore
    }

    const ticketFiles = Array.from(files).filter((file) => isTicketFile(file.name));

    if (ticketFiles.length === 0) {
      toast({
        title: 'No ticket files found',
        description: 'Make sure to upload job ticket files (e.g., files with "jobticket" or "ticket" in the name).',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Import started',
      description: `Detected ${ticketFiles.length} ticket file(s). Importing now...`,
    });

    flushSync(() => {
      setImportProgress({
        status: 'parsing',
        total: ticketFiles.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [],
        currentGroup: ticketFiles[0]?.name,
      });
    });

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < ticketFiles.length; i++) {
      const file = ticketFiles[i];
      const inv = extractInvNumber(file.name) || file.name.replace(/\.[^/.]+$/, '');

      flushSync(() => {
        setImportProgress((prev) => ({
          ...prev,
          status: 'importing',
          processed: i,
          currentGroup: inv,
        }));
      });

      await new Promise((r) => setTimeout(r, 0));

      try {
        const { data } = await supabase.auth.refreshSession();
        if (!data.session) {
          throw new Error('Session expired, please re-login');
        }
      } catch (e: any) {
        failed++;
        errors.push(`${inv}: ${e?.message || 'Session refresh failed'}`);
        flushSync(() => {
          setImportProgress((prev) => ({
            ...prev,
            processed: i + 1,
            successful,
            failed,
            errors: errors.slice(-5),
          }));
        });
        continue;
      }

      try {
        const jobTicketData = await parseExcelFile(file);
        const result = await importTicketOnly(inv, jobTicketData.rawData, file.name, true);

        if (result.success) {
          successful++;
        } else {
          failed++;
          errors.push(`${inv}: ${result.error}`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${inv}: ${err.message}`);
      }

      flushSync(() => {
        setImportProgress((prev) => ({
          ...prev,
          processed: i + 1,
          successful,
          failed,
          errors: errors.slice(-5),
        }));
      });
    }

    try {
      await refetchTemplates();
    } catch (err: any) {
      console.error('Refetch templates failed:', err);
    }

    flushSync(() => {
      setImportProgress((prev) => ({
        ...prev,
        status: failed > 0 ? 'error' : 'complete',
        currentGroup: undefined,
      }));
    });

    toast({
      title: failed > 0 ? 'Import finished with errors' : 'Import complete',
      description: `${successful} templates created, ${failed} failed.`,
      ...(failed > 0 ? { variant: 'destructive' as const } : {}),
    });

    if (ticketInputRef.current) {
      ticketInputRef.current.value = '';
    }
  };

  const progressPercent = (() => {
    if (importProgress.total <= 0) return 0;
    return Math.round((importProgress.processed / importProgress.total) * 100);
  })();

  // If a ticket is selected, show the detail view
  if (selectedEvent) {
    return (
      <AppLayout fullWidth>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Database
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
        {/* Hidden file input */}
        <input
          ref={ticketInputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv"
          onChange={handleTicketsImport}
          className="hidden"
          multiple
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Database className="h-6 w-6" />
              Ticket Database
            </h1>
            <p className="text-muted-foreground">
              All scheduled work tickets organized by year
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasRole && (
              <Button onClick={() => ticketInputRef.current?.click()} variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Upload Tickets
              </Button>
            )}
            {availableYears.map((year) => (
              <Badge 
                key={year} 
                variant={selectedYear === String(year) ? "default" : "secondary"} 
                className="text-sm cursor-pointer"
                onClick={() => setSelectedYear(String(year))}
              >
                {year}: {ticketCountsByYear[year] || 0}
              </Badge>
            ))}
          </div>
        </div>

        {/* Import Progress */}
        {importProgress.status !== 'idle' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {importProgress.status === 'complete' || importProgress.status === 'error'
                    ? 'Finished'
                    : `Processing: ${importProgress.currentGroup || '...'}`}
                </span>
                <span>
                  {importProgress.processed} / {importProgress.total}
                </span>
              </div>

              {(importProgress.status === 'complete' || importProgress.status === 'error') && (
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>{importProgress.successful} succeeded</span>
                  </div>
                  {importProgress.failed > 0 && (
                    <div className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-4 w-4" />
                      <span>{importProgress.failed} failed</span>
                    </div>
                  )}
                </div>
              )}

              {importProgress.errors.length > 0 && (
                <div className="text-xs text-destructive space-y-1 max-h-24 overflow-y-auto">
                  {importProgress.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              {(importProgress.status === 'complete' || importProgress.status === 'error') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setImportProgress({
                      status: 'idle',
                      total: 0,
                      processed: 0,
                      successful: 0,
                      failed: 0,
                      errors: [],
                    })
                  }
                >
                  Dismiss
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Card (when no tickets) */}
        {hasRole && tickets.length === 0 && importProgress.status === 'idle' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Historical Tickets
              </CardTitle>
              <CardDescription>
                Import job ticket Excel files to build your ticket database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h4 className="font-medium mb-2">Import Job Tickets</h4>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Upload Excel files containing job tickets. Files should have "jobticket" or "ticket" in the filename.
                </p>
                <Button onClick={() => ticketInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Select Ticket Files
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        {tickets.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year} ({ticketCountsByYear[year] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice, client, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Results count */}
            <Badge variant="outline" className="text-sm self-center">
              {filteredTickets.length} tickets
            </Badge>
          </div>
        )}

        {/* Tickets Table */}
        {eventsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTickets.length === 0 && tickets.length > 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No tickets match your filters.
          </div>
        ) : filteredTickets.length > 0 ? (
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
        ) : null}
      </div>
    </AppLayout>
  );
}
