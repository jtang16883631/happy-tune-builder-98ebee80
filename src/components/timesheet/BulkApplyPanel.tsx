import { useState } from "react";
import { X, Check, Building2, Hospital, Plane, Palmtree, Car, Home, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const WORK_TYPES = [
  { id: "office", label: "Office", color: "bg-green-500" },
  { id: "hospital", label: "Hospital", color: "bg-blue-500" },
  { id: "travel", label: "Travel", color: "bg-orange-500" },
  { id: "vacation", label: "Vacation", color: "bg-pink-500" },
];

// Quick templates for one-click application
const QUICK_TEMPLATES = [
  { id: "office", label: "Office", icon: Building2, startTime: "09:00", endTime: "17:00", workType: "office", addLunch: true, bgColor: "bg-green-100 text-green-600 hover:bg-green-200" },
  { id: "hospital", label: "Hospital", icon: Hospital, startTime: "07:30", endTime: "16:00", workType: "hospital", addLunch: false, bgColor: "bg-blue-100 text-blue-600 hover:bg-blue-200" },
  { id: "travel_only", label: "Travel", icon: Plane, startTime: "", endTime: "", workType: "travel_only", addLunch: false, bgColor: "bg-purple-100 text-purple-600 hover:bg-purple-200" },
  { id: "vacation", label: "Vacation", icon: Palmtree, startTime: "", endTime: "", workType: "vacation", addLunch: false, bgColor: "bg-pink-100 text-pink-600 hover:bg-pink-200" },
  { id: "off_on_own", label: "Off Own", icon: Home, startTime: "", endTime: "", workType: "off_on_own", addLunch: false, bgColor: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
  { id: "off_on_road", label: "Off Road", icon: Car, startTime: "", endTime: "", workType: "off_on_road", addLunch: false, bgColor: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
  { id: "company_holiday", label: "Holiday", icon: Calendar, startTime: "", endTime: "", workType: "company_holiday", addLunch: false, bgColor: "bg-red-100 text-red-600 hover:bg-red-200" },
];

interface BulkApplyPanelProps {
  selectedCount: number;
  onApply: (settings: {
    workType: string;
    startTime: string;
    endTime: string;
    autoLunch: boolean;
    lunchMinutes: number;
  }) => void;
  onClear: () => void;
}

export function BulkApplyPanel({ selectedCount, onApply, onClear }: BulkApplyPanelProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [workType, setWorkType] = useState("office");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [autoLunch, setAutoLunch] = useState(true);
  const [lunchMinutes, setLunchMinutes] = useState(60);

  if (selectedCount === 0) return null;

  const handleApplyCustom = () => {
    onApply({
      workType,
      startTime,
      endTime,
      autoLunch,
      lunchMinutes,
    });
  };

  const handleQuickTemplate = (template: typeof QUICK_TEMPLATES[0]) => {
    onApply({
      workType: template.workType,
      startTime: template.startTime,
      endTime: template.endTime,
      autoLunch: template.addLunch,
      lunchMinutes: template.addLunch ? 60 : 0,
    });
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-background border-2 border-primary rounded-xl shadow-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selected count */}
          <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium text-sm">
            {selectedCount} day{selectedCount > 1 ? "s" : ""}
          </div>

          <div className="w-px h-8 bg-border" />

          {/* Quick Template Buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => handleQuickTemplate(template)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all",
                    template.bgColor
                  )}
                  title={template.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{template.label}</span>
                </button>
              );
            })}
          </div>

          <div className="w-px h-8 bg-border" />

          {/* Toggle Custom */}
          <Button
            variant={showCustom ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowCustom(!showCustom)}
          >
            Custom
          </Button>

          {/* Clear button */}
          <Button variant="ghost" size="icon" onClick={onClear} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Custom options (collapsible) */}
        {showCustom && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t flex-wrap">
            {/* Work type pills */}
            <div className="flex gap-1">
              {WORK_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setWorkType(type.id)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-full transition-all",
                    workType === type.id
                      ? `${type.color} text-white`
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-border" />

            {/* Time inputs */}
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-24 h-8 text-sm"
              />
              <span className="text-muted-foreground text-sm">-</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-24 h-8 text-sm"
              />
            </div>

            <div className="w-px h-6 bg-border" />

            {/* Auto lunch */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={autoLunch}
                onCheckedChange={(checked) => setAutoLunch(!!checked)}
              />
              <span className="text-sm">Lunch</span>
              {autoLunch && (
                <select
                  value={lunchMinutes}
                  onChange={(e) => setLunchMinutes(Number(e.target.value))}
                  className="text-xs border rounded px-2 py-1 bg-background"
                >
                  <option value={30}>30m</option>
                  <option value={60}>1h</option>
                </select>
              )}
            </label>

            <Button onClick={handleApplyCustom} size="sm" className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
