-- Allow users to update their own last_read_at timestamp
CREATE POLICY "Users can update their own last_read_at"
ON public.chat_room_members
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);