-- Create issues table for tracking office and field issues
CREATE TABLE public.template_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('office', 'field')),
  notes TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.template_issues ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all issues"
  ON public.template_issues FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create issues"
  ON public.template_issues FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update issues"
  ON public.template_issues FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Privileged users can delete issues"
  ON public.template_issues FOR DELETE
  USING (is_privileged(auth.uid()));

-- Create indexes
CREATE INDEX idx_template_issues_template ON public.template_issues(template_id);
CREATE INDEX idx_template_issues_type ON public.template_issues(issue_type);

-- Add trigger for updated_at
CREATE TRIGGER update_template_issues_updated_at
  BEFORE UPDATE ON public.template_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();