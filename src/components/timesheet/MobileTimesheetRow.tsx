import { useState } from "react";
import { Plus, MessageSquare, Trash2, X, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DayEntry, TimesheetSegment, WORK_TYPES } from "./TimesheetRow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface MobileTimesheetRowProps {
  dayEntry: DayEntry;
  dayName: string;
  isLocked: boolean;
  onToggleSelect: (dateString: string) => void;
  onUpdateSegment: (dateString: string, segmentId: string, updates: Partial<TimesheetSegment>) => void;
  onAddSegment: (dateString: string, workType?: string) => void;
  onDeleteSegment: (dateString: string, segmentId: string) => void;
  onClearDay: (dateString: string) => void;
}

// Time picker options for quick selection
const TIME_OPTIONS = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30",
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "01:00", "01:30", "02:00", "02:30",
  "03:00", "03:30", "04:00", "04:30", "05:00", "05:30",
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30",
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
];

// Common time presets
const TIME_PRESETS = [
  { label: "6:00 AM", time: "06:00", period: "AM" as const },
  { label: "7:00 AM", time: "07:00", period: "AM" as const },
  { label: "8:00 AM", time: "08:00", period: "AM" as const },
  { label: "9:00 AM", time: "09:00", period: "AM" as const },
  { label: "10:00 AM", time: "10:00", period: "AM" as const },
  { label: "11:00 AM", time: "11:00", period: "AM" as const },
  { label: "12:00 PM", time: "12:00", period: "PM" as const },
  { label: "1:00 PM", time: "01:00", period: "PM" as const },
  { label: "2:00 PM", time: "02:00", period: "PM" as const },
  { label: "3:00 PM", time: "03:00", period: "PM" as const },
  { label: "4:00 PM", time: "04:00", period: "PM" as const },
  { label: "5:00 PM", time: "05:00", period: "PM" as const },
  { label: "6:00 PM", time: "06:00", period: "PM" as const },
  { label: "7:00 PM", time: "07:00", period: "PM" as const },
  { label: "8:00 PM", time: "08:00", period: "PM" as const },
];

export function MobileTimesheetRow({
  dayEntry,
  dayName,
  isLocked,
  onToggleSelect,
  onUpdateSegment,
  onAddSegment,
  onDeleteSegment,
  onClearDay,
}: MobileTimesheetRowProps) {
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  const [activeTimePicker, setActiveTimePicker] = useState<{
    segmentId: string;
    field: "start" | "end";
  } | null>(null);
  const [activeWorkTypePicker, setActiveWorkTypePicker] = useState<string | null>(null);

  // Calculate daily hours
  const calculateSegmentHours = (segment: TimesheetSegment) => {
    if (!segment.startTime || !segment.endTime) return 0;
    
    const workTypeConfig = WORK_TYPES.find(t => t.id === segment.workType);
    if (!workTypeConfig?.countsHours) return 0;
    
    let startHour = parseInt(segment.startTime.split(":")[0]);
    const startMin = parseInt(segment.startTime.split(":")[1]);
    let endHour = parseInt(segment.endTime.split(":")[0]);
    const endMin = parseInt(segment.endTime.split(":")[1]);
    
    if (segment.startPeriod === "PM" && startHour !== 12) startHour += 12;
    if (segment.startPeriod === "AM" && startHour === 12) startHour = 0;
    if (segment.endPeriod === "PM" && endHour !== 12) endHour += 12;
    if (segment.endPeriod === "AM" && endHour === 12) endHour = 0;
    
    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    return Math.max(0, totalMinutes / 60);
  };

  const dailyHours = dayEntry.segments.reduce((sum, seg) => sum + calculateSegmentHours(seg), 0);
  const hasAnyEntry = dayEntry.segments.some(s => s.startTime || s.endTime || s.workType);

  const handleTimeSelect = (time: string, period: "AM" | "PM") => {
    if (!activeTimePicker) return;
    
    const { segmentId, field } = activeTimePicker;
    if (field === "start") {
      onUpdateSegment(dayEntry.dateString, segmentId, { 
        startTime: time, 
        startPeriod: period 
      });
    } else {
      onUpdateSegment(dayEntry.dateString, segmentId, { 
        endTime: time, 
        endPeriod: period 
      });
    }
    setActiveTimePicker(null);
  };

  const handleWorkTypeSelect = (segmentId: string, workType: string) => {
    onUpdateSegment(dayEntry.dateString, segmentId, { workType });
    
    // If selecting Office, auto-add a lunch segment
    if (workType === "office") {
      onAddSegment(dayEntry.dateString, "lunch");
    }
    setActiveWorkTypePicker(null);
  };

  const getWorkTypeLabel = (workTypeId: string) => {
    const type = WORK_TYPES.find(t => t.id === workTypeId);
    return type?.label || "Select Type";
  };

  const getWorkTypeColor = (workTypeId: string) => {
    const type = WORK_TYPES.find(t => t.id === workTypeId);
    return type?.color || "bg-muted";
  };

  const formatDisplayTime = (time: string, period: "AM" | "PM") => {
    if (!time) return "-- : --";
    return `${time} ${period}`;
  };

  return (
    <div className={cn(
      "border-b transition-colors",
      dayEntry.isSelected && "bg-primary/5"
    )}>
      {dayEntry.segments.map((segment, index) => (
        <div key={segment.id} className="p-3 space-y-3">
          {/* Day Header - only on first segment */}
          {index === 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={dayEntry.isSelected}
                  onCheckedChange={() => onToggleSelect(dayEntry.dateString)}
                  className="h-5 w-5"
                />
                <div>
                  <div className="font-semibold text-base">{dayName}</div>
                  <div className="text-sm text-muted-foreground">{format(dayEntry.date, "MMMM d")}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-xl font-bold",
                  dailyHours >= 8 ? "text-green-600" : dailyHours > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {dailyHours > 0 ? `${dailyHours.toFixed(1)}h` : "-"}
                </div>
              </div>
            </div>
          )}

          {/* Segment indicator for additional segments */}
          {index > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-8">
              <div className="h-px flex-1 bg-border" />
              <span>Entry {index + 1}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Time Selection Row */}
          <div className="flex gap-2 pl-8">
            {/* Start Time Button */}
            <Drawer open={activeTimePicker?.segmentId === segment.id && activeTimePicker?.field === "start"} 
                    onOpenChange={(open) => !open && setActiveTimePicker(null)}>
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 h-14 justify-between px-4",
                    !segment.startTime && "text-muted-foreground"
                  )}
                  onClick={() => setActiveTimePicker({ segmentId: segment.id, field: "start" })}
                  disabled={isLocked}
                >
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div className="text-lg font-medium">
                      {formatDisplayTime(segment.startTime, segment.startPeriod)}
                    </div>
                  </div>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[70vh]">
                <DrawerHeader>
                  <DrawerTitle>Select Start Time</DrawerTitle>
                </DrawerHeader>
                <div className="p-4 grid grid-cols-3 gap-2 overflow-y-auto">
                  {TIME_PRESETS.map((preset) => (
                    <Button
                      key={`${preset.time}-${preset.period}`}
                      variant={segment.startTime === preset.time && segment.startPeriod === preset.period ? "default" : "outline"}
                      className="h-12 text-base"
                      onClick={() => handleTimeSelect(preset.time, preset.period)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>

            {/* End Time Button */}
            <Drawer open={activeTimePicker?.segmentId === segment.id && activeTimePicker?.field === "end"} 
                    onOpenChange={(open) => !open && setActiveTimePicker(null)}>
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 h-14 justify-between px-4",
                    !segment.endTime && "text-muted-foreground"
                  )}
                  onClick={() => setActiveTimePicker({ segmentId: segment.id, field: "end" })}
                  disabled={isLocked}
                >
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">End</div>
                    <div className="text-lg font-medium">
                      {formatDisplayTime(segment.endTime, segment.endPeriod)}
                    </div>
                  </div>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[70vh]">
                <DrawerHeader>
                  <DrawerTitle>Select End Time</DrawerTitle>
                </DrawerHeader>
                <div className="p-4 grid grid-cols-3 gap-2 overflow-y-auto">
                  {TIME_PRESETS.map((preset) => (
                    <Button
                      key={`${preset.time}-${preset.period}`}
                      variant={segment.endTime === preset.time && segment.endPeriod === preset.period ? "default" : "outline"}
                      className="h-12 text-base"
                      onClick={() => handleTimeSelect(preset.time, preset.period)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Work Type Selection */}
          <div className="pl-8">
            <Drawer open={activeWorkTypePicker === segment.id} 
                    onOpenChange={(open) => !open && setActiveWorkTypePicker(null)}>
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-14 justify-between px-4",
                    !segment.workType && "text-muted-foreground"
                  )}
                  onClick={() => setActiveWorkTypePicker(segment.id)}
                  disabled={isLocked}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-4 h-4 rounded-full", getWorkTypeColor(segment.workType))} />
                    <div className="text-left">
                      <div className="text-xs text-muted-foreground">Work Type</div>
                      <div className="text-base font-medium">
                        {getWorkTypeLabel(segment.workType)}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[70vh]">
                <DrawerHeader>
                  <DrawerTitle>Select Work Type</DrawerTitle>
                </DrawerHeader>
                <div className="p-4 space-y-2 overflow-y-auto">
                  {WORK_TYPES.map((type) => (
                    <Button
                      key={type.id}
                      variant={segment.workType === type.id ? "default" : "outline"}
                      className="w-full h-14 justify-start gap-3 text-base"
                      onClick={() => handleWorkTypeSelect(segment.id, type.id)}
                    >
                      <div className={cn("w-4 h-4 rounded-full", type.color)} />
                      <span>{type.label}</span>
                      {type.countsHours && (
                        <span className="ml-auto text-xs text-muted-foreground">(counts hours)</span>
                      )}
                    </Button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pl-8">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-sm"
              onClick={() => setShowNotes(prev => ({ ...prev, [segment.id]: !prev[segment.id] }))}
            >
              <MessageSquare className={cn("h-4 w-4 mr-2", segment.notes ? "text-primary" : "text-muted-foreground")} />
              {segment.notes ? "Edit Notes" : "Add Notes"}
            </Button>

            {dayEntry.segments.length > 1 && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-sm text-destructive"
                onClick={() => onDeleteSegment(dayEntry.dateString, segment.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            )}

            {index === 0 && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-sm"
                onClick={() => onAddSegment(dayEntry.dateString)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            )}

            {index === 0 && hasAnyEntry && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-sm text-muted-foreground ml-auto"
                onClick={() => onClearDay(dayEntry.dateString)}
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Notes Input */}
          {showNotes[segment.id] && (
            <div className="pl-8">
              <Textarea
                value={segment.notes}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { notes: e.target.value })}
                placeholder="Add notes for this entry..."
                className="min-h-[80px] text-base resize-none"
                disabled={isLocked}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
