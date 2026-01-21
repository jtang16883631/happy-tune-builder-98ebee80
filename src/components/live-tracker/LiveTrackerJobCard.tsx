import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { LiveTrackerJob, STAGE_CONFIG, JobWorkflowStage } from '@/hooks/useLiveTracker';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Clock, 
  AlertTriangle,
  ChevronRight,
  History,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveTrackerJobCardProps {
  job: LiveTrackerJob;
  isOverdue: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onQuickAdvance: (stage: JobWorkflowStage) => void;
  isDragging?: boolean;
}

export function LiveTrackerJobCard({
  job,
  isOverdue,
  onEdit,
  onDelete,
  onViewHistory,
  onQuickAdvance,
  isDragging,
}: LiveTrackerJobCardProps) {
  const navigate = useNavigate();
  const daysInStage = job.stage_changed_at 
    ? differenceInDays(new Date(), new Date(job.stage_changed_at))
    : 0;

  const getNextStage = (): JobWorkflowStage | null => {
    const stages: JobWorkflowStage[] = [
      'making_price_files',
      'pricing_complete',
      'files_built',
      'needs_automation',
      'ready_for_review',
      'out_on_draft',
      'in_for_updates',
      'out_for_final',
      'to_be_invoiced',
      'final_approved',
    ];
    const currentIndex = stages.indexOf(job.stage);
    if (currentIndex < stages.length - 1) {
      return stages[currentIndex + 1];
    }
    return null;
  };

  const nextStage = getNextStage();

  return (
    <Card 
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 shadow-lg scale-105",
        isOverdue && "border-destructive bg-destructive/5"
      )}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {job.promise_invoice_number && (
              <p className="text-xs font-mono text-muted-foreground truncate">
                {job.promise_invoice_number}
              </p>
            )}
            <h4 className="font-medium text-sm truncate">{job.job_name}</h4>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewHistory}>
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              {nextStage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Quick Move</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onQuickAdvance(nextStage)}>
                    <ChevronRight className="h-4 w-4 mr-2" />
                    Move to {STAGE_CONFIG[nextStage].label.substring(0, 20)}...
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Details */}
        <div className="flex flex-wrap gap-1">
          {job.schedule_job_id && (
            <Badge 
              variant="outline" 
              className="text-[10px] border-primary/50 text-primary cursor-pointer hover:bg-primary/10 gap-0.5"
              onClick={() => navigate('/schedule')}
            >
              <CalendarDays className="h-2.5 w-2.5" />
              Scheduled
            </Badge>
          )}
          {job.group_name && (
            <Badge variant="secondary" className="text-xs">
              {job.group_name}
            </Badge>
          )}
          {job.job_number && (
            <Badge variant="outline" className="text-xs font-mono">
              #{job.job_number}
            </Badge>
          )}
        </div>

        {/* Template/Ticket info */}
        {(job.template_done || job.ticket_done) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {job.template_done && <p className="truncate">Template: {job.template_done}</p>}
            {job.ticket_done && <p className="truncate">Ticket: {job.ticket_done}</p>}
          </div>
        )}

        {/* Automation Notes */}
        {job.automation_notes && (
          <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded p-1.5">
            {job.automation_notes}
          </p>
        )}

        {/* Footer with time indicator */}
        <div className="flex items-center justify-between pt-1 border-t">
          <div className={cn(
            "flex items-center gap-1 text-xs",
            isOverdue ? "text-destructive" : "text-muted-foreground"
          )}>
            {isOverdue ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            <span>{daysInStage}d in stage</span>
          </div>
          
          {job.master_review_by && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {job.master_review_by}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
