-- Add status column to data_templates
ALTER TABLE public.data_templates 
ADD COLUMN status text DEFAULT 'active';

-- Add comment for documentation
COMMENT ON COLUMN public.data_templates.status IS 'Template status: active, working, completed';