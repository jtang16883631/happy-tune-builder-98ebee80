-- Clean up duplicate/conflicting policies on chat tables

-- Remove the old conflicting insert policy on chat_rooms
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.chat_rooms;

-- Remove old duplicate policies on chat_messages
DROP POLICY IF EXISTS "Members can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Members can view messages" ON public.chat_messages;

-- Remove old duplicate policies on chat_room_members  
DROP POLICY IF EXISTS "Room admins can add members" ON public.chat_room_members;
DROP POLICY IF EXISTS "Members can view room members" ON public.chat_room_members;