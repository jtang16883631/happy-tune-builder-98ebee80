import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  getDay,
} from "date-fns";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Copy,
  Send,
  Loader2,
  Save,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TimesheetRow, DayEntry, TimesheetSegment, WORK_TYPES } from "@/components/timesheet/TimesheetRow";
import { MobileTimesheetRow } from "@/components/timesheet/MobileTimesheetRow";
import { BulkApplyPanel } from "@/components/timesheet/BulkApplyPanel";
import { WeeklyTotalBar } from "@/components/timesheet/WeeklyTotalBar";
import { QuickClockPanel } from "@/components/timesheet/QuickClockPanel";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

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
  rejection_note: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const createEmptySegment = (): TimesheetSegment => ({
  id: crypto.randomUUID(),
  startTime: "",
  endTime: "",
  startPeriod: "AM",
  endPeriod: "PM",
  workType: "",
  autoLunch: false,
  lunchMinutes: 0,
  notes: "",
});

export default function Timesheet() {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isOfficeAdmin = roles.includes("office_admin" as any);

  // Week ending date (Sunday) - week runs Monday-Sunday
  const [weekEndingDate, setWeekEndingDate] = useState<Date>(() => {
    const today = new Date();
    const dayOfWeek = getDay(today);
    // Sunday = 0, so if today is Sunday, daysUntilSunday = 0, otherwise calculate
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysUntilSunday);
    return sunday;
  });

  // Local state for entries (for fast editing)
  const [localEntries, setLocalEntries] = useState<Record<string, DayEntry>>({});
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [timesheetStatus, setTimesheetStatus] = useState<"draft" | "submitted">("draft");
  const [showResubmitDialog, setShowResubmitDialog] = useState(false);
  // Independent month state for mini calendar (doesn't affect week selection)
  const [miniCalendarMonth, setMiniCalendarMonth] = useState<Date>(new Date());
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  // Calculate week range (Monday-Sunday)
  const weekStart = startOfWeek(weekEndingDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekEndingDate, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch entries from database
  const { data: dbEntries = [], isLoading } = useQuery({
    queryKey: [
      "timesheet-entries",
      user?.id,
      format(weekStart, "yyyy-MM-dd"),
      format(weekEnd, "yyyy-MM-dd"),
    ],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("work_date", format(weekStart, "yyyy-MM-dd"))
        .lte("work_date", format(weekEnd, "yyyy-MM-dd"))
        .order("work_date")
        .order("start_time");
      if (error) throw error;
      return data as TimesheetEntry[];
    },
    enabled: !!user,
  });

  // Fetch last week's entries for copy feature
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subWeeks(weekEnd, 1);
  
  const { data: lastWeekEntries = [] } = useQuery({
    queryKey: [
      "timesheet-entries-last-week",
      user?.id,
      format(lastWeekStart, "yyyy-MM-dd"),
      format(lastWeekEnd, "yyyy-MM-dd"),
    ],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("work_date", format(lastWeekStart, "yyyy-MM-dd"))
        .lte("work_date", format(lastWeekEnd, "yyyy-MM-dd"))
        .order("work_date")
        .order("start_time");
      if (error) throw error;
      return data as TimesheetEntry[];
    },
    enabled: !!user,
  });

  // Key for tracking week changes
  const weekKey = daysInWeek.map(d => format(d, "yyyy-MM-dd")).join(",");

  // Initialize local entries from database (MUST be useEffect; setting state during render can blank the page)
  useEffect(() => {
    // Convert database entries to local format
    const converted: Record<string, DayEntry> = {};

    // Initialize all days first
    daysInWeek.forEach((day) => {
      const dateString = format(day, "yyyy-MM-dd");
      converted[dateString] = {
        date: day,
        dateString,
        segments: [],
        // Selection is managed separately via handlers; default to false on init
        isSelected: false,
      };
    });

    // Add entries from database
    dbEntries.forEach((entry) => {
      const dateString = entry.work_date;
      if (converted[dateString]) {
        // Parse start time to determine AM/PM
        const startHour = entry.start_time ? parseInt(entry.start_time.split(":")[0]) : 9;
        const endHour = entry.end_time ? parseInt(entry.end_time.split(":")[0]) : 17;

        converted[dateString].segments.push({
          id: entry.id,
          startTime: entry.start_time ? formatTo12Hour(entry.start_time) : "",
          endTime: entry.end_time ? formatTo12Hour(entry.end_time) : "",
          startPeriod: startHour >= 12 ? "PM" : "AM",
          endPeriod: endHour >= 12 ? "PM" : "AM",
          workType: entry.client_name || "",
          autoLunch: (entry.break_minutes || 0) > 0,
          lunchMinutes: entry.break_minutes || 0,
          notes: entry.notes || "",
        });
      }
    });

    // Ensure each day has at least one segment
    Object.keys(converted).forEach((dateString) => {
      if (converted[dateString].segments.length === 0) {
        converted[dateString].segments.push(createEmptySegment());
      }
    });

    setLocalEntries(converted);
    // Reset selection on week change/load
    setSelectedDays(new Set());
  }, [dbEntries, weekKey]);

  // Helper to convert 24h to 12h format
  function formatTo12Hour(time: string): string {
    const [hours, minutes] = time.split(":").map(Number);
    const h = hours % 12 || 12;
    return `${h.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  // Calculate hours - only count office and hospital, subtract lunch
  const calculateSegmentHours = (segment: TimesheetSegment) => {
    if (!segment.startTime || !segment.endTime) return 0;
    
    const workTypeConfig = WORK_TYPES.find(t => t.id === segment.workType);
    
    // Lunch segments subtract hours (negative)
    if (segment.workType === "lunch") {
      let startHour = parseInt(segment.startTime.split(":")[0]);
      const startMin = parseInt(segment.startTime.split(":")[1]) || 0;
      let endHour = parseInt(segment.endTime.split(":")[0]);
      const endMin = parseInt(segment.endTime.split(":")[1]) || 0;
      
      if (segment.startPeriod === "PM" && startHour !== 12) startHour += 12;
      if (segment.startPeriod === "AM" && startHour === 12) startHour = 0;
      if (segment.endPeriod === "PM" && endHour !== 12) endHour += 12;
      if (segment.endPeriod === "AM" && endHour === 12) endHour = 0;
      
      const lunchMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      return -Math.max(0, lunchMinutes / 60); // Negative for subtraction
    }
    
    if (!workTypeConfig?.countsHours) return 0;
    
    // Parse time with AM/PM
    let startHour = parseInt(segment.startTime.split(":")[0]);
    const startMin = parseInt(segment.startTime.split(":")[1]) || 0;
    let endHour = parseInt(segment.endTime.split(":")[0]);
    const endMin = parseInt(segment.endTime.split(":")[1]) || 0;
    
    // Convert to 24-hour format
    if (segment.startPeriod === "PM" && startHour !== 12) startHour += 12;
    if (segment.startPeriod === "AM" && startHour === 12) startHour = 0;
    if (segment.endPeriod === "PM" && endHour !== 12) endHour += 12;
    if (segment.endPeriod === "AM" && endHour === 12) endHour = 0;
    
    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    return Math.max(0, totalMinutes / 60);
  };

  const weeklyTotalHours = useMemo(() => {
    return Object.values(localEntries).reduce((total, day) => {
      return total + day.segments.reduce((sum, seg) => sum + calculateSegmentHours(seg), 0);
    }, 0);
  }, [localEntries]);

  // Handlers
  const handleToggleSelect = useCallback((dateString: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateString)) {
        next.delete(dateString);
      } else {
        next.add(dateString);
      }
      return next;
    });
    setLocalEntries((prev) => ({
      ...prev,
      [dateString]: {
        ...prev[dateString],
        isSelected: !prev[dateString]?.isSelected,
      },
    }));
  }, []);

  const handleUpdateSegment = useCallback((dateString: string, segmentId: string, updates: Partial<TimesheetSegment>) => {
    setLocalEntries((prev) => ({
      ...prev,
      [dateString]: {
        ...prev[dateString],
        segments: prev[dateString].segments.map((seg) =>
          seg.id === segmentId ? { ...seg, ...updates } : seg
        ),
      },
    }));
  }, []);

  const handleAddSegment = useCallback((dateString: string, workType?: string) => {
    setLocalEntries((prev) => {
      const lastSegment = prev[dateString].segments[prev[dateString].segments.length - 1];
      const newSegment: TimesheetSegment = {
        id: crypto.randomUUID(),
        startTime: lastSegment.endTime || "",
        endTime: "",
        startPeriod: lastSegment.endPeriod || "AM",
        endPeriod: "PM",
        workType: workType || lastSegment.workType || "",
        autoLunch: false,
        lunchMinutes: 0,
        notes: "",
      };
      return {
        ...prev,
        [dateString]: {
          ...prev[dateString],
          segments: [...prev[dateString].segments, newSegment],
        },
      };
    });
  }, []);

  const handleDeleteSegment = useCallback((dateString: string, segmentId: string) => {
    setLocalEntries((prev) => ({
      ...prev,
      [dateString]: {
        ...prev[dateString],
        segments: prev[dateString].segments.filter((seg) => seg.id !== segmentId),
      },
    }));
  }, []);

  const handleClearDay = useCallback((dateString: string) => {
    setLocalEntries((prev) => ({
      ...prev,
      [dateString]: {
        ...prev[dateString],
        segments: [createEmptySegment()],
      },
    }));
  }, []);

  const handleBulkApply = useCallback((settings: {
    workType: string;
    startTime: string;
    endTime: string;
    autoLunch: boolean;
    lunchMinutes: number;
  }) => {
    setLocalEntries((prev) => {
      const updated = { ...prev };
      selectedDays.forEach((dateString) => {
        if (updated[dateString]) {
          const segments: TimesheetSegment[] = [{
            id: crypto.randomUUID(),
            startTime: settings.startTime,
            endTime: settings.endTime,
            startPeriod: "AM",
            endPeriod: "PM",
            workType: settings.workType,
            autoLunch: settings.autoLunch,
            lunchMinutes: settings.lunchMinutes,
            notes: "",
          }];
          
          // Add lunch segment for office
          if (settings.workType === "office") {
            segments.push({
              id: crypto.randomUUID(),
              startTime: "",
              endTime: "",
              startPeriod: "PM",
              endPeriod: "PM",
              workType: "lunch",
              autoLunch: false,
              lunchMinutes: 0,
              notes: "",
            });
          }
          
          updated[dateString] = {
            ...updated[dateString],
            segments,
          };
        }
      });
      return updated;
    });
    setSelectedDays(new Set());
    toast({
      title: "Applied",
      description: `Settings applied to ${selectedDays.size} day(s)`,
    });
  }, [selectedDays, toast]);

  const handleClearSelection = useCallback(() => {
    setSelectedDays(new Set());
    setLocalEntries((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        updated[key] = { ...updated[key], isSelected: false };
      });
      return updated;
    });
  }, []);

  const handleCopyLastWeek = useCallback(() => {
    if (lastWeekEntries.length === 0) {
      toast({
        title: "No Data",
        description: "No entries found from last week to copy",
        variant: "destructive",
      });
      return;
    }

    setLocalEntries((prev) => {
      const updated = { ...prev };
      
      // Group last week entries by day of week
      const entriesByDayOfWeek: Record<number, TimesheetEntry[]> = {};
      lastWeekEntries.forEach((entry) => {
        const dayOfWeek = getDay(new Date(entry.work_date));
        if (!entriesByDayOfWeek[dayOfWeek]) {
          entriesByDayOfWeek[dayOfWeek] = [];
        }
        entriesByDayOfWeek[dayOfWeek].push(entry);
      });

      // Apply to this week
      daysInWeek.forEach((day) => {
        const dateString = format(day, "yyyy-MM-dd");
        const dayOfWeek = getDay(day);
        const lastWeekDayEntries = entriesByDayOfWeek[dayOfWeek];

        if (lastWeekDayEntries && lastWeekDayEntries.length > 0) {
          updated[dateString] = {
            ...updated[dateString],
            segments: lastWeekDayEntries.map((entry) => {
              const startHour = entry.start_time ? parseInt(entry.start_time.split(":")[0]) : 9;
              const endHour = entry.end_time ? parseInt(entry.end_time.split(":")[0]) : 17;
              
              return {
                id: crypto.randomUUID(),
                startTime: entry.start_time ? formatTo12Hour(entry.start_time) : "",
                endTime: entry.end_time ? formatTo12Hour(entry.end_time) : "",
                startPeriod: startHour >= 12 ? "PM" as const : "AM" as const,
                endPeriod: endHour >= 12 ? "PM" as const : "AM" as const,
                workType: entry.client_name || "",
                autoLunch: (entry.break_minutes || 0) > 0,
                lunchMinutes: entry.break_minutes || 0,
                notes: entry.notes || "",
              };
            }),
          };
        }
      });

      return updated;
    });

    toast({
      title: "Copied",
      description: "Last week's entries have been copied",
    });
  }, [lastWeekEntries, daysInWeek, toast]);

  // Clear all entries for the week
  const handleClearAll = useCallback(() => {
    setLocalEntries((prev) => {
      const cleared: Record<string, DayEntry> = {};
      daysInWeek.forEach((day) => {
        const dateString = format(day, "yyyy-MM-dd");
        cleared[dateString] = {
          date: day,
          dateString,
          segments: [createEmptySegment()],
          isSelected: false,
        };
      });
      return cleared;
    });
    setSelectedDays(new Set());
    setShowClearAllDialog(false);
    toast({
      title: "Cleared",
      description: "All timesheet entries have been cleared",
    });
  }, [daysInWeek, toast]);
  const convertTo24Hour = (time: string, period: "AM" | "PM"): string => {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    let h = hours;
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${(minutes || 0).toString().padStart(2, "0")}`;
  };

  // Save mutation (for both draft and submit)
  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!user) throw new Error("Not authenticated");

      // Delete existing entries for this week
      const { error: deleteError } = await supabase
        .from("timesheet_entries")
        .delete()
        .gte("work_date", format(weekStart, "yyyy-MM-dd"))
        .lte("work_date", format(weekEnd, "yyyy-MM-dd"))
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // Insert new entries
      const entries: any[] = [];
      Object.values(localEntries).forEach((day) => {
        day.segments.forEach((seg) => {
          if (seg.workType) { // Save if has work type (even without time for status types)
            const start24 = convertTo24Hour(seg.startTime, seg.startPeriod);
            const end24 = convertTo24Hour(seg.endTime, seg.endPeriod);
            const hours = calculateSegmentHours(seg);
            
            entries.push({
              user_id: user.id,
              work_date: day.dateString,
              start_time: start24 || null,
              end_time: end24 || null,
              hours_worked: hours,
              break_minutes: seg.autoLunch ? seg.lunchMinutes : 0,
              client_name: seg.workType || null,
              notes: seg.notes || null,
              status: status === "submitted" ? "submitted" : "draft",
            });
          }
        });
      });

      if (entries.length > 0) {
        const { error: insertError } = await supabase
          .from("timesheet_entries")
          .insert(entries);
        if (insertError) throw insertError;
      }

      return status;
    },
    onSuccess: (status) => {
      setTimesheetStatus(status);
      queryClient.invalidateQueries({ queryKey: ["timesheet-entries"] });
      toast({
        title: status === "submitted" ? "Submitted" : "Saved",
        description: status === "submitted" 
          ? "Your timesheet has been submitted successfully" 
          : "Your timesheet has been saved as draft",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveDraft = () => {
    saveMutation.mutate("draft");
  };

  const handleSubmit = () => {
    saveMutation.mutate("submitted");
  };

  const handleResubmit = () => {
    setTimesheetStatus("draft");
    setShowResubmitDialog(false);
    toast({
      title: "Unlocked",
      description: "You can now edit your timesheet and resubmit",
    });
  };

  const navigateWeek = (direction: "prev" | "next") => {
    setWeekEndingDate((prev) =>
      direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1)
    );
    setSelectedDays(new Set());
    setTimesheetStatus("draft"); // Reset status when changing weeks
  };

  // Check if any entry is submitted to determine initial lock state
  useEffect(() => {
    const hasSubmittedEntry = dbEntries.some((entry) => entry.status === "submitted");
    setTimesheetStatus(hasSubmittedEntry ? "submitted" : "draft");
  }, [dbEntries]);

  const isLocked = timesheetStatus === "submitted";

  // Get rejection note if any entry has one (from owner rejection)
  const rejectionNote = useMemo(() => {
    const entryWithNote = dbEntries.find((e) => e.rejection_note && e.status === "pending");
    return entryWithNote?.rejection_note || null;
  }, [dbEntries]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-4 sm:py-6 space-y-4 pb-24 px-2 sm:px-4">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">My Timesheet</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Week Ending: {format(weekEnd, isMobile ? "MMM do" : "MMMM do, yyyy")}
                </p>
              </div>
              <Badge 
                variant={timesheetStatus === "submitted" ? "default" : "secondary"}
                className="capitalize text-xs"
              >
                {timesheetStatus}
              </Badge>
            </div>
          </div>

          {/* Action buttons - stacked on mobile */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyLastWeek} className="gap-1 sm:gap-2 text-xs sm:text-sm" disabled={isLocked}>
              <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Copy Last Week</span>
              <span className="xs:hidden">Copy</span>
            </Button>
            <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm text-destructive hover:text-destructive" disabled={isLocked}>
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Clear All</span>
                  <span className="xs:hidden">Clear</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Entries?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all timesheet entries for the current week. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button 
              variant="outline"
              size="sm"
              onClick={handleSaveDraft} 
              disabled={saveMutation.isPending || isLocked}
              className="gap-1 sm:gap-2 text-xs sm:text-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Save className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              <span className="hidden sm:inline">Save as Draft</span>
              <span className="sm:hidden">Save</span>
            </Button>
            {!isLocked ? (
              <Button 
                size="sm"
                onClick={handleSubmit} 
                disabled={saveMutation.isPending}
                className="gap-1 sm:gap-2 text-xs sm:text-sm"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
                Submit
              </Button>
            ) : (
              <AlertDialog open={showResubmitDialog} onOpenChange={setShowResubmitDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                    <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                    Resubmit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Resubmit Timesheet?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will unlock your timesheet for editing. You'll need to submit again after making changes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResubmit}>
                      Yes, Unlock & Edit
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Rejection Note Banner */}
        {rejectionNote && !isLocked && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Timesheet Rejected</p>
                <p className="text-sm text-muted-foreground mt-1">{rejectionNote}</p>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Week Selector + Live Calendar */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Week Navigation */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateWeek("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(weekEndingDate, "MMM dd, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={weekEndingDate}
                    onSelect={(date) => date && setWeekEndingDate(date)}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={() => navigateWeek("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant="outline">
              {format(weekStart, "MMM dd")} - {format(weekEnd, "MMM dd, yyyy")}
            </Badge>
          </div>

          {/* Live Mini Calendar - Hidden on mobile */}
          {!isMobile && (
            <div className="lg:ml-auto">
              <Card className="p-2">
                <Calendar
                  mode="single"
                  selected={new Date()}
                  month={miniCalendarMonth}
                  onMonthChange={setMiniCalendarMonth}
                  modifiers={{
                    currentWeek: daysInWeek,
                  }}
                  modifiersStyles={{
                    currentWeek: {
                      backgroundColor: "hsl(var(--primary) / 0.1)",
                      borderRadius: "0",
                    },
                  }}
                  className="pointer-events-auto text-xs"
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-2",
                    caption: "flex justify-center pt-1 relative items-center text-xs",
                    caption_label: "text-xs font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.65rem]",
                    row: "flex w-full mt-1",
                    cell: "h-7 w-7 text-center text-xs p-0 relative focus-within:relative focus-within:z-20",
                    day: "h-7 w-7 p-0 font-normal text-xs hover:bg-accent hover:text-accent-foreground rounded-md",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground font-bold",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                  }}
                />
              </Card>
            </div>
          )}
        </div>


        {/* Timesheet Table - Desktop */}
        {!isMobile && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <div className="w-5" />
                <div className="w-24">Day</div>
                <div className="w-32">Start</div>
                <div className="w-32">End</div>
                <div className="flex-1">Work Type</div>
                <div className="w-14 text-right">Hours</div>
                <div className="w-28" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {daysInWeek.map((day) => {
                const dateString = format(day, "yyyy-MM-dd");
                const dayEntry = localEntries[dateString];
                const dayOfWeek = getDay(day);
                
                if (!dayEntry) return null;

                return (
                  <TimesheetRow
                    key={dateString}
                    dayEntry={dayEntry}
                    dayName={DAY_NAMES[dayOfWeek]}
                    isLocked={isLocked}
                    onToggleSelect={handleToggleSelect}
                    onUpdateSegment={handleUpdateSegment}
                    onAddSegment={handleAddSegment}
                    onDeleteSegment={handleDeleteSegment}
                    onClearDay={handleClearDay}
                  />
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Timesheet - Mobile Optimized */}
        {isMobile && (
          <Card>
            <CardContent className="p-0">
              {daysInWeek.map((day) => {
                const dateString = format(day, "yyyy-MM-dd");
                const dayEntry = localEntries[dateString];
                const dayOfWeek = getDay(day);
                
                if (!dayEntry) return null;

                return (
                  <MobileTimesheetRow
                    key={dateString}
                    dayEntry={dayEntry}
                    dayName={DAY_NAMES[dayOfWeek]}
                    isLocked={isLocked}
                    onToggleSelect={handleToggleSelect}
                    onUpdateSegment={handleUpdateSegment}
                    onAddSegment={handleAddSegment}
                    onDeleteSegment={handleDeleteSegment}
                    onClearDay={handleClearDay}
                  />
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Weekly Total */}
        <WeeklyTotalBar totalHours={weeklyTotalHours} targetHours={40} />

        {/* Bulk Apply Panel */}
        <BulkApplyPanel
          selectedCount={selectedDays.size}
          onApply={handleBulkApply}
          onClear={handleClearSelection}
        />
      </div>
    </AppLayout>
  );
}
