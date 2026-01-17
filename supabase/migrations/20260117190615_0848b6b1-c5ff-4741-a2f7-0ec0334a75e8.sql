-- Create scan_records table to store all user scans
CREATE TABLE public.scan_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Scan data columns
  loc TEXT,
  device TEXT,
  rec TEXT,
  time TEXT,
  ndc TEXT,
  scanned_ndc TEXT,
  qty NUMERIC,
  mis_divisor NUMERIC,
  mis_count_method TEXT,
  item_number TEXT,
  med_desc TEXT,
  meridian_desc TEXT,
  trade TEXT,
  generic TEXT,
  strength TEXT,
  pack_sz TEXT,
  fda_size TEXT,
  size_txt TEXT,
  dose_form TEXT,
  manufacturer TEXT,
  generic_code TEXT,
  dea_class TEXT,
  ahfs TEXT,
  source TEXT,
  pack_cost NUMERIC,
  unit_cost NUMERIC,
  extended NUMERIC,
  blank TEXT,
  sheet_type TEXT,
  audit_criteria TEXT,
  original_qty NUMERIC,
  auditor_initials TEXT,
  results TEXT,
  additional_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scan_records ENABLE ROW LEVEL SECURITY;

-- Policies: All authenticated users can view all scan records (for merging)
CREATE POLICY "Authenticated users can view all scan records"
ON public.scan_records
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can insert their own scan records
CREATE POLICY "Users can insert their own scan records"
ON public.scan_records
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own scan records
CREATE POLICY "Users can update their own scan records"
ON public.scan_records
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own scan records
CREATE POLICY "Users can delete their own scan records"
ON public.scan_records
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_scan_records_template_section ON public.scan_records(template_id, section_id);
CREATE INDEX idx_scan_records_user ON public.scan_records(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_scan_records_updated_at
BEFORE UPDATE ON public.scan_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();