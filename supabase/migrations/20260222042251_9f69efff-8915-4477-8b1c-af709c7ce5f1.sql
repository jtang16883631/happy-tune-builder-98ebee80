
CREATE TABLE public.equipment_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'out_in_field',
  checkout_date date NOT NULL DEFAULT CURRENT_DATE,
  return_date date,
  laptop_id text,
  scanner_id text,
  checklist jsonb NOT NULL DEFAULT '{}',
  return_checklist jsonb,
  return_notes text,
  checked_out_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kits" ON public.equipment_kits FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Privileged users can insert kits" ON public.equipment_kits FOR INSERT WITH CHECK (is_privileged(auth.uid()));
CREATE POLICY "Privileged users can update kits" ON public.equipment_kits FOR UPDATE USING (is_privileged(auth.uid()));
CREATE POLICY "Privileged users can delete kits" ON public.equipment_kits FOR DELETE USING (is_privileged(auth.uid()));
