CREATE OR REPLACE FUNCTION public.delete_template_cascade(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scan_count integer;
  cost_count integer;
  section_count integer;
  issue_count integer;
BEGIN
  DELETE FROM public.scan_records WHERE template_id = _template_id;
  GET DIAGNOSTICS scan_count = ROW_COUNT;

  DELETE FROM public.template_cost_items WHERE template_id = _template_id;
  GET DIAGNOSTICS cost_count = ROW_COUNT;

  DELETE FROM public.template_sections WHERE template_id = _template_id;
  GET DIAGNOSTICS section_count = ROW_COUNT;

  DELETE FROM public.template_issues WHERE template_id = _template_id;
  GET DIAGNOSTICS issue_count = ROW_COUNT;

  DELETE FROM public.data_templates WHERE id = _template_id;

  RETURN jsonb_build_object(
    'scan_records', scan_count,
    'cost_items', cost_count,
    'sections', section_count,
    'issues', issue_count
  );
END;
$$;