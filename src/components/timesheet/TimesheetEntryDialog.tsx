import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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

interface TeamMember {
  id: string;
  name: string;
  color: string | null;
}

interface FormData {
  work_date: string;
  team_member_id: string;
  start_time: string;
  end_time: string;
  hours_worked: string;
  break_minutes: string;
  client_name: string;
  notes: string;
}

interface TimesheetEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimesheetEntry | null;
  selectedDate: Date;
  teamMembers: TeamMember[];
}

export function TimesheetEntryDialog({
  open,
  onOpenChange,
  entry,
  selectedDate,
  teamMembers,
}: TimesheetEntryDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = !!entry;

  const form = useForm<FormData>({
    defaultValues: {
      work_date: format(selectedDate, "yyyy-MM-dd"),
      team_member_id: "",
      start_time: "09:00",
      end_time: "17:00",
      hours_worked: "8",
      break_minutes: "0",
      client_name: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (entry) {
        form.reset({
          work_date: entry.work_date,
          team_member_id: entry.team_member_id || "",
          start_time: entry.start_time || "09:00",
          end_time: entry.end_time || "17:00",
          hours_worked: String(entry.hours_worked),
          break_minutes: String(entry.break_minutes || 0),
          client_name: entry.client_name || "",
          notes: entry.notes || "",
        });
      } else {
        form.reset({
          work_date: format(selectedDate, "yyyy-MM-dd"),
          team_member_id: "",
          start_time: "09:00",
          end_time: "17:00",
          hours_worked: "8",
          break_minutes: "0",
          client_name: "",
          notes: "",
        });
      }
    }
  }, [open, entry, selectedDate, form]);

  // Calculate hours based on start/end time
  const calculateHours = (start: string, end: string, breakMins: number) => {
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes - breakMins;
    return Math.max(0, totalMinutes / 60).toFixed(2);
  };

  // Watch time fields and auto-calculate hours
  const watchStartTime = form.watch("start_time");
  const watchEndTime = form.watch("end_time");
  const watchBreakMinutes = form.watch("break_minutes");

  useEffect(() => {
    if (watchStartTime && watchEndTime) {
      const hours = calculateHours(
        watchStartTime,
        watchEndTime,
        Number(watchBreakMinutes) || 0
      );
      form.setValue("hours_worked", hours);
    }
  }, [watchStartTime, watchEndTime, watchBreakMinutes, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        user_id: user?.id,
        work_date: data.work_date,
        team_member_id: data.team_member_id || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        hours_worked: parseFloat(data.hours_worked) || 0,
        break_minutes: parseInt(data.break_minutes) || 0,
        client_name: data.client_name || null,
        notes: data.notes || null,
        status: "pending",
      };

      if (isEditing && entry) {
        const { error } = await supabase
          .from("timesheet_entries")
          .update(payload)
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timesheet_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-entries"] });
      toast({
        title: isEditing ? "Updated" : "Added",
        description: `Time entry has been ${isEditing ? "updated" : "added"} successfully`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Time Entry" : "Add Time Entry"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="work_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="team_member_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Member</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="break_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Break (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hours_worked"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours Worked</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.25" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client/Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter client or project name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Work description..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}