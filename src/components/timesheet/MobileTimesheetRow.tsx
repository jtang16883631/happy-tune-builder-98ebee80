import { useState } from "react";
import { Plus, MessageSquare, Trash2, X, ChevronDown, Clock, Briefcase, Building2, Utensils, Car, Home, MapPin, Palmtree, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DayEntry, TimesheetSegment, WORK_TYPES } from "./TimesheetRow";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
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

// Work type icons mapping
const WORK_TYPE_ICONS: Record<string, React.ReactNode> = {
  office: <Building2 className="h-5 w-5" />,
  hospital: <Briefcase className="h-5 w-5" />,
  travel_only: <Car className="h-5 w-5" />,
  lunch: <Utensils className="h-5 w-5" />,
  off_on_own: <Home className="h-5 w-5" />,
  off_on_road: <MapPin className="h-5 w-5" />,
  vacation: <Palmtree className="h-5 w-5" />,
  company_holiday: <PartyPopper className="h-5 w-5" />,
};

// Work type descriptions
const WORK_TYPE_DESCRIPTIONS: Record<string, string> = {
  office: "Regular office work hours",
  hospital: "On-site hospital audit work",
  travel_only: "Travel day (no work hours)",
  lunch: "Lunch break (deducted)",
  off_on_own: "Day off on your own time",
  off_on_road: "Day off while traveling",
  vacation: "Paid vacation day",
  company_holiday: "Company holiday",
};

// Parse flexible time input: "9", "900", "0900", "9:00", "09:00" → "HH:mm"
function parseTimeInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";

  let hours: number;
  let minutes: number;

  if (digits.length <= 2) {
    hours = parseInt(digits, 10);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = parseInt(digits.slice(0, 1), 10);
    minutes = parseInt(digits.slice(1), 10);
  } else {
    hours = parseInt(digits.slice(0, 2), 10);
    minutes = parseInt(digits.slice(2, 4), 10);
  }

  // Validate ranges (12-hour format)
  if (hours < 0 || hours > 12) hours = 12;
  if (minutes < 0 || minutes > 59) minutes = 0;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

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
  const [activeWorkTypePicker, setActiveWorkTypePicker] = useState<string | null>(null);

  // Calculate daily hours
  const calculateSegmentHours = (segment: TimesheetSegment) => {
    if (!segment.startTime || !segment.endTime) return 0;

    const workTypeConfig = WORK_TYPES.find((t) => t.id === segment.workType);
    if (!workTypeConfig?.countsHours) return 0;

    let startHour = parseInt(segment.startTime.split(":")[0]);
    const startMin = parseInt(segment.startTime.split(":")[1]) || 0;
    let endHour = parseInt(segment.endTime.split(":")[0]);
    const endMin = parseInt(segment.endTime.split(":")[1]) || 0;

    if (segment.startPeriod === "PM" && startHour !== 12) startHour += 12;
    if (segment.startPeriod === "AM" && startHour === 12) startHour = 0;
    if (segment.endPeriod === "PM" && endHour !== 12) endHour += 12;
    if (segment.endPeriod === "AM" && endHour === 12) endHour = 0;

    const totalMinutes = endHour * 60 + endMin - (startHour * 60 + startMin);
    return Math.max(0, totalMinutes / 60);
  };

  const dailyHours = dayEntry.segments.reduce((sum, seg) => sum + calculateSegmentHours(seg), 0);
  const hasAnyEntry = dayEntry.segments.some((s) => s.startTime || s.endTime || s.workType);

  const handleTimeBlur = (segmentId: string, field: "startTime" | "endTime", value: string) => {
    const parsed = parseTimeInput(value);
    if (parsed) {
      onUpdateSegment(dayEntry.dateString, segmentId, { [field]: parsed });
    }
  };

  const togglePeriod = (segmentId: string, field: "startPeriod" | "endPeriod", currentPeriod: "AM" | "PM") => {
    onUpdateSegment(dayEntry.dateString, segmentId, {
      [field]: currentPeriod === "AM" ? "PM" : "AM",
    });
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
    const type = WORK_TYPES.find((t) => t.id === workTypeId);
    return type?.label || "Select Work Type";
  };

  const getWorkTypeColor = (workTypeId: string) => {
    const type = WORK_TYPES.find((t) => t.id === workTypeId);
    return type?.color || "bg-muted";
  };

  return (
    <div className={cn("border-b transition-colors", dayEntry.isSelected && "bg-primary/5")}>
      {dayEntry.segments.map((segment, index) => (
        <div key={segment.id} className="p-4 space-y-4">
          {/* Day Header - only on first segment */}
          {index === 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={dayEntry.isSelected}
                  onCheckedChange={() => onToggleSelect(dayEntry.dateString)}
                  className="h-6 w-6"
                />
                <div>
                  <div className="font-bold text-lg">{dayName}</div>
                  <div className="text-sm text-muted-foreground">{format(dayEntry.date, "MMMM d, yyyy")}</div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-2xl font-bold",
                    dailyHours >= 8 ? "text-green-600" : dailyHours > 0 ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {dailyHours > 0 ? `${dailyHours.toFixed(1)}h` : "-"}
                </div>
                <div className="text-xs text-muted-foreground">hours</div>
              </div>
            </div>
          )}

          {/* Segment indicator for additional segments */}
          {index > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span className="font-medium">Entry {index + 1}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Time Inputs - Two Column Layout with text inputs */}
          <div className="grid grid-cols-2 gap-3">
            {/* Start Time */}
            <div
              className={cn(
                "flex flex-col p-3 rounded-xl border-2 transition-all",
                segment.startTime ? "border-primary/30 bg-primary/5" : "border-dashed border-muted-foreground/30",
                isLocked && "opacity-50"
              )}
            >
              <div className="flex items-center gap-1 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">START</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="9:00"
                  value={segment.startTime}
                  onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { startTime: e.target.value })}
                  onBlur={(e) => handleTimeBlur(segment.id, "startTime", e.target.value)}
                  className="flex-1 h-10 text-lg font-semibold text-center"
                  disabled={isLocked}
                />
                <Button
                  variant={segment.startPeriod === "AM" ? "default" : "outline"}
                  size="sm"
                  className="h-10 w-12 text-sm font-bold"
                  onClick={() => togglePeriod(segment.id, "startPeriod", segment.startPeriod)}
                  disabled={isLocked}
                >
                  {segment.startPeriod}
                </Button>
              </div>
            </div>

            {/* End Time */}
            <div
              className={cn(
                "flex flex-col p-3 rounded-xl border-2 transition-all",
                segment.endTime ? "border-primary/30 bg-primary/5" : "border-dashed border-muted-foreground/30",
                isLocked && "opacity-50"
              )}
            >
              <div className="flex items-center gap-1 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">END</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="5:00"
                  value={segment.endTime}
                  onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { endTime: e.target.value })}
                  onBlur={(e) => handleTimeBlur(segment.id, "endTime", e.target.value)}
                  className="flex-1 h-10 text-lg font-semibold text-center"
                  disabled={isLocked}
                />
                <Button
                  variant={segment.endPeriod === "PM" ? "default" : "outline"}
                  size="sm"
                  className="h-10 w-12 text-sm font-bold"
                  onClick={() => togglePeriod(segment.id, "endPeriod", segment.endPeriod)}
                  disabled={isLocked}
                >
                  {segment.endPeriod}
                </Button>
              </div>
            </div>
          </div>

          {/* Work Type Selection */}
          <Drawer open={activeWorkTypePicker === segment.id} onOpenChange={(open) => !open && setActiveWorkTypePicker(null)}>
            <DrawerTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                  segment.workType ? "border-primary/30 bg-primary/5" : "border-dashed border-muted-foreground/30",
                  isLocked && "opacity-50"
                )}
                onClick={() => setActiveWorkTypePicker(segment.id)}
                disabled={isLocked}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    segment.workType ? getWorkTypeColor(segment.workType) : "bg-muted"
                  )}
                >
                  {segment.workType ? WORK_TYPE_ICONS[segment.workType] : <Briefcase className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-xs text-muted-foreground font-medium">WORK TYPE</div>
                  <div className={cn("text-lg font-semibold", !segment.workType && "text-muted-foreground")}>
                    {getWorkTypeLabel(segment.workType)}
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </button>
            </DrawerTrigger>
            <DrawerContent className="bg-background max-h-[85vh]">
              <DrawerHeader className="border-b">
                <DrawerTitle className="text-center text-xl">Select Work Type</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 space-y-2 overflow-y-auto">
                {WORK_TYPES.map((type) => (
                  <button
                    key={type.id}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      segment.workType === type.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                    )}
                    onClick={() => handleWorkTypeSelect(segment.id, type.id)}
                  >
                    <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center text-white", type.color)}>
                      {WORK_TYPE_ICONS[type.id]}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold">{type.label}</div>
                      <div className="text-sm text-muted-foreground">{WORK_TYPE_DESCRIPTIONS[type.id]}</div>
                      {type.countsHours && (
                        <div className="text-xs text-green-600 font-medium mt-1">✓ Counts toward work hours</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </DrawerContent>
          </Drawer>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-sm"
              onClick={() => setShowNotes((prev) => ({ ...prev, [segment.id]: !prev[segment.id] }))}
            >
              <MessageSquare className={cn("h-4 w-4 mr-2", segment.notes ? "text-primary" : "text-muted-foreground")} />
              {segment.notes ? "Edit Notes" : "Notes"}
            </Button>

            {index === 0 && !isLocked && (
              <Button variant="ghost" size="sm" className="h-10 px-3 text-sm" onClick={() => onAddSegment(dayEntry.dateString)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            )}

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

            {index === 0 && hasAnyEntry && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-sm text-muted-foreground ml-auto"
                onClick={() => onClearDay(dayEntry.dateString)}
              >
                <X className="h-4 w-4 mr-2" />
                Clear Day
              </Button>
            )}
          </div>

          {/* Notes Input */}
          {showNotes[segment.id] && (
            <Textarea
              value={segment.notes}
              onChange={(e) => onUpdateSegment(dayEntry.dateString, segment.id, { notes: e.target.value })}
              placeholder="Add notes for this entry..."
              className="min-h-[100px] text-base resize-none"
              disabled={isLocked}
            />
          )}
        </div>
      ))}
    </div>
  );
}
