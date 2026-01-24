-- Allow anonymous users (auth.uid() NOT NULL but not a real account) to create rooms and messages
-- Update chat_rooms INSERT policy
DROP POLICY IF EXISTS "Users can create rooms" ON public.chat_rooms;
CREATE POLICY "Users can create rooms"
ON public.chat_rooms FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Update chat_room_members INSERT policy
DROP POLICY IF EXISTS "Room creators and admins can add members" ON public.chat_room_members;
CREATE POLICY "Room creators and admins can add members"
ON public.chat_room_members FOR INSERT
WITH CHECK (
  -- Allow room creator to add themselves as first member
  (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = room_id AND created_by = auth.uid()
    )
  )
  OR
  -- Or you are an admin of the room
  public.is_room_admin(auth.uid(), room_id)
);

-- Update chat_messages INSERT policy
DROP POLICY IF EXISTS "Users can send messages to rooms they are members of" ON public.chat_messages;
CREATE POLICY "Users can send messages to rooms they are members of"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND public.is_room_member(auth.uid(), room_id)
);