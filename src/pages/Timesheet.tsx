import { useState, useMemo, useCallback } from "react";
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
import { QuickTemplateBar, QuickTemplate, QUICK_TEMPLATES } from "@/components/timesheet/QuickTemplateBar";
import { TimesheetRow, DayEntry, TimesheetSegment, WORK_TYPES } from "@/components/timesheet/TimesheetRow";
import { BulkApplyPanel } from "@/components/timesheet/BulkApplyPanel";
import { WeeklyTotalBar } from "@/components/timesheet/WeeklyTotalBar";
import { useToast } from "@/hooks/use-toast";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Week ending date (Saturday)
  const [weekEndingDate, setWeekEndingDate] = useState<Date>(() => {
    const today = new Date();
    const dayOfWeek = getDay(today);
    const daysUntilSaturday = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    return saturday;
  });

  // Local state for entries (for fast editing)
  const [localEntries, setLocalEntries] = useState<Record<string, DayEntry>>({});
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [timesheetStatus, setTimesheetStatus] = useState<"draft" | "submitted">("draft");
  const [showResubmitDialog, setShowResubmitDialog] = useState(false);

  // Calculate week range
  const weekStart = startOfWeek(weekEndingDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(weekEndingDate, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch entries from database
  const { data: dbEntries = [], isLoading } = useQuery({
    queryKey: ["timesheet-entries", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .gte("work_date", format(weekStart, "yyyy-MM-dd"))
        .lte("work_date", format(weekEnd, "yyyy-MM-dd"))
        .order("work_date")
        .order("start_time");
      if (error) throw error;
      return data as TimesheetEntry[];
    },
  });

  // Fetch last week's entries for copy feature
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subWeeks(weekEnd, 1);
  
  const { data: lastWeekEntries = [] } = useQuery({
    queryKey: ["timesheet-entries-last-week", format(lastWeekStart, "yyyy-MM-dd"), format(lastWeekEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .gte("work_date", format(lastWeekStart, "yyyy-MM-dd"))
        .lte("work_date", format(lastWeekEnd, "yyyy-MM-dd"))
        .order("work_date")
        .order("start_time");
      if (error) throw error;
      return data as TimesheetEntry[];
    },
  });

  // Initialize local entries from database
  useMemo(() => {
    if (dbEntries.length === 0 && Object.keys(localEntries).length === 0) {
      // Initialize empty entries for each day
      const initial: Record<string, DayEntry> = {};
      daysInWeek.forEach((day) => {
        const dateString = format(day, "yyyy-MM-dd");
        initial[dateString] = {
          date: day,
          dateString,
          segments: [createEmptySegment()],
          isSelected: false,
        };
      });
      setLocalEntries(initial);
    } else if (dbEntries.length > 0) {
      // Convert database entries to local format
      const converted: Record<string, DayEntry> = {};
      
      // Initialize all days first
      daysInWeek.forEach((day) => {
        const dateString = format(day, "yyyy-MM-dd");
        converted[dateString] = {
          date: day,
          dateString,
          segments: [],
          isSelected: selectedDays.has(dateString),
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
    }
  }, [dbEntries, daysInWeek.map(d => format(d, "yyyy-MM-dd")).join(",")]);

  // Helper to convert 24h to 12h format
  function formatTo12Hour(time: string): string {
    const [hours, minutes] = time.split(":").map(Number);
    const h = hours % 12 || 12;
    return `${h.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  // Calculate hours - only count office and hospital
  const calculateSegmentHours = (segment: TimesheetSegment) => {
    if (!segment.startTime || !segment.endTime) return 0;
    
    const workTypeConfig = WORK_TYPES.find(t => t.id === segment.workType);
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

  const handleApplyTemplate = useCallback((template: QuickTemplate) => {
    setLocalEntries((prev) => {
      const updated = { ...prev };
      selectedDays.forEach((dateString) => {
        if (updated[dateString]) {
          const segments: TimesheetSegment[] = [{
            id: crypto.randomUUID(),
            startTime: template.startTime,
            endTime: template.endTime,
            startPeriod: template.startPeriod,
            endPeriod: template.endPeriod,
            workType: template.workType,
            autoLunch: false,
            lunchMinutes: 0,
            notes: "",
          }];
          
          // Add lunch segment for office
          if (template.addLunchSegment) {
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
    toast({
      title: "Template Applied",
      description: `${template.label} applied to ${selectedDays.size} day(s)`,
    });
  }, [selectedDays, toast]);

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

  // Convert 12h to 24h for database storage
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
  useMemo(() => {
    const hasSubmittedEntry = dbEntries.some(entry => entry.status === "submitted");
    if (hasSubmittedEntry) {
      setTimesheetStatus("submitted");
    } else {
      setTimesheetStatus("draft");
    }
  }, [dbEntries]);

  const isLocked = timesheetStatus === "submitted";

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
      <div className="container mx-auto py-6 space-y-4 pb-24">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Timesheet</h1>
            <p className="text-sm text-muted-foreground">
              Week Ending: {format(weekEnd, "MMMM do, yyyy")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleCopyLastWeek} className="gap-2" disabled={isLocked}>
              <Copy className="h-4 w-4" />
              Copy Last Week
            </Button>
            <Button 
              variant="outline"
              onClick={handleSaveDraft} 
              disabled={saveMutation.isPending || isLocked}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save as Draft
            </Button>
            {!isLocked ? (
              <Button 
                onClick={handleSubmit} 
                disabled={saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit Timesheet
              </Button>
            ) : (
              <AlertDialog open={showResubmitDialog} onOpenChange={setShowResubmitDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
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

        {/* Week Selector */}
        <div className="flex items-center gap-4">
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

        {/* Quick Templates */}
        <QuickTemplateBar
          selectedDaysCount={selectedDays.size}
          onApplyTemplate={handleApplyTemplate}
        />

        {/* Timesheet Table */}
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
