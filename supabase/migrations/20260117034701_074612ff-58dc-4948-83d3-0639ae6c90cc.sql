-- Add new columns to profiles table for detailed name info
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS middle_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

-- Create announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true
);

-- Enable RLS on announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Create read notifications table to track who has read what
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

-- Enable RLS on announcement_reads
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Policies for announcements
CREATE POLICY "Authenticated users can view active announcements"
ON public.announcements
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Privileged users can create announcements"
ON public.announcements
FOR INSERT
WITH CHECK (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update announcements"
ON public.announcements
FOR UPDATE
USING (is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete announcements"
ON public.announcements
FOR DELETE
USING (is_privileged(auth.uid()));

-- Policies for announcement_reads
CREATE POLICY "Users can view their own read status"
ON public.announcement_reads
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark announcements as read"
ON public.announcement_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Update profiles policy to allow users to update their own profile (for completing profile)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);