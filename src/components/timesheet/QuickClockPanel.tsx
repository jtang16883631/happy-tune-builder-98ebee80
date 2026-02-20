import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, Coffee, LogIn, LogOut, Loader2, WifiOff, RefreshCw } from "lucide-react";
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
  userRole?: string | null; // used to auto-set work type on clock-out
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

/** Returns the work type client_name based on the user's role */
function getWorkTypeForRole(role?: string | null): string {
  if (role === 'office_admin') return 'office';
  if (role === 'coordinator' || role === 'auditor') return 'hospital';
  return 'office'; // default
}

async function pushToTimesheet(
  userId: string,
  todayKey: string,
  entries: QuickClockEntry[],
  clockOutTime: string,
  workType: string
): Promise<void> {
  const clockInEntry = entries.find((e) => e.type === "clock_in");
  const lunchStartEntry = entries.find((e) => e.type === "lunch_start");
  const lunchEndEntry = entries.find((e) => e.type === "lunch_end");
  if (!clockInEntry) return;

  // Delete previous quick-clock draft entries for today (we have delete RLS for own drafts)
  await supabase
    .from("timesheet_entries")
    .delete()
    .eq("user_id", userId)
    .eq("work_date", todayKey)
    .eq("status", "draft")
    .in("notes", ["Quick clock", "Lunch"]);

  const hours = calcHours(clockInEntry.time, clockOutTime, lunchStartEntry?.time, lunchEndEntry?.time);
  const entriesToInsert: any[] = [
    {
      user_id: userId,
      work_date: todayKey,
      start_time: clockInEntry.time,
      end_time: clockOutTime,
      hours_worked: hours,
      break_minutes:
        lunchStartEntry && lunchEndEntry
          ? Math.round(
              (new Date(`2000-01-01T${lunchEndEntry.time}`).getTime() -
                new Date(`2000-01-01T${lunchStartEntry.time}`).getTime()) /
                60000
            )
          : 0,
      client_name: workType,
      notes: "Quick clock",
      status: "draft",
    },
  ];

  if (lunchStartEntry && lunchEndEntry) {
    entriesToInsert.push({
      user_id: userId,
      work_date: todayKey,
      start_time: lunchStartEntry.time,
      end_time: lunchEndEntry.time,
      hours_worked: 0,
      break_minutes: 0,
      client_name: "lunch",
      notes: "Lunch",
      status: "draft",
    });
  }

  const { error } = await supabase.from("timesheet_entries").insert(entriesToInsert);
  if (error) throw error;
}

export function QuickClockPanel({ userId, userRole, onSaved }: QuickClockPanelProps) {
  const { toast } = useToast();
  const [nowStr, setNowStr] = useState(() => format(new Date(), "hh:mm:ss a"));
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(false);
  const hasSynced = useRef(false);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const storageKey = `quick_clock:${userId}:${todayKey}`;
  // Key to store a pending offline clock-out that needs syncing
  const pendingKey = `quick_clock_pending:${userId}:${todayKey}`;

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

  // Check for a pending offline sync on mount
  useEffect(() => {
    const pending = localStorage.getItem(pendingKey);
    if (pending) setPendingSync(true);
  }, [pendingKey]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNowStr(format(new Date(), "hh:mm:ss a")), 1000);
    return () => clearInterval(timer);
  }, []);

  // Online/offline detection + auto-sync when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const pending = localStorage.getItem(pendingKey);
      if (pending && !hasSynced.current) {
        hasSynced.current = true;
        try {
          const { clockOutTime, entries: savedEntries } = JSON.parse(pending);
          const restoredEntries: QuickClockEntry[] = savedEntries.map((e: QuickClockEntry) => ({
            ...e,
            timestamp: new Date(e.timestamp),
          }));
          await pushToTimesheet(userId, todayKey, restoredEntries, clockOutTime, getWorkTypeForRole(userRole));
          localStorage.removeItem(pendingKey);
          setPendingSync(false);
          toast({
            title: "Synced ✓",
            description: "Your offline clock-out has been saved to your timesheet.",
          });
          onSaved?.();
        } catch (err: any) {
          hasSynced.current = false;
          toast({
            title: "Sync failed",
            description: err.message,
            variant: "destructive",
          });
        }
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [userId, todayKey, pendingKey, onSaved, toast]);

  const saveEntries = (next: QuickClockEntry[]) => {
    setEntries(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const hasType = (type: QuickClockEntry["type"]) => entries.some((e) => e.type === type);

  const canClockIn = !hasType("clock_in");
  const canLunchStart = hasType("clock_in") && !hasType("lunch_start");
  const canLunchEnd = hasType("lunch_start") && !hasType("lunch_end");
  const canClockOut = hasType("clock_in") && !hasType("clock_out");

  const handleAction = async (type: QuickClockEntry["type"]) => {
    const time = getNow24();
    const next = [...entries, { type, time, timestamp: new Date() }];
    saveEntries(next);

    if (type === "clock_out") {
      if (!isOnline) {
        // Queue for sync when back online
        localStorage.setItem(pendingKey, JSON.stringify({ clockOutTime: time, entries: next }));
        setPendingSync(true);
        toast({
          title: "Saved offline",
          description: "You're offline. Your timesheet will be filled automatically when you reconnect.",
        });
        return;
      }

      setIsSaving(true);
      try {
        await pushToTimesheet(userId, todayKey, next, time, getWorkTypeForRole(userRole));
        toast({ title: "Clocked Out ✓", description: "Timesheet saved as draft automatically" });
        onSaved?.();
      } catch (err: any) {
        toast({ title: "Error saving", description: err.message, variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Manual retry sync
  const handleManualSync = useCallback(async () => {
    const pending = localStorage.getItem(pendingKey);
    if (!pending || !isOnline) return;
    setIsSaving(true);
    try {
      const { clockOutTime, entries: savedEntries } = JSON.parse(pending);
      const restoredEntries: QuickClockEntry[] = savedEntries.map((e: QuickClockEntry) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
      await pushToTimesheet(userId, todayKey, restoredEntries, clockOutTime, getWorkTypeForRole(userRole));
      localStorage.removeItem(pendingKey);
      setPendingSync(false);
      toast({ title: "Synced ✓", description: "Timesheet saved as draft." });
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [pendingKey, isOnline, userId, todayKey, onSaved, toast]);

  const handleReset = () => {
    saveEntries([]);
    localStorage.removeItem(storageKey);
    localStorage.removeItem(pendingKey);
    setPendingSync(false);
    hasSynced.current = false;
  };

  const getStatusLabel = () => {
    if (pendingSync) return { label: "Pending Sync", color: "bg-yellow-500/10 text-yellow-600" };
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
            {!isOnline && (
              <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-500/40 bg-yellow-500/10 shrink-0">
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {canClockIn && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => handleAction("clock_in")}>
                <LogIn className="h-3.5 w-3.5" />
                Clock In
              </Button>
            )}

            {canLunchStart && (
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={() => handleAction("lunch_start")}>
                <Coffee className="h-3.5 w-3.5" />
                Start Lunch
              </Button>
            )}

            {canLunchEnd && (
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={() => handleAction("lunch_end")}>
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

            {/* Pending offline sync — manual retry */}
            {pendingSync && isOnline && !isSaving && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs text-yellow-600 border-yellow-500/40" onClick={handleManualSync}>
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Now
              </Button>
            )}

            {isSaving && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </div>
            )}

            {entries.length > 0 && !isSaving && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={handleReset}>
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Offline notice */}
        {pendingSync && !isOnline && (
          <div className="mt-3 pt-3 border-t border-yellow-500/20 flex items-center gap-2 text-xs text-yellow-600">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Clock-out saved offline. Your timesheet will be filled automatically when you reconnect.
          </div>
        )}

        {/* Timeline summary */}
        {entries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-primary/10 flex flex-wrap gap-3">
            {entries.map((entry) => {
              const icons: Record<QuickClockEntry["type"], JSX.Element> = {
                clock_in: <LogIn className="h-3 w-3 text-primary" />,
                lunch_start: <Coffee className="h-3 w-3 text-muted-foreground" />,
                lunch_end: <Coffee className="h-3 w-3 text-muted-foreground" />,
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
