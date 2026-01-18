import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingUp, Calendar } from "lucide-react";

interface TimesheetEntry {
  id: string;
  work_date: string;
  hours_worked: number;
  client_name: string | null;
}

interface TimesheetSummaryProps {
  entries: TimesheetEntry[];
  totalHours: number;
  viewMode: "day" | "week" | "month";
  dateRange: { start: Date; end: Date };
}

export function TimesheetSummary({
  entries,
  totalHours,
  viewMode,
  dateRange,
}: TimesheetSummaryProps) {
  // Calculate average hours per day
  const uniqueDays = new Set(entries.map((e) => e.work_date)).size;
  const avgHoursPerDay = uniqueDays > 0 ? totalHours / uniqueDays : 0;

  // Group by client
  const hoursByClient = entries.reduce((acc, entry) => {
    const client = entry.client_name || "Unspecified";
    acc[client] = (acc[client] || 0) + Number(entry.hours_worked);
    return acc;
  }, {} as Record<string, number>);

  const sortedClients = Object.entries(hoursByClient)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const viewModeLabels = {
    day: "Today",
    week: "This Week",
    month: "This Month",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {viewModeLabels[viewMode]} Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total hours */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Total Hours</p>
          </div>
        </div>

        {/* Average per day */}
        {viewMode !== "day" && uniqueDays > 0 && (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">{avgHoursPerDay.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Avg Hours/Day</p>
            </div>
          </div>
        )}

        {/* Work days */}
        {viewMode !== "day" && (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/50 rounded-lg">
              <Calendar className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">{uniqueDays}</p>
              <p className="text-xs text-muted-foreground">Work Days</p>
            </div>
          </div>
        )}

        {/* By client/project */}
        {sortedClients.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">By Client/Project</p>
            <div className="space-y-2">
              {sortedClients.map(([client, hours]) => {
                const percentage = (hours / totalHours) * 100;
                return (
                  <div key={client}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate max-w-[120px]">{client}</span>
                      <span className="font-medium">{hours.toFixed(1)}h</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}