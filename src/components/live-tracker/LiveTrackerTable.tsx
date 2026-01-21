import { useNavigate } from 'react-router-dom';
import { LiveTrackerJob, STAGE_CONFIG, STAGE_ORDER, JobWorkflowStage } from '@/hooks/useLiveTracker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, History, AlertTriangle, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface LiveTrackerTableProps {
  jobs: LiveTrackerJob[];
  onEditJob: (job: LiveTrackerJob) => void;
  onDeleteJob: (job: LiveTrackerJob) => void;
  onViewHistory: (job: LiveTrackerJob) => void;
  isJobOverdue: (job: LiveTrackerJob) => boolean;
}

export function LiveTrackerTable({
  jobs,
  onEditJob,
  onDeleteJob,
  onViewHistory,
  isJobOverdue,
}: LiveTrackerTableProps) {
  const navigate = useNavigate();
  // Group jobs by stage
  const groupedJobs = STAGE_ORDER.map((stage) => ({
    stage,
    config: STAGE_CONFIG[stage],
    jobs: jobs.filter((job) => job.stage === stage),
  })).filter((group) => group.jobs.length > 0);

  return (
    <div className="space-y-6">
      {groupedJobs.map((group) => (
        <div key={group.stage} className="border rounded-lg overflow-hidden">
          {/* Stage Header */}
          <div className={cn("px-4 py-2 text-white font-semibold", group.config.color)}>
            {group.config.label} ({group.jobs.length})
          </div>

          {/* Jobs Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Invoice #</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead className="w-[80px]">PTF</TableHead>
                <TableHead className="w-[100px]">Job #</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Job Name</TableHead>
                <TableHead>Automation Notes</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="w-[100px]">Draft Out</TableHead>
                <TableHead className="w-[100px]">Updates</TableHead>
                <TableHead className="w-[100px]">Final</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.jobs.map((job) => {
                const overdue = isJobOverdue(job);
                return (
                  <TableRow 
                    key={job.id}
                    className={cn(overdue && "bg-destructive/5")}
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        {overdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {job.promise_invoice_number || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">
                      {job.template_done || '-'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">
                      {job.ticket_done || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.ptf_sum || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.job_number || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.group_name && (
                        <Badge variant="secondary" className="text-xs">
                          {job.group_name}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{job.job_name}</span>
                        {job.schedule_job_id && (
                          <Badge 
                            variant="outline" 
                            className="text-[9px] border-primary/50 text-primary cursor-pointer hover:bg-primary/10 shrink-0 px-1 py-0"
                            onClick={() => navigate('/schedule')}
                          >
                            <CalendarDays className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                      {job.automation_notes || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.master_review_by || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.draft_out_date ? format(new Date(job.draft_out_date), 'MM/dd/yy') : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.updates_date ? format(new Date(job.updates_date), 'MM/dd/yy') : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.closed_final_date ? format(new Date(job.closed_final_date), 'MM/dd/yy') : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditJob(job)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onViewHistory(job)}>
                            <History className="h-4 w-4 mr-2" />
                            View History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => onDeleteJob(job)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}

      {groupedJobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No jobs found
        </div>
      )}
    </div>
  );
}
