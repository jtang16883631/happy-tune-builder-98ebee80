-- Drop existing RLS policies for data_templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.data_templates;
DROP POLICY IF EXISTS "Users can insert their own templates" ON public.data_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.data_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.data_templates;

-- Create new policies: All authenticated users can view, managers can modify
CREATE POLICY "Authenticated users can view all templates"
ON public.data_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can insert templates"
ON public.data_templates FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update templates"
ON public.data_templates FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete templates"
ON public.data_templates FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Update sections policies - all authenticated can view
DROP POLICY IF EXISTS "Users can view sections of their templates" ON public.template_sections;
DROP POLICY IF EXISTS "Users can insert sections to their templates" ON public.template_sections;
DROP POLICY IF EXISTS "Users can delete sections from their templates" ON public.template_sections;

CREATE POLICY "Authenticated users can view all sections"
ON public.template_sections FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can insert sections"
ON public.template_sections FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete sections"
ON public.template_sections FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Update cost_items policies - all authenticated can view
DROP POLICY IF EXISTS "Users can view cost items of their templates" ON public.template_cost_items;
DROP POLICY IF EXISTS "Users can insert cost items to their templates" ON public.template_cost_items;
DROP POLICY IF EXISTS "Users can delete cost items from their templates" ON public.template_cost_items;

CREATE POLICY "Authenticated users can view all cost items"
ON public.template_cost_items FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can insert cost items"
ON public.template_cost_items FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete cost items"
ON public.template_cost_items FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Drop scan_records table - keeping it local only
DROP TABLE IF EXISTS public.template_scan_records;