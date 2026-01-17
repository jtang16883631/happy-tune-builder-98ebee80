-- Drop function with CASCADE to drop all dependent objects
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

-- Backup role data before dropping the column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_temp text;
UPDATE public.user_roles SET role_temp = role::text WHERE role_temp IS NULL;

-- Drop the role column
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS role;

-- Drop the old enum type
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Create new enum with updated roles
CREATE TYPE public.app_role AS ENUM ('auditor', 'developer', 'coordinator', 'owner');

-- Add the new role column with the new enum type
ALTER TABLE public.user_roles ADD COLUMN role public.app_role NOT NULL DEFAULT 'auditor';

-- Migrate existing roles to new roles (scanner -> auditor, manager -> owner)
UPDATE public.user_roles 
SET role = CASE 
  WHEN role_temp = 'scanner' THEN 'auditor'::public.app_role
  WHEN role_temp = 'manager' THEN 'owner'::public.app_role
  ELSE 'auditor'::public.app_role
END;

-- Drop the temporary column
ALTER TABLE public.user_roles DROP COLUMN role_temp;

-- Create the has_role function with new roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create a helper function to check if user has any privileged role (developer or owner)
CREATE OR REPLACE FUNCTION public.is_privileged(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('developer', 'owner')
  )
$$;

-- Create a helper function to check if user is owner
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
  )
$$;

-- Create a helper function to check if user is developer (can delete users)
CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'developer'
  )
$$;

-- Recreate policies for user_roles
CREATE POLICY "Privileged users can insert roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update roles" 
ON public.user_roles 
FOR UPDATE 
USING (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate policies for data_templates
CREATE POLICY "Privileged users can insert templates" 
ON public.data_templates 
FOR INSERT 
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update templates" 
ON public.data_templates 
FOR UPDATE 
USING (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete templates" 
ON public.data_templates 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate policies for drugs
CREATE POLICY "Privileged users can insert drugs" 
ON public.drugs 
FOR INSERT 
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update drugs" 
ON public.drugs 
FOR UPDATE 
USING (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete drugs" 
ON public.drugs 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate policies for template_cost_items
CREATE POLICY "Privileged users can insert cost items" 
ON public.template_cost_items 
FOR INSERT 
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete cost items" 
ON public.template_cost_items 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate policies for template_sections
CREATE POLICY "Privileged users can insert sections" 
ON public.template_sections 
FOR INSERT 
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update sections" 
ON public.template_sections 
FOR UPDATE 
USING (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete sections" 
ON public.template_sections 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate policy for timesheet_entries
CREATE POLICY "Privileged users can delete timesheet entries" 
ON public.timesheet_entries 
FOR DELETE 
USING (is_privileged(auth.uid()));

-- Recreate storage policies
CREATE POLICY "Privileged users can upload files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'uploads' AND is_privileged(auth.uid()));

CREATE POLICY "Privileged users can view uploaded files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'uploads' AND is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete uploaded files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'uploads' AND is_privileged(auth.uid()));