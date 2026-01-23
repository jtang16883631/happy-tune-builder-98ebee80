-- Add composite index to speed up cursor-based pagination on template_cost_items
CREATE INDEX IF NOT EXISTS idx_template_cost_items_template_id_id 
ON public.template_cost_items(template_id, id);

-- Also add index for template_sections if not exists
CREATE INDEX IF NOT EXISTS idx_template_sections_template_id 
ON public.template_sections(template_id);