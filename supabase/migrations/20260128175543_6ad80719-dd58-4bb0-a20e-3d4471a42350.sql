-- Add last_read_at column to chat_room_members table to track when user last read messages
ALTER TABLE public.chat_room_members
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chat_room_members_last_read ON public.chat_room_members(user_id, room_id, last_read_at);