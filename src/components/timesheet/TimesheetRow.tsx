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
      {dayEntry.segments.map((segment, index) => (
        <div key={segment.id}>
          <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted/20">
            {/* Checkbox - only on first segment */}
            {index === 0 ? (
              <Checkbox
                checked={dayEntry.isSelected}
                onCheckedChange={() => onToggleSelect(dayEntry.dateString)}
                className="h-4 w-4"
              />
            ) : (
              <div className="w-4" />
            )}

            {/* Day & Date */}
            {index === 0 ? (
              <div className="w-16 flex-shrink-0">
                <div className="font-medium text-sm">{dayName.slice(0, 3)}</div>
                <div className="text-xs text-muted-foreground">{format(dayEntry.date, "M/d")}</div>
              </div>
            ) : (
              <div className="w-16 flex-shrink-0 text-xs text-muted-foreground pl-2">+{index + 1}</div>
            )}

            {/* Start Time */}
            <div className="flex items-center">
              <Input
                type="text"
                placeholder="--:--"
                value={segment.startTime}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { startTime: e.target.value })}
                onBlur={(e) => handleTimeBlur(segment.id, "startTime", e.target.value)}
                className="w-16 h-8 text-sm px-2"
                disabled={isLocked}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-10 text-xs px-1"
                onClick={() => togglePeriod(segment.id, "startPeriod", segment.startPeriod)}
                disabled={isLocked}
              >
                {segment.startPeriod}
              </Button>
            </div>

            <span className="text-muted-foreground text-sm">-</span>

            {/* End Time */}
            <div className="flex items-center">
              <Input
                type="text"
                placeholder="--:--"
                value={segment.endTime}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { endTime: e.target.value })}
                onBlur={(e) => handleTimeBlur(segment.id, "endTime", e.target.value)}
                className="w-16 h-8 text-sm px-2"
                disabled={isLocked}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-10 text-xs px-1"
                onClick={() => togglePeriod(segment.id, "endPeriod", segment.endPeriod)}
                disabled={isLocked}
              >
                {segment.endPeriod}
              </Button>
            </div>

            {/* Work Type */}
            <Select
              value={segment.workType || "none"}
              onValueChange={(value) => handleWorkTypeChange(segment.id, value === "none" ? "" : value)}
              disabled={isLocked}
            >
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="none"><span className="text-muted-foreground">None</span></SelectItem>
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

            {/* Hours - only on first segment */}
            {index === 0 && (
              <div className="w-12 text-right">
                <span className={cn(
                  "font-medium text-sm",
                  dailyHours >= 8 ? "text-green-600" : dailyHours > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {dailyHours > 0 ? `${dailyHours.toFixed(1)}` : "-"}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-0.5 ml-auto">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleNotes(segment.id)}>
                <MessageSquare className={cn("h-3.5 w-3.5", segment.notes ? "text-primary" : "text-muted-foreground")} />
              </Button>
              
              {dayEntry.segments.length > 1 && !isLocked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/70 hover:text-destructive"
                  onClick={() => onDeleteSegment(dayEntry.dateString, segment.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              
              {index === 0 && !isLocked && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddSegment(dayEntry.dateString)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {hasAnyEntry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onClearDay(dayEntry.dateString)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          {showNotes[segment.id] && (
            <div className="px-3 pb-2 pl-10">
              <Textarea
                value={segment.notes}
                onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { notes: e.target.value })}
                placeholder="Notes..."
                className="h-12 text-sm resize-none"
                disabled={isLocked}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
