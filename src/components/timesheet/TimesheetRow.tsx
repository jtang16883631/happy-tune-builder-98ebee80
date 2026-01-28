import { useState } from "react";
import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface TimesheetSegment {
  id: string;
  startTime: string;
  endTime: string;
  startPeriod: "AM" | "PM";
  endPeriod: "AM" | "PM";
  workType: string;
  autoLunch: boolean;
  lunchMinutes: number;
  notes: string;
}

export interface DayEntry {
  date: Date;
  dateString: string;
  segments: TimesheetSegment[];
  isSelected: boolean;
}

// Work types based on user requirements - only office and hospital count hours
export const WORK_TYPES = [
  { id: "travel_only", label: "Travel Only Day", color: "bg-purple-500", countsHours: false },
  { id: "hospital", label: "Hospital", color: "bg-blue-500", countsHours: true },
  { id: "office", label: "Office", color: "bg-green-500", countsHours: true },
  { id: "lunch", label: "Lunch", color: "bg-yellow-500", countsHours: false },
  { id: "off_on_own", label: "Off On Own", color: "bg-gray-500", countsHours: false },
  { id: "off_on_road", label: "Off On Road", color: "bg-slate-500", countsHours: false },
  { id: "vacation", label: "Vacation", color: "bg-pink-500", countsHours: false },
  { id: "company_holiday", label: "Company Holiday", color: "bg-red-500", countsHours: false },
];

interface TimesheetRowProps {
  dayEntry: DayEntry;
  dayName: string;
  isLocked: boolean;
  onToggleSelect: (dateString: string) => void;
  onUpdateSegment: (dateString: string, segmentId: string, updates: Partial<TimesheetSegment>) => void;
  onAddSegment: (dateString: string, workType?: string) => void;
  onDeleteSegment: (dateString: string, segmentId: string) => void;
  onClearDay: (dateString: string) => void;
}

// Parse flexible time input: "900", "0900", "9:00", "09:00" → "09:00"
function parseTimeInput(input: string): string {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, "");
  
  if (!digits) return "";
  
  let hours: number;
  let minutes: number;
  
  if (digits.length <= 2) {
    // Just hours: "9" → 09:00, "12" → 12:00
    hours = parseInt(digits, 10);
    minutes = 0;
  } else if (digits.length === 3) {
    // "900" → 9:00
    hours = parseInt(digits.slice(0, 1), 10);
    minutes = parseInt(digits.slice(1), 10);
  } else {
    // "0900", "1230" → 09:00, 12:30
    hours = parseInt(digits.slice(0, 2), 10);
    minutes = parseInt(digits.slice(2, 4), 10);
  }
  
  // Validate ranges (12-hour format)
  if (hours < 0 || hours > 12) hours = 12;
  if (minutes < 0 || minutes > 59) minutes = 0;
  
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function TimesheetRow({
  dayEntry,
  dayName,
  isLocked,
  onToggleSelect,
  onUpdateSegment,
  onAddSegment,
  onDeleteSegment,
  onClearDay,
}: TimesheetRowProps) {
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});

  // Calculate daily hours - only count office and hospital
  const calculateSegmentHours = (segment: TimesheetSegment) => {
    if (!segment.startTime || !segment.endTime) return 0;
    
    const workTypeConfig = WORK_TYPES.find(t => t.id === segment.workType);
    if (!workTypeConfig?.countsHours) return 0;
    
    // Parse time with AM/PM
    let startHour = parseInt(segment.startTime.split(":")[0]);
    const startMin = parseInt(segment.startTime.split(":")[1]);
    let endHour = parseInt(segment.endTime.split(":")[0]);
    const endMin = parseInt(segment.endTime.split(":")[1]);
    
    // Convert to 24-hour format
    if (segment.startPeriod === "PM" && startHour !== 12) startHour += 12;
    if (segment.startPeriod === "AM" && startHour === 12) startHour = 0;
    if (segment.endPeriod === "PM" && endHour !== 12) endHour += 12;
    if (segment.endPeriod === "AM" && endHour === 12) endHour = 0;
    
    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    return Math.max(0, totalMinutes / 60);
  };

  const dailyHours = dayEntry.segments.reduce((sum, seg) => sum + calculateSegmentHours(seg), 0);
  const hasAnyEntry = dayEntry.segments.some(s => s.startTime || s.endTime || s.workType);

  const toggleNotes = (segmentId: string) => {
    setShowNotes(prev => ({ ...prev, [segmentId]: !prev[segmentId] }));
  };

  const handleWorkTypeChange = (segmentId: string, workType: string) => {
    onUpdateSegment(dayEntry.dateString, segmentId, { workType });
    
    // If selecting Office, auto-add a lunch segment
    if (workType === "office") {
      onAddSegment(dayEntry.dateString, "lunch");
    }
  };

  const handleTimeBlur = (segmentId: string, field: "startTime" | "endTime", value: string) => {
    const parsed = parseTimeInput(value);
    if (parsed) {
      onUpdateSegment(dayEntry.dateString, segmentId, { [field]: parsed });
    }
  };

  const togglePeriod = (segmentId: string, field: "startPeriod" | "endPeriod", currentPeriod: "AM" | "PM") => {
    onUpdateSegment(dayEntry.dateString, segmentId, { 
      [field]: currentPeriod === "AM" ? "PM" : "AM" 
    });
  };

  return (
    <div className={cn(
      "border-b transition-colors",
      dayEntry.isSelected && "bg-primary/5"
    )}>
      {/* Main row */}
      {dayEntry.segments.map((segment, index) => (
        <div key={segment.id}>
          <div className="flex items-center gap-2 p-3 hover:bg-muted/30">
            {/* Checkbox - only on first segment */}
            {index === 0 ? (
              <Checkbox
                checked={dayEntry.isSelected}
                onCheckedChange={() => onToggleSelect(dayEntry.dateString)}
                className="h-5 w-5"
              />
            ) : (
              <div className="w-5" />
            )}

            {/* Day & Date - only on first segment */}
            {index === 0 ? (
              <div className="w-24 flex-shrink-0">
                <div className="font-medium text-sm">{dayName}</div>
                <div className="text-xs text-muted-foreground">
                  {format(dayEntry.date, "MM/dd")}
                </div>
              </div>
            ) : (
              <div className="w-24 flex-shrink-0 flex items-center gap-1">
                <div className="w-4 h-px bg-border" />
                <span className="text-xs text-muted-foreground">Seg {index + 1}</span>
              </div>
            )}

            {/* Start Time with AM/PM toggle */}
            <div className="flex items-center gap-1">
              <Input
                type="text"
                placeholder=""
                value={segment.startTime}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { startTime: e.target.value })}
                onBlur={(e) => handleTimeBlur(segment.id, "startTime", e.target.value)}
                className="w-20 h-9 text-sm"
                disabled={isLocked}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-12 text-xs font-medium"
                onClick={() => togglePeriod(segment.id, "startPeriod", segment.startPeriod)}
                disabled={isLocked}
              >
                {segment.startPeriod}
              </Button>
            </div>

            {/* End Time with AM/PM toggle */}
            <div className="flex items-center gap-1">
              <Input
                type="text"
                placeholder=""
                value={segment.endTime}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { endTime: e.target.value })}
                onBlur={(e) => handleTimeBlur(segment.id, "endTime", e.target.value)}
                className="w-20 h-9 text-sm"
                disabled={isLocked}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-12 text-xs font-medium"
                onClick={() => togglePeriod(segment.id, "endPeriod", segment.endPeriod)}
                disabled={isLocked}
              >
                {segment.endPeriod}
              </Button>
            </div>

            {/* Work Type Dropdown */}
            <div className="w-40">
              <Select
                value={segment.workType || "none"}
                onValueChange={(value) => handleWorkTypeChange(segment.id, value === "none" ? "" : value)}
                disabled={isLocked}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">None</span>
                  </SelectItem>
                  {WORK_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", type.color)} />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hours display - only on first segment */}
            {index === 0 && (
              <div className="w-14 text-right">
                <span className={cn(
                  "font-semibold text-sm",
                  dailyHours >= 8 ? "text-green-600" : dailyHours > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {dailyHours > 0 ? `${dailyHours.toFixed(1)}h` : "-"}
                </span>
              </div>
            )}

            {/* Notes toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleNotes(segment.id)}
            >
              <MessageSquare className={cn(
                "h-4 w-4",
                segment.notes ? "text-primary" : "text-muted-foreground"
              )} />
            </Button>

            {/* Delete segment (only if multiple) */}
            {dayEntry.segments.length > 1 && !isLocked && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDeleteSegment(dayEntry.dateString, segment.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {/* Actions on first segment row */}
            {index === 0 && !isLocked && (
              <>
                {/* Add segment button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => onAddSegment(dayEntry.dateString)}
                >
                  <Plus className="h-3 w-3" />
                  Seg
                </Button>

                {/* Clear day button */}
                {hasAnyEntry && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onClearDay(dayEntry.dateString)}
                    title="Clear day"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Notes field (expandable) */}
          {showNotes[segment.id] && (
            <div className="px-3 pb-3 pl-14">
              <Textarea
                value={segment.notes}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { notes: e.target.value })}
                placeholder="Add notes for this entry..."
                className="h-16 text-sm resize-none"
                disabled={isLocked}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
