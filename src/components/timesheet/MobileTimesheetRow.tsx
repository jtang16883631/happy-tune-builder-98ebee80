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
  travel: <Car className="h-5 w-5" />,
  lunch: <Utensils className="h-5 w-5" />,
  off_own: <Home className="h-5 w-5" />,
  off_road: <MapPin className="h-5 w-5" />,
  vacation: <Palmtree className="h-5 w-5" />,
  holiday: <PartyPopper className="h-5 w-5" />,
};

// Work type descriptions
const WORK_TYPE_DESCRIPTIONS: Record<string, string> = {
  office: "Regular office work hours",
  hospital: "On-site hospital audit work",
  travel: "Travel day (no work hours)",
  lunch: "Lunch break (deducted)",
  off_own: "Day off on your own time",
  off_road: "Day off while traveling",
  vacation: "Paid vacation day",
  holiday: "Company holiday",
};

// Hour options for picker
const HOURS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MINUTES = ["00", "15", "30", "45"];

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
  
  // Temp state for time picker
  const [tempHour, setTempHour] = useState("09");
  const [tempMinute, setTempMinute] = useState("00");
  const [tempPeriod, setTempPeriod] = useState<"AM" | "PM">("AM");

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

  const openTimePicker = (segmentId: string, field: "start" | "end", segment: TimesheetSegment) => {
    const time = field === "start" ? segment.startTime : segment.endTime;
    const period = field === "start" ? segment.startPeriod : segment.endPeriod;
    
    if (time) {
      const [h, m] = time.split(":");
      setTempHour(h);
      setTempMinute(m);
    } else {
      setTempHour(field === "start" ? "09" : "05");
      setTempMinute("00");
    }
    setTempPeriod(period);
    setActiveTimePicker({ segmentId, field });
  };

  const handleTimeConfirm = () => {
    if (!activeTimePicker) return;
    
    const { segmentId, field } = activeTimePicker;
    const timeString = `${tempHour}:${tempMinute}`;
    
    if (field === "start") {
      onUpdateSegment(dayEntry.dateString, segmentId, { 
        startTime: timeString, 
        startPeriod: tempPeriod 
      });
    } else {
      onUpdateSegment(dayEntry.dateString, segmentId, { 
        endTime: timeString, 
        endPeriod: tempPeriod 
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
    return type?.label || "Select Work Type";
  };

  const getWorkTypeColor = (workTypeId: string) => {
    const type = WORK_TYPES.find(t => t.id === workTypeId);
    return type?.color || "bg-muted";
  };

  const formatDisplayTime = (time: string, period: "AM" | "PM") => {
    if (!time) return "Tap to set";
    const [h, m] = time.split(":");
    return `${parseInt(h)}:${m} ${period}`;
  };

  return (
    <div className={cn(
      "border-b transition-colors",
      dayEntry.isSelected && "bg-primary/5"
    )}>
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
                <div className={cn(
                  "text-2xl font-bold",
                  dailyHours >= 8 ? "text-green-600" : dailyHours > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
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

          {/* Time Selection - Two Column Layout */}
          <div className="grid grid-cols-2 gap-3">
            {/* Start Time */}
            <Drawer 
              open={activeTimePicker?.segmentId === segment.id && activeTimePicker?.field === "start"} 
              onOpenChange={(open) => !open && setActiveTimePicker(null)}
            >
              <DrawerTrigger asChild>
                <button
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    segment.startTime 
                      ? "border-primary/30 bg-primary/5" 
                      : "border-dashed border-muted-foreground/30",
                    isLocked && "opacity-50"
                  )}
                  onClick={() => openTimePicker(segment.id, "start", segment)}
                  disabled={isLocked}
                >
                  <Clock className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground font-medium">START</span>
                  <span className={cn(
                    "text-xl font-bold mt-1",
                    !segment.startTime && "text-muted-foreground"
                  )}>
                    {formatDisplayTime(segment.startTime, segment.startPeriod)}
                  </span>
                </button>
              </DrawerTrigger>
              <DrawerContent className="bg-background">
                <DrawerHeader className="border-b">
                  <DrawerTitle className="text-center text-xl">Set Start Time</DrawerTitle>
                </DrawerHeader>
                <div className="p-6 space-y-6">
                  {/* Time Display */}
                  <div className="text-center text-4xl font-bold text-primary">
                    {tempHour}:{tempMinute} {tempPeriod}
                  </div>
                  
                  {/* Hour Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Hour</label>
                    <div className="grid grid-cols-6 gap-2">
                      {HOURS.map((h) => (
                        <Button
                          key={h}
                          variant={tempHour === h ? "default" : "outline"}
                          className="h-12 text-lg font-semibold"
                          onClick={() => setTempHour(h)}
                        >
                          {parseInt(h)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Minute Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Minute</label>
                    <div className="grid grid-cols-4 gap-2">
                      {MINUTES.map((m) => (
                        <Button
                          key={m}
                          variant={tempMinute === m ? "default" : "outline"}
                          className="h-12 text-lg font-semibold"
                          onClick={() => setTempMinute(m)}
                        >
                          :{m}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* AM/PM Toggle */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Period</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant={tempPeriod === "AM" ? "default" : "outline"}
                        className="h-14 text-xl font-bold"
                        onClick={() => setTempPeriod("AM")}
                      >
                        AM
                      </Button>
                      <Button
                        variant={tempPeriod === "PM" ? "default" : "outline"}
                        className="h-14 text-xl font-bold"
                        onClick={() => setTempPeriod("PM")}
                      >
                        PM
                      </Button>
                    </div>
                  </div>
                </div>
                <DrawerFooter className="border-t pt-4">
                  <Button className="h-14 text-lg font-semibold" onClick={handleTimeConfirm}>
                    Confirm Time
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="outline" className="h-12">Cancel</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>

            {/* End Time */}
            <Drawer 
              open={activeTimePicker?.segmentId === segment.id && activeTimePicker?.field === "end"} 
              onOpenChange={(open) => !open && setActiveTimePicker(null)}
            >
              <DrawerTrigger asChild>
                <button
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    segment.endTime 
                      ? "border-primary/30 bg-primary/5" 
                      : "border-dashed border-muted-foreground/30",
                    isLocked && "opacity-50"
                  )}
                  onClick={() => openTimePicker(segment.id, "end", segment)}
                  disabled={isLocked}
                >
                  <Clock className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground font-medium">END</span>
                  <span className={cn(
                    "text-xl font-bold mt-1",
                    !segment.endTime && "text-muted-foreground"
                  )}>
                    {formatDisplayTime(segment.endTime, segment.endPeriod)}
                  </span>
                </button>
              </DrawerTrigger>
              <DrawerContent className="bg-background">
                <DrawerHeader className="border-b">
                  <DrawerTitle className="text-center text-xl">Set End Time</DrawerTitle>
                </DrawerHeader>
                <div className="p-6 space-y-6">
                  {/* Time Display */}
                  <div className="text-center text-4xl font-bold text-primary">
                    {tempHour}:{tempMinute} {tempPeriod}
                  </div>
                  
                  {/* Hour Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Hour</label>
                    <div className="grid grid-cols-6 gap-2">
                      {HOURS.map((h) => (
                        <Button
                          key={h}
                          variant={tempHour === h ? "default" : "outline"}
                          className="h-12 text-lg font-semibold"
                          onClick={() => setTempHour(h)}
                        >
                          {parseInt(h)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Minute Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Minute</label>
                    <div className="grid grid-cols-4 gap-2">
                      {MINUTES.map((m) => (
                        <Button
                          key={m}
                          variant={tempMinute === m ? "default" : "outline"}
                          className="h-12 text-lg font-semibold"
                          onClick={() => setTempMinute(m)}
                        >
                          :{m}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* AM/PM Toggle */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Period</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant={tempPeriod === "AM" ? "default" : "outline"}
                        className="h-14 text-xl font-bold"
                        onClick={() => setTempPeriod("AM")}
                      >
                        AM
                      </Button>
                      <Button
                        variant={tempPeriod === "PM" ? "default" : "outline"}
                        className="h-14 text-xl font-bold"
                        onClick={() => setTempPeriod("PM")}
                      >
                        PM
                      </Button>
                    </div>
                  </div>
                </div>
                <DrawerFooter className="border-t pt-4">
                  <Button className="h-14 text-lg font-semibold" onClick={handleTimeConfirm}>
                    Confirm Time
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="outline" className="h-12">Cancel</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Work Type Selection */}
          <Drawer 
            open={activeWorkTypePicker === segment.id} 
            onOpenChange={(open) => !open && setActiveWorkTypePicker(null)}
          >
            <DrawerTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                  segment.workType 
                    ? "border-primary/30 bg-primary/5" 
                    : "border-dashed border-muted-foreground/30",
                  isLocked && "opacity-50"
                )}
                onClick={() => setActiveWorkTypePicker(segment.id)}
                disabled={isLocked}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  segment.workType ? getWorkTypeColor(segment.workType) : "bg-muted"
                )}>
                  {segment.workType ? WORK_TYPE_ICONS[segment.workType] : <Briefcase className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-xs text-muted-foreground font-medium">WORK TYPE</div>
                  <div className={cn(
                    "text-lg font-semibold",
                    !segment.workType && "text-muted-foreground"
                  )}>
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
                      segment.workType === type.id 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => handleWorkTypeSelect(segment.id, type.id)}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center text-white",
                      type.color
                    )}>
                      {WORK_TYPE_ICONS[type.id]}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold">{type.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {WORK_TYPE_DESCRIPTIONS[type.id]}
                      </div>
                      {type.countsHours && (
                        <div className="text-xs text-green-600 font-medium mt-1">
                          ✓ Counts toward work hours
                        </div>
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
              onClick={() => setShowNotes(prev => ({ ...prev, [segment.id]: !prev[segment.id] }))}
            >
              <MessageSquare className={cn("h-4 w-4 mr-2", segment.notes ? "text-primary" : "text-muted-foreground")} />
              {segment.notes ? "Edit Notes" : "Notes"}
            </Button>

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
