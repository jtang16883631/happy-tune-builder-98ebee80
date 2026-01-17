-- Allow privileged users to delete profiles
CREATE POLICY "Privileged users can delete profiles"
ON public.profiles
FOR DELETE
USING (is_privileged(auth.uid()));