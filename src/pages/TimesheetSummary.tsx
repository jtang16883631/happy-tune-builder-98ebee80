import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  RotateCcw,
  MessageSquare,
  Mail,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  format,
  subWeeks,
  addWeeks,
  parseISO,
  isWithinInterval,
  eachDayOfInterval,
} from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface TimesheetEntry {
  id: string;
  user_id: string;
  work_date: string;
  hours_worked: number;
  start_time: string | null;
  end_time: string | null;
  client_name: string | null;
  notes: string | null;
  status: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface EmployeeSummary {
  userId: string;
  name: string;
  email: string | null;
  totalHours: number;
  status: "submitted" | "unsubmitted";
  entries: TimesheetEntry[];
}

export default function TimesheetSummary() {
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"current" | "history">("current");
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectTargetUserId, setRejectTargetUserId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();

  // Calculate week dates based on offset
  const currentDate = useMemo(() => {
    const base = new Date();
    return selectedWeekOffset === 0
      ? base
      : selectedWeekOffset > 0
        ? addWeeks(base, selectedWeekOffset)
        : subWeeks(base, Math.abs(selectedWeekOffset));
  }, [selectedWeekOffset]);

  // Week runs Monday-Sunday
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  // Fetch all profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, first_name, last_name")
        .order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch timesheet entries for the selected week
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["timesheet-summary", weekStartStr, weekEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .gte("work_date", weekStartStr)
        .lte("work_date", weekEndStr);
      if (error) throw error;
      return data as TimesheetEntry[];
    },
  });

  // Build employee summaries
  const employeeSummaries = useMemo(() => {
    const summaryMap = new Map<string, EmployeeSummary>();

    // Initialize all profiles
    profiles.forEach((profile) => {
      const name =
        profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        profile.email ||
        "Unknown";
      summaryMap.set(profile.id, {
        userId: profile.id,
        name,
        email: profile.email,
        totalHours: 0,
        status: "unsubmitted",
        entries: [],
      });
    });

    // Aggregate entries by user
    const entriesByUser = new Map<string, TimesheetEntry[]>();
    entries.forEach((entry) => {
      const userEntries = entriesByUser.get(entry.user_id) || [];
      userEntries.push(entry);
      entriesByUser.set(entry.user_id, userEntries);
    });

    // Process each user's entries
    entriesByUser.forEach((userEntries, userId) => {
      const summary = summaryMap.get(userId);
      if (summary) {
        summary.entries = userEntries;
        summary.totalHours = userEntries.reduce((sum, e) => sum + (Number(e.hours_worked) || 0), 0);
        // Check if ALL entries are submitted (not just any)
        const allSubmitted = userEntries.length > 0 && userEntries.every(e => e.status === "submitted");
        summary.status = allSubmitted ? "submitted" : "unsubmitted";
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [profiles, entries]);

  // Stats
  const totalEmployees = employeeSummaries.length;
  const submittedCount = employeeSummaries.filter(
    (e) => e.status === "submitted"
  ).length;
  const unsubmittedCount = totalEmployees - submittedCount;

  // Employee detail: history weeks
  const { data: historyEntries = [] } = useQuery({
    queryKey: ["timesheet-history", selectedEmployee?.userId],
    queryFn: async () => {
      if (!selectedEmployee) return [];
      const fourWeeksAgo = format(subWeeks(new Date(), 4), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", selectedEmployee.userId)
        .gte("work_date", fourWeeksAgo)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data as TimesheetEntry[];
    },
    enabled: !!selectedEmployee,
  });

  // Group history by week
  const historyByWeek = useMemo(() => {
    const weeks: { weekStart: Date; weekEnd: Date; entries: TimesheetEntry[]; totalHours: number }[] = [];
    
    for (let i = 1; i <= 4; i++) {
      const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const we = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const weekEntries = historyEntries.filter((e) => {
        const date = parseISO(e.work_date);
        return isWithinInterval(date, { start: ws, end: we });
      });
      const totalHours = weekEntries.reduce(
        (sum, e) => sum + (Number(e.hours_worked) || 0),
        0
      );
      weeks.push({ weekStart: ws, weekEnd: we, entries: weekEntries, totalHours });
    }
    return weeks;
  }, [historyEntries]);

  const handlePrevWeek = () => setSelectedWeekOffset((o) => o - 1);
  const handleNextWeek = () => setSelectedWeekOffset((o) => o + 1);
  const handleCurrentWeek = () => setSelectedWeekOffset(0);

  const openRejectDialog = (userId: string) => {
    setRejectTargetUserId(userId);
    setRejectionNote("");
    setShowRejectDialog(true);
  };

  const handleRejectTimesheet = async () => {
    if (!rejectTargetUserId) return;
    setRejectingUserId(rejectTargetUserId);
    try {
      const { error } = await supabase
        .from("timesheet_entries")
        .update({ status: "pending", rejection_note: rejectionNote || null })
        .eq("user_id", rejectTargetUserId)
        .gte("work_date", weekStartStr)
        .lte("work_date", weekEndStr)
        .eq("status", "submitted");

      if (error) throw error;

      toast.success("Timesheet returned for revision");
      queryClient.invalidateQueries({ queryKey: ["timesheet-summary"] });
      setShowRejectDialog(false);
      
      if (selectedEmployee?.userId === rejectTargetUserId) {
        setSelectedEmployee((prev) =>
          prev ? { ...prev, status: "unsubmitted" } : null
        );
      }
    } catch (err) {
      console.error("Error rejecting timesheet:", err);
      toast.error("Failed to reject timesheet");
    } finally {
      setRejectingUserId(null);
    }
  };

  const handleSaveNote = async (entryId: string, newNote: string) => {
    try {
      const { error } = await supabase
        .from("timesheet_entries")
        .update({ notes: newNote || null })
        .eq("id", entryId);
      if (error) throw error;
      toast.success("Note updated");
      queryClient.invalidateQueries({ queryKey: ["timesheet-summary"] });
      setEditingNoteId(null);
    } catch {
      toast.error("Failed to update note");
    }
  };

  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    try {
      const { data, error } = await supabase.functions.invoke('timesheet-reminder');
      if (error) throw error;
      
      const successCount = (data?.results || []).filter((r: any) => r.success).length;
      toast.success(`Sent ${successCount} reminder emails`);
    } catch (error) {
      console.error('Error sending reminders:', error);
      toast.error('Failed to send reminders');
    } finally {
      setIsSendingReminders(false);
    }
  };

  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Timesheet Summary</h1>
            <p className="text-muted-foreground">
              View all employees' timesheet status
            </p>
          </div>

          {/* Week Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSendReminders}
              disabled={isSendingReminders}
              className="mr-2"
            >
              <Mail className="h-4 w-4 mr-2" />
              {isSendingReminders ? "Sending..." : "Send Reminders Now"}
            </Button>
            <Button variant="outline" size="icon" onClick={handlePrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={selectedWeekOffset === 0 ? "default" : "outline"}
              onClick={handleCurrentWeek}
              className="min-w-[180px]"
            >
              <Calendar className="h-4 w-4 mr-2" />
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextWeek}
              disabled={selectedWeekOffset >= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalEmployees}</p>
                  <p className="text-xs text-muted-foreground">Total Employees</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{submittedCount}</p>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{unsubmittedCount}</p>
                  <p className="text-xs text-muted-foreground">Unsubmitted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Employee Timesheets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Work Hours</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeSummaries.map((emp) => (
                    <TableRow key={emp.userId}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {emp.email || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={
                            emp.totalHours >= 40
                              ? "text-primary font-semibold"
                              : emp.totalHours > 0
                                ? "text-destructive font-semibold"
                                : "text-muted-foreground"
                          }
                        >
                          {emp.totalHours.toFixed(1)}h
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            emp.status === "submitted" ? "default" : "secondary"
                          }
                        >
                          {emp.status === "submitted"
                            ? "Submitted"
                            : "Unsubmitted"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-2">
                        {isOwner && emp.status === "submitted" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openRejectDialog(emp.userId)}
                            disabled={rejectingUserId === emp.userId}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            {rejectingUserId === emp.userId ? "Rejecting..." : "Reject"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setDetailTab("current");
                          }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employee Detail Dialog */}
      <Dialog
        open={!!selectedEmployee}
        onOpenChange={(open) => !open && setSelectedEmployee(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployee?.name}'s Timesheet
            </DialogTitle>
          </DialogHeader>

          <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as "current" | "history")}>
            <TabsList className="mb-4">
              <TabsTrigger value="current">Current Week</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="current">
              <div className="text-sm text-muted-foreground mb-3">
                {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daysOfWeek.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayEntries = selectedEmployee?.entries.filter(
                      (e) => e.work_date === dayStr
                    ) || [];
                    const dayHours = dayEntries.reduce(
                      (sum, e) => sum + (Number(e.hours_worked) || 0),
                      0
                    );

                    if (dayEntries.length === 0) {
                      return (
                        <TableRow key={dayStr} className="text-muted-foreground">
                          <TableCell>{format(day, "EEE, MMM d")}</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-right">0h</TableCell>
                        </TableRow>
                      );
                    }

                    return dayEntries.map((entry, idx) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {idx === 0 ? format(day, "EEE, MMM d") : ""}
                        </TableCell>
                        <TableCell>
                          {entry.start_time && entry.end_time
                            ? `${entry.start_time} - ${entry.end_time}`
                            : "-"}
                        </TableCell>
                        <TableCell>{entry.client_name || "-"}</TableCell>
                        <TableCell>
                          {isOwner ? (
                            editingNoteId === entry.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={editingNoteValue}
                                  onChange={(e) => setEditingNoteValue(e.target.value)}
                                  className="h-7 text-xs w-32"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveNote(entry.id, editingNoteValue);
                                    if (e.key === "Escape") setEditingNoteId(null);
                                  }}
                                  autoFocus
                                />
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleSaveNote(entry.id, editingNoteValue)}>
                                  Save
                                </Button>
                              </div>
                            ) : (
                              <span
                                className="flex items-center gap-1 text-muted-foreground cursor-pointer hover:text-foreground max-w-[150px] truncate"
                                onClick={() => { setEditingNoteId(entry.id); setEditingNoteValue(entry.notes || ""); }}
                                title="Click to edit"
                              >
                                <MessageSquare className="h-3 w-3 shrink-0" />
                                {entry.notes || <span className="italic text-xs">Add note</span>}
                              </span>
                            )
                          ) : entry.notes ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-muted-foreground cursor-help max-w-[150px] truncate">
                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                    {entry.notes}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-sm">{entry.notes}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(entry.hours_worked).toFixed(1)}h
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-4 pt-4 border-t">
                <div className="text-lg font-semibold">
                  Total: {selectedEmployee?.totalHours.toFixed(1)}h
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="space-y-4">
                {historyByWeek.map((week, idx) => (
                  <Card key={idx}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium flex justify-between">
                        <span>
                          {format(week.weekStart, "MMM d")} -{" "}
                          {format(week.weekEnd, "MMM d, yyyy")}
                        </span>
                        <span
                          className={
                            week.totalHours >= 40
                              ? "text-primary"
                              : "text-destructive"
                          }
                        >
                          {week.totalHours.toFixed(1)}h
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      {week.entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No entries
                        </p>
                      ) : (
                        <div className="text-sm space-y-1">
                          {week.entries.slice(0, 5).map((e) => (
                            <div
                              key={e.id}
                              className="flex justify-between text-muted-foreground"
                            >
                              <span>{format(parseISO(e.work_date), "EEE, MMM d")}</span>
                              <span>{Number(e.hours_worked).toFixed(1)}h</span>
                            </div>
                          ))}
                          {week.entries.length > 5 && (
                            <p className="text-xs text-muted-foreground">
                              +{week.entries.length - 5} more entries
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add a note explaining why this timesheet is being rejected. The employee will see this note.
            </p>
            <Textarea
              placeholder="e.g. Missing hours for Wednesday, please update and resubmit"
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRejectTimesheet}
              disabled={rejectingUserId === rejectTargetUserId}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {rejectingUserId === rejectTargetUserId ? "Rejecting..." : "Reject & Send Back"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
