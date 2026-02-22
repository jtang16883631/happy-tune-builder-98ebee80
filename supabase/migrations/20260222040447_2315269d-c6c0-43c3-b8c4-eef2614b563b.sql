
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  device_type text NOT NULL DEFAULT 'Scanner',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available',
  checkout_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all devices" ON public.devices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Standard roles can insert devices" ON public.devices FOR INSERT WITH CHECK (is_privileged(auth.uid()));
CREATE POLICY "Standard roles can update devices" ON public.devices FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Privileged users can delete devices" ON public.devices FOR DELETE USING (is_privileged(auth.uid()));
