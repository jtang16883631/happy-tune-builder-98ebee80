import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
  subWeeks,
  getDay,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Plus,
  Clock,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileText,
  Send,
  Save,
  BarChart3,
  TrendingUp,
  Coffee,
} from "lucide-react";
import { TimesheetEntryDialog } from "@/components/timesheet/TimesheetEntryDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  color: string | null;
}

const WORK_TYPES = [
  { value: "hospital", label: "Hospital", color: "bg-blue-500" },
  { value: "office", label: "Office", color: "bg-green-500" },
  { value: "travel", label: "Travel Only Day", color: "bg-orange-500" },
  { value: "lunch", label: "Lunch", color: "bg-yellow-500" },
  { value: "off_own", label: "Off On Own", color: "bg-gray-500" },
  { value: "off_road", label: "Off On Road", color: "bg-purple-500" },
  { value: "vacation", label: "Vacation", color: "bg-pink-500" },
  { value: "holiday", label: "Company Holiday", color: "bg-red-500" },
];

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Timesheet() {
  const [weekEndingDate, setWeekEndingDate] = useState<Date>(() => {
    // Get the upcoming Saturday (or today if it's Saturday)
    const today = new Date();
    const dayOfWeek = getDay(today);
    const daysUntilSaturday = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    return saturday;
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [selectedDayForAdd, setSelectedDayForAdd] = useState<Date>(new Date());
  const [timesheetStatus, setTimesheetStatus] = useState<"draft" | "submitted">("draft");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Calculate week range (Sunday to Saturday with Saturday as the ending date)
  const weekStart = startOfWeek(weekEndingDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(weekEndingDate, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, color")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as TeamMember[];
    },
  });

  // Fetch timesheet entries for the week
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["timesheet-entries", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .gte("work_date", format(weekStart, "yyyy-MM-dd"))
        .lte("work_date", format(weekEnd, "yyyy-MM-dd"))
        .order("work_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data as TimesheetEntry[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timesheet_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-entries"] });
      toast({ title: "Deleted", description: "Entry removed successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    const regularHours = entries.reduce((sum, e) => {
      const hours = Number(e.hours_worked);
      return sum + Math.min(hours, 8);
    }, 0);

    const overtimeHours = entries.reduce((sum, e) => {
      const hours = Number(e.hours_worked);
      return sum + Math.max(0, hours - 8);
    }, 0);

    const totalHours = regularHours + overtimeHours;
    const workDays = new Set(entries.map((e) => e.work_date)).size;
    const avgHoursPerSheet = workDays > 0 ? totalHours / workDays : 0;

    return { regularHours, overtimeHours, totalHours, workDays, avgHoursPerSheet };
  }, [entries]);

  // Chart data
  const chartData = useMemo(() => {
    return daysInWeek.map((day) => {
      const dayEntries = entries.filter((e) => isSameDay(new Date(e.work_date), day));
      const regularHours = dayEntries.reduce((sum, e) => sum + Math.min(Number(e.hours_worked), 8), 0);
      const overtimeHours = dayEntries.reduce((sum, e) => sum + Math.max(0, Number(e.hours_worked) - 8), 0);

      return {
        name: format(day, "EEE", { locale: zhCN }),
        date: format(day, "MM/dd"),
        Regular: regularHours,
        Overtime: overtimeHours,
      };
    });
  }, [daysInWeek, entries]);

  const getEntriesForDay = (date: Date) => {
    return entries.filter((entry) => isSameDay(new Date(entry.work_date), date));
  };

  const handleAddEntry = (day: Date) => {
    setSelectedDayForAdd(day);
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const handleEditEntry = (entry: TimesheetEntry) => {
    setEditingEntry(entry);
    setSelectedDayForAdd(new Date(entry.work_date));
    setDialogOpen(true);
  };

  const handleDeleteEntry = (id: string) => {
    deleteMutation.mutate(id);
  };

  const navigateWeek = (direction: "prev" | "next") => {
    setWeekEndingDate((prev) =>
      direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1)
    );
  };

  const handleSaveChanges = () => {
    toast({ title: "Saved", description: "Your timesheet has been saved as draft" });
  };

  const handleSubmitTimesheet = () => {
    setTimesheetStatus("submitted");
    toast({ title: "Submitted", description: "Your timesheet has been submitted for approval" });
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Timesheets</h1>
            <p className="text-muted-foreground">Weekly Timesheet Summary</p>
          </div>
        </div>

        {/* Stats Cards and Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Clock className="h-4 w-4" />
                  Regular Hours
                </div>
                <div className="text-2xl font-bold">{stats.regularHours.toFixed(1)}</div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-destructive">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Overtime Hours
                </div>
                <div className="text-2xl font-bold">{stats.overtimeHours.toFixed(1)}</div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-accent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BarChart3 className="h-4 w-4" />
                  Total Hours
                </div>
                <div className="text-2xl font-bold">{stats.totalHours.toFixed(1)}</div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-warning">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Coffee className="h-4 w-4" />
                  Avg Hours / Sheet
                </div>
                <div className="text-2xl font-bold">{stats.avgHoursPerSheet.toFixed(1)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Weekly Hours Overview</CardTitle>
            </CardHeader>
            <CardContent className="h-[180px]">
              {entries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Regular" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Overtime" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Week Selector and Main Content */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Select Payroll Ending Date</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(weekEndingDate, "MM/dd/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={weekEndingDate}
                        onSelect={(date) => date && setWeekEndingDate(date)}
                        locale={zhCN}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => navigateWeek("prev")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => navigateWeek("next")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  Week Ending: {format(weekEnd, "MMMM do, yyyy")}
                </span>
                <Badge variant={timesheetStatus === "draft" ? "secondary" : "default"}>
                  Status: {timesheetStatus === "draft" ? "Draft" : "Submitted"}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium w-[140px]">Day</th>
                      <th className="text-left p-4 font-medium w-[120px]">Start</th>
                      <th className="text-left p-4 font-medium w-[120px]">Stop</th>
                      <th className="text-left p-4 font-medium">Work Description</th>
                      <th className="text-left p-4 font-medium w-[200px]">Notes</th>
                      <th className="text-right p-4 font-medium w-[100px]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysInWeek.map((day, index) => {
                      const dayEntries = getEntriesForDay(day);
                      const dayName = DAY_NAMES[index];
                      const dateStr = format(day, "MM/dd/yyyy");

                      if (dayEntries.length === 0) {
                        return (
                          <tr key={day.toISOString()} className="border-b hover:bg-muted/30">
                            <td className="p-4">
                              <div className="font-medium">{dayName}</div>
                              <div className="text-xs text-muted-foreground">{dateStr}</div>
                            </td>
                            <td className="p-4 text-muted-foreground">--:-- --</td>
                            <td className="p-4 text-muted-foreground">--:-- --</td>
                            <td className="p-4 text-muted-foreground">-</td>
                            <td className="p-4"></td>
                            <td className="p-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                                onClick={() => handleAddEntry(day)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {dayName}
                              </Button>
                            </td>
                          </tr>
                        );
                      }

                      return dayEntries.map((entry, entryIndex) => (
                        <tr
                          key={entry.id}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => handleEditEntry(entry)}
                        >
                          {entryIndex === 0 && (
                            <td className="p-4" rowSpan={dayEntries.length}>
                              <div className="font-medium">{dayName}</div>
                              <div className="text-xs text-muted-foreground">{dateStr}</div>
                              {dayEntries.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 text-xs text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddEntry(day);
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </Button>
                              )}
                            </td>
                          )}
                          <td className="p-4">
                            <Badge variant="outline" className="font-mono">
                              {entry.start_time || "--:--"}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="font-mono">
                              {entry.end_time || "--:--"}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{entry.client_name || "No description"}</span>
                              <Badge variant="secondary" className="text-xs">
                                {entry.hours_worked}h
                              </Badge>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground max-w-[200px] truncate">
                            {entry.notes || "-"}
                          </td>
                          <td className="p-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEntry(entry.id);
                              }}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSaveChanges} variant="default" className="gap-2">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
          <Button
            onClick={handleSubmitTimesheet}
            variant="outline"
            className="gap-2"
            disabled={timesheetStatus === "submitted"}
          >
            <Send className="h-4 w-4" />
            Submit Timesheet
          </Button>
        </div>
      </div>

      <TimesheetEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        selectedDate={selectedDayForAdd}
        teamMembers={teamMembers}
      />
    </AppLayout>
  );
}