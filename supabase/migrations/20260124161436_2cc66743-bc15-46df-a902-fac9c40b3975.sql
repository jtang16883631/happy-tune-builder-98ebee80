-- Ensure RLS policies exist for chat tables
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Users can view messages in rooms they are members of" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can send messages to rooms they are members of" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view rooms they are members of" ON public.chat_rooms;
DROP POLICY IF EXISTS "Users can create rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Users can view their room memberships" ON public.chat_room_members;
DROP POLICY IF EXISTS "Room admins can add members" ON public.chat_room_members;
DROP POLICY IF EXISTS "Users can join rooms" ON public.chat_room_members;

-- Chat Messages policies
CREATE POLICY "Users can view messages in rooms they are members of"
ON public.chat_messages FOR SELECT
USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Users can send messages to rooms they are members of"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_room_member(auth.uid(), room_id)
);

-- Chat Rooms policies
CREATE POLICY "Users can view rooms they are members of"
ON public.chat_rooms FOR SELECT
USING (public.is_room_member(auth.uid(), id));

CREATE POLICY "Users can create rooms"
ON public.chat_rooms FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Chat Room Members policies
CREATE POLICY "Users can view their room memberships"
ON public.chat_room_members FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_room_member(auth.uid(), room_id)
);

CREATE POLICY "Room admins can add members"
ON public.chat_room_members FOR INSERT
WITH CHECK (
  -- Either adding yourself as creator of a new room
  user_id = auth.uid()
  OR
  -- Or you are an admin of the room
  public.is_room_admin(auth.uid(), room_id)
);