import { useState, useEffect } from "react";
import { Clock, Coffee, LogIn, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QuickClockEntry {
  type: "clock_in" | "lunch_start" | "lunch_end" | "clock_out";
  time: string; // HH:mm 24h
  timestamp: Date;
}

interface QuickClockPanelProps {
  userId: string;
  onSaved?: () => void;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getNow24(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

function to12Hour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getPeriod(time: string): "AM" | "PM" {
  const [h] = time.split(":").map(Number);
  return h >= 12 ? "PM" : "AM";
}

function calcHours(start: string, end: string, lunchStart?: string, lunchEnd?: string): number {
  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let total = toMins(end) - toMins(start);
  if (lunchStart && lunchEnd) {
    total -= toMins(lunchEnd) - toMins(lunchStart);
  }
  return Math.max(0, total / 60);
}

export function QuickClockPanel({ userId, onSaved }: QuickClockPanelProps) {
  const { toast } = useToast();
  const [nowStr, setNowStr] = useState(() => {
    const now = new Date();
    return format(now, "hh:mm:ss a");
  });
  const [isSaving, setIsSaving] = useState(false);

  // Store quick-clock state in localStorage keyed by date
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const storageKey = `quick_clock:${userId}:${todayKey}`;

  const [entries, setEntries] = useState<QuickClockEntry[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map((e: QuickClockEntry) => ({ ...e, timestamp: new Date(e.timestamp) }));
    } catch {
      return [];
    }
  });

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowStr(format(now, "hh:mm:ss a"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const saveEntries = (next: QuickClockEntry[]) => {
    setEntries(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const hasType = (type: QuickClockEntry["type"]) => entries.some((e) => e.type === type);

  const clockIn = !hasType("clock_in");
  const canLunchStart = hasType("clock_in") && !hasType("lunch_start");
  const canLunchEnd = hasType("lunch_start") && !hasType("lunch_end");
  const canClockOut = hasType("clock_in") && !hasType("clock_out");

  const handleAction = async (type: QuickClockEntry["type"]) => {
    const time = getNow24();
    const next = [...entries, { type, time, timestamp: new Date() }];
    saveEntries(next);

    // Auto-save to timesheet on clock out
    if (type === "clock_out") {
      const clockInEntry = next.find((e) => e.type === "clock_in");
      const lunchStartEntry = next.find((e) => e.type === "lunch_start");
      const lunchEndEntry = next.find((e) => e.type === "lunch_end");
      if (clockInEntry) {
        setIsSaving(true);
        try {
          const hours = calcHours(clockInEntry.time, time, lunchStartEntry?.time, lunchEndEntry?.time);
          const breakMins = lunchStartEntry && lunchEndEntry
            ? Math.round(
                (new Date(`2000-01-01T${lunchEndEntry.time}`).getTime() -
                 new Date(`2000-01-01T${lunchStartEntry.time}`).getTime()) / 60000
              )
            : 0;

          // Fetch existing quick-clock entries for today (can't delete as office_admin)
          const { data: existing } = await supabase
            .from("timesheet_entries")
            .select("id, client_name")
            .eq("user_id", userId)
            .eq("work_date", todayKey)
            .in("notes", ["Quick clock", "Lunch"]);

          const existingWork = existing?.find((e) => e.client_name === "office");
          const existingLunch = existing?.find((e) => e.client_name === "lunch");

          // Upsert work entry
          const workPayload = {
            user_id: userId,
            work_date: todayKey,
            start_time: clockInEntry.time,
            end_time: time,
            hours_worked: hours,
            break_minutes: breakMins,
            client_name: "office",
            notes: "Quick clock",
            status: "draft",
          };

          if (existingWork) {
            await supabase.from("timesheet_entries").update(workPayload).eq("id", existingWork.id);
          } else {
            await supabase.from("timesheet_entries").insert(workPayload);
          }

          // Upsert lunch entry if applicable
          if (lunchStartEntry && lunchEndEntry) {
            const lunchPayload = {
              user_id: userId,
              work_date: todayKey,
              start_time: lunchStartEntry.time,
              end_time: lunchEndEntry.time,
              hours_worked: 0,
              break_minutes: 0,
              client_name: "lunch",
              notes: "Lunch",
              status: "draft",
            };
            if (existingLunch) {
              await supabase.from("timesheet_entries").update(lunchPayload).eq("id", existingLunch.id);
            } else {
              await supabase.from("timesheet_entries").insert(lunchPayload);
            }
          }

          toast({ title: "Clocked Out ✓", description: "Timesheet saved as draft automatically" });
          onSaved?.();
        } catch (err: any) {
          toast({ title: "Error saving", description: err.message, variant: "destructive" });
        } finally {
          setIsSaving(false);
        }
      }
    }
  };

  const handleReset = () => {
    saveEntries([]);
    localStorage.removeItem(storageKey);
  };

  const getStatusLabel = () => {
    if (hasType("clock_out")) return { label: "Clocked Out", color: "bg-muted text-muted-foreground" };
    if (hasType("lunch_end")) return { label: "Back from Lunch", color: "bg-secondary text-secondary-foreground" };
    if (hasType("lunch_start")) return { label: "On Lunch", color: "bg-accent text-accent-foreground" };
    if (hasType("clock_in")) return { label: "Clocked In", color: "bg-primary/10 text-primary" };
    return { label: "Not Started", color: "bg-muted text-muted-foreground" };
  };

  const status = getStatusLabel();

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Title + live clock */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Quick Clock</p>
              <p className="text-xs text-muted-foreground font-mono">{nowStr}</p>
            </div>
            <Badge className={cn("text-xs ml-1 shrink-0", status.color)} variant="outline">
              {status.label}
            </Badge>
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {clockIn && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleAction("clock_in")}
              >
                <LogIn className="h-3.5 w-3.5" />
                Clock In
              </Button>
            )}

            {canLunchStart && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 text-xs"
                onClick={() => handleAction("lunch_start")}
              >
                <Coffee className="h-3.5 w-3.5" />
                Start Lunch
              </Button>
            )}

            {canLunchEnd && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 text-xs"
                onClick={() => handleAction("lunch_end")}
              >
                <Coffee className="h-3.5 w-3.5" />
                End Lunch
              </Button>
            )}

            {canClockOut && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={() => handleAction("clock_out")}
              >
                <LogOut className="h-3.5 w-3.5" />
                Clock Out
              </Button>
            )}

            {/* Loading indicator while auto-saving on clock out */}
            {isSaving && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </div>
            )}

            {/* Reset */}
            {entries.length > 0 && !isSaving && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={handleReset}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Timeline summary */}
        {entries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-primary/10 flex flex-wrap gap-3">
            {entries.map((entry) => {
              const icons: Record<QuickClockEntry["type"], JSX.Element> = {
                clock_in: <LogIn className="h-3 w-3 text-primary" />,
                lunch_start: <Coffee className="h-3 w-3 text-secondary-foreground" />,
                lunch_end: <Coffee className="h-3 w-3 text-secondary-foreground" />,
                clock_out: <LogOut className="h-3 w-3 text-destructive" />,
              };
              const labels: Record<QuickClockEntry["type"], string> = {
                clock_in: "In",
                lunch_start: "Lunch ↓",
                lunch_end: "Lunch ↑",
                clock_out: "Out",
              };
              return (
                <div key={entry.type} className="flex items-center gap-1 text-xs text-muted-foreground">
                  {icons[entry.type]}
                  <span className="font-medium text-foreground">{labels[entry.type]}</span>
                  <span>{formatTimeLabel(entry.time)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
