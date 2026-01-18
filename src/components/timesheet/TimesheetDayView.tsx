import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Plus, Clock } from "lucide-react";

interface TimesheetEntry {
  id: string;
  user_id: string;
  team_member_id: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  break_minutes: number | null;
  client_name: string | null;
  job_id: string | null;
  notes: string | null;
  status: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  color: string | null;
}

interface TimesheetDayViewProps {
  entries: TimesheetEntry[];
  teamMembers: TeamMember[];
  onEdit: (entry: TimesheetEntry) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function TimesheetDayView({
  entries,
  teamMembers,
  onEdit,
  onDelete,
  onAdd,
}: TimesheetDayViewProps) {
  const getTeamMemberName = (id: string | null) => {
    if (!id) return null;
    const member = teamMembers.find((m) => m.id === id);
    return member?.name || null;
  };

  const getTeamMemberColor = (id: string | null) => {
    if (!id) return "#6B7280";
    const member = teamMembers.find((m) => m.id === id);
    return member?.color || "#6B7280";
  };

  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_worked), 0);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground mb-4">No time entries for today</p>
        <Button onClick={onAdd} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Add First Entry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <span className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
        <span className="font-medium text-primary">
          Total: {totalHours.toFixed(1)} hours
        </span>
      </div>

      {/* Entry list */}
      <div className="space-y-3">
        {entries.map((entry) => {
          const memberName = getTeamMemberName(entry.team_member_id);
          const memberColor = getTeamMemberColor(entry.team_member_id);

          return (
            <div
              key={entry.id}
              className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {/* Time badge */}
                    <div className="flex items-center gap-1 text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                      <Clock className="h-3 w-3" />
                      {entry.start_time && entry.end_time ? (
                        <span>
                          {entry.start_time} - {entry.end_time}
                        </span>
                      ) : (
                        <span>{entry.hours_worked}h</span>
                      )}
                    </div>

                    {/* Hours */}
                    <span className="font-semibold text-lg">
                      {Number(entry.hours_worked).toFixed(1)} hours
                    </span>
                  </div>

                  {/* Client/Project */}
                  {entry.client_name && (
                    <div className="text-sm font-medium mb-1">
                      {entry.client_name}
                    </div>
                  )}

                  {/* Team member */}
                  {memberName && (
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: memberColor }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {memberName}
                      </span>
                    </div>
                  )}

                  {/* Break time */}
                  {entry.break_minutes && entry.break_minutes > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Break: {entry.break_minutes} min
                    </div>
                  )}

                  {/* Notes */}
                  {entry.notes && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {entry.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(entry)}
                    className="h-8 w-8"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(entry.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}