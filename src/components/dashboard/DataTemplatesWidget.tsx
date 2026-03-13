import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineTemplates } from '@/hooks/useOfflineTemplates';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { Link } from 'react-router-dom';

export function DataTemplatesWidget({ userId }: { userId?: string }) {
  const { syncSelectedTemplates, isSyncing, syncedTemplateIds, syncProgress } = useOfflineTemplates();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const today = new Date();
  const weekLater = addDays(today, 7);

  // Fetch scheduled jobs for next 7 days assigned to user, with their invoice numbers
  const { data: upcomingJobs } = useQuery({
    queryKey: ['dashboard-upcoming-jobs-templates', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('id, client_name, job_date, invoice_number')
        .gte('job_date', format(today, 'yyyy-MM-dd'))
        .lte('job_date', format(weekLater, 'yyyy-MM-dd'))
        .eq('event_type', 'work')
        .contains('team_members', [userId!])
        .order('job_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // Fetch data templates matching these invoice numbers
  const invoiceNumbers = (upcomingJobs || [])
    .map(j => j.invoice_number)
    .filter((inv): inv is string => !!inv && inv.length > 0);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['dashboard-week-templates', invoiceNumbers],
    queryFn: async () => {
      if (invoiceNumbers.length === 0) return [];
      const { data, error } = await supabase
        .from('data_templates')
        .select('id, name, facility_name, inv_number, inv_date, status')
        .in('inv_number', invoiceNumbers);
      if (error) throw error;
      return data || [];
    },
    enabled: invoiceNumbers.length > 0,
    staleTime: 30000,
  });

  const syncedIds = syncedTemplateIds;

  const handleDownload = async (templateId: string) => {
    setDownloadingId(templateId);
    try {
      const result = await syncSelectedTemplates([templateId]);
      if (result.success && result.synced > 0) {
        toast.success('Template downloaded to device');
        if (result.error) toast.error(result.error);
      } else {
        toast.error(result.error || 'Download failed');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upcoming Templates
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/scan">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !templates || templates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No templates for upcoming week</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const isSynced = syncedIds.includes(t.id);
              const isDownloading = downloadingId === t.id;
              const job = upcomingJobs?.find(j => j.invoice_number === t.inv_number);

              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{t.facility_name || t.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t.inv_number && <span>#{t.inv_number}</span>}
                      {job && <span>• {format(new Date(job.job_date), 'MMM d')}</span>}
                    </div>
                  </div>
                  {isSynced ? (
                    <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      On Device
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(t.id)}
                      disabled={isSyncing || isDownloading}
                      className="shrink-0"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
            {isSyncing && syncProgress && syncProgress.status !== 'idle' && (
              <p className="text-xs text-muted-foreground text-center">
                Downloading {syncProgress.currentTemplate || '...'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
