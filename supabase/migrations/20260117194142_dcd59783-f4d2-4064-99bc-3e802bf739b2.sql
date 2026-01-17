-- Drop existing restrictive policies on chat_rooms
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room admins can delete rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Users can view rooms they are members of" ON public.chat_rooms;

-- Create PERMISSIVE policies (default behavior)
CREATE POLICY "Authenticated users can create rooms"
ON public.chat_rooms
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view rooms they are members of"
ON public.chat_rooms
FOR SELECT
TO authenticated
USING (
  public.is_room_member(auth.uid(), id)
);

CREATE POLICY "Room admins can update rooms"
ON public.chat_rooms
FOR UPDATE
TO authenticated
USING (
  public.is_room_admin(auth.uid(), id)
);

CREATE POLICY "Room admins can delete rooms"
ON public.chat_rooms
FOR DELETE
TO authenticated
USING (
  public.is_room_admin(auth.uid(), id)
);