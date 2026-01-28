-- Add owner_id column if it doesn't exist (maps to existing created_by)
ALTER TABLE public.chat_rooms 
ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Populate owner_id from created_by for existing rows
UPDATE public.chat_rooms 
SET owner_id = created_by 
WHERE owner_id IS NULL AND created_by IS NOT NULL;

-- Add meta column for optional metadata
ALTER TABLE public.chat_rooms 
ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

-- Make owner_id not null after populating
ALTER TABLE public.chat_rooms 
ALTER COLUMN owner_id SET NOT NULL;

-- Drop old RLS policies on chat_rooms
DROP POLICY IF EXISTS "Users can create rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Users can view rooms they are members of" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room admins can delete rooms" ON public.chat_rooms;

-- Create new simplified RLS policies
-- SELECT: authenticated users can read rooms they own OR are members of
CREATE POLICY "Users can view their own rooms or member rooms"
ON public.chat_rooms
FOR SELECT
USING (
  auth.uid() = owner_id 
  OR is_room_member(auth.uid(), id)
);

-- INSERT: only owner can insert (service_role bypasses this, but good for safety)
CREATE POLICY "Owner can insert rooms"
ON public.chat_rooms
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- UPDATE: only owner can update
CREATE POLICY "Owner can update rooms"
ON public.chat_rooms
FOR UPDATE
USING (auth.uid() = owner_id);

-- DELETE: only owner can delete
CREATE POLICY "Owner can delete rooms"
ON public.chat_rooms
FOR DELETE
USING (auth.uid() = owner_id);