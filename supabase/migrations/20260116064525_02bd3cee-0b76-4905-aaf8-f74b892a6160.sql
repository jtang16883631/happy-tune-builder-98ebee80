-- Create data_templates table
CREATE TABLE public.data_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inv_date DATE,
  facility_name TEXT,
  inv_number TEXT,
  cost_file_name TEXT,
  job_ticket_file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create template_sections table
CREATE TABLE public.template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  sect TEXT NOT NULL,
  description TEXT,
  full_section TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create template_cost_items table
CREATE TABLE public.template_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  ndc TEXT,
  material_description TEXT,
  unit_price NUMERIC,
  source TEXT,
  material TEXT,
  billing_date TEXT,
  manufacturer TEXT,
  generic TEXT,
  strength TEXT,
  size TEXT,
  dose TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create template_scan_records table
CREATE TABLE public.template_scan_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  ndc TEXT NOT NULL,
  description TEXT,
  price NUMERIC,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_scan_records ENABLE ROW LEVEL SECURITY;

-- RLS for data_templates (users see their own templates)
CREATE POLICY "Users can view their own templates"
ON public.data_templates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates"
ON public.data_templates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.data_templates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.data_templates FOR DELETE
USING (auth.uid() = user_id);

-- RLS for template_sections (via template ownership)
CREATE POLICY "Users can view sections of their templates"
ON public.template_sections FOR SELECT
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert sections to their templates"
ON public.template_sections FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete sections from their templates"
ON public.template_sections FOR DELETE
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

-- RLS for template_cost_items (via template ownership)
CREATE POLICY "Users can view cost items of their templates"
ON public.template_cost_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert cost items to their templates"
ON public.template_cost_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete cost items from their templates"
ON public.template_cost_items FOR DELETE
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

-- RLS for template_scan_records (via template ownership)
CREATE POLICY "Users can view scan records of their templates"
ON public.template_scan_records FOR SELECT
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert scan records to their templates"
ON public.template_scan_records FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can update scan records of their templates"
ON public.template_scan_records FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete scan records from their templates"
ON public.template_scan_records FOR DELETE
USING (EXISTS (SELECT 1 FROM public.data_templates WHERE id = template_id AND user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_data_templates_user ON public.data_templates(user_id);
CREATE INDEX idx_data_templates_date ON public.data_templates(inv_date DESC);
CREATE INDEX idx_template_sections_template ON public.template_sections(template_id);
CREATE INDEX idx_template_cost_items_template ON public.template_cost_items(template_id);
CREATE INDEX idx_template_cost_items_ndc ON public.template_cost_items(ndc);
CREATE INDEX idx_template_scan_records_template ON public.template_scan_records(template_id);

-- Trigger for updated_at
CREATE TRIGGER update_data_templates_updated_at
BEFORE UPDATE ON public.data_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();