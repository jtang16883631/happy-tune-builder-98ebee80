-- Create table for scheduled meetings
CREATE TABLE public.chat_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.chat_meetings ENABLE ROW LEVEL SECURITY;

-- Policies: Only room members can view meetings
CREATE POLICY "Room members can view meetings"
ON public.chat_meetings
FOR SELECT
USING (public.is_room_member(auth.uid(), room_id));

-- Only room members can create meetings
CREATE POLICY "Room members can create meetings"
ON public.chat_meetings
FOR INSERT
WITH CHECK (public.is_room_member(auth.uid(), room_id) AND auth.uid() = created_by);

-- Meeting creator or room owner can update
CREATE POLICY "Meeting creator or room owner can update meetings"
ON public.chat_meetings
FOR UPDATE
USING (
  auth.uid() = created_by 
  OR EXISTS (SELECT 1 FROM public.chat_rooms WHERE id = room_id AND owner_id = auth.uid())
);

-- Meeting creator or room owner can delete
CREATE POLICY "Meeting creator or room owner can delete meetings"
ON public.chat_meetings
FOR DELETE
USING (
  auth.uid() = created_by 
  OR EXISTS (SELECT 1 FROM public.chat_rooms WHERE id = room_id AND owner_id = auth.uid())
);

-- Enable realtime for meetings
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_meetings;

-- Add trigger for updated_at
CREATE TRIGGER update_chat_meetings_updated_at
BEFORE UPDATE ON public.chat_meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();