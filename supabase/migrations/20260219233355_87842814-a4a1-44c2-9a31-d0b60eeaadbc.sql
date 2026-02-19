
-- Drop the restrictive INSERT policy and replace with one that allows any authenticated user to insert their own template
DROP POLICY IF EXISTS "Privileged users can insert templates" ON public.data_templates;

CREATE POLICY "Authenticated users can insert their own templates"
ON public.data_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);
