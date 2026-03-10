-- Create a chunked delete function that deletes a limited number of rows and returns how many remain
CREATE OR REPLACE FUNCTION public.delete_template_chunk(
  _template_id uuid,
  _table_name text,
  _chunk_size integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF _table_name = 'scan_records' THEN
    DELETE FROM public.scan_records WHERE ctid IN (
      SELECT ctid FROM public.scan_records WHERE template_id = _template_id LIMIT _chunk_size
    );
  ELSIF _table_name = 'template_cost_items' THEN
    DELETE FROM public.template_cost_items WHERE ctid IN (
      SELECT ctid FROM public.template_cost_items WHERE template_id = _template_id LIMIT _chunk_size
    );
  ELSIF _table_name = 'template_sections' THEN
    DELETE FROM public.template_sections WHERE template_id = _template_id;
  ELSIF _table_name = 'template_issues' THEN
    DELETE FROM public.template_issues WHERE template_id = _template_id;
  ELSIF _table_name = 'data_templates' THEN
    DELETE FROM public.data_templates WHERE id = _template_id;
  END IF;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;