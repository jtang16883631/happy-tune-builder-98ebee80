CREATE POLICY "Users can delete their own draft timesheet entries"
ON public.timesheet_entries
FOR DELETE
USING (auth.uid() = user_id AND status = 'draft');