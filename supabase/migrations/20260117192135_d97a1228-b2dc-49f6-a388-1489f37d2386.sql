-- Create chat_rooms table
CREATE TABLE public.chat_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_room_members table
CREATE TABLE public.chat_room_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_admin BOOLEAN DEFAULT false,
  UNIQUE(room_id, user_id)
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_rooms
CREATE POLICY "Users can view rooms they are members of"
ON public.chat_rooms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_rooms.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create rooms"
ON public.chat_rooms FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Room admins can update rooms"
ON public.chat_rooms FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_rooms.id AND user_id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Room admins can delete rooms"
ON public.chat_rooms FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_rooms.id AND user_id = auth.uid() AND is_admin = true
  )
);

-- RLS policies for chat_room_members
CREATE POLICY "Members can view room members"
ON public.chat_room_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members m2 
    WHERE m2.room_id = chat_room_members.room_id AND m2.user_id = auth.uid()
  )
);

CREATE POLICY "Room admins can add members"
ON public.chat_room_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_room_members.room_id AND user_id = auth.uid() AND is_admin = true
  ) OR 
  -- Allow first member (creator) to add themselves
  NOT EXISTS (
    SELECT 1 FROM public.chat_room_members WHERE room_id = chat_room_members.room_id
  )
);

CREATE POLICY "Room admins can remove members"
ON public.chat_room_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_room_members.room_id AND user_id = auth.uid() AND is_admin = true
  ) OR user_id = auth.uid()
);

-- RLS policies for chat_messages
CREATE POLICY "Members can view messages"
ON public.chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Members can send messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own messages"
ON public.chat_messages FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
ON public.chat_messages FOR DELETE
USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_chat_room_members_room_id ON public.chat_room_members(room_id);
CREATE INDEX idx_chat_room_members_user_id ON public.chat_room_members(user_id);
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Trigger to update updated_at
CREATE TRIGGER update_chat_rooms_updated_at
BEFORE UPDATE ON public.chat_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();