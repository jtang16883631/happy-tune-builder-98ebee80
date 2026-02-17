
-- Allow privileged users to update any suggestion (for status changes)
CREATE POLICY "Privileged users can update any suggestion"
ON public.suggestions
FOR UPDATE
USING (is_privileged(auth.uid()));
