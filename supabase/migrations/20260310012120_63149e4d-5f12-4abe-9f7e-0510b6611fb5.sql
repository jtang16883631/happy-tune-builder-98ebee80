CREATE OR REPLACE FUNCTION public.delete_template_cascade(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $$
DECLARE
  scan_count integer := 0;
  cost_count integer := 0;
  section_count integer := 0;
  issue_count integer := 0;
  batch_size integer := 5000;
  deleted integer;
BEGIN
  -- Delete scan_records in batches
  LOOP
    DELETE FROM public.scan_records
    WHERE id IN (
      SELECT id FROM public.scan_records WHERE template_id = _template_id LIMIT batch_size
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    scan_count := scan_count + deleted;
    EXIT WHEN deleted = 0;
  END LOOP;

  -- Delete cost_items in batches
  LOOP
    DELETE FROM public.template_cost_items
    WHERE id IN (
      SELECT id FROM public.template_cost_items WHERE template_id = _template_id LIMIT batch_size
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    cost_count := cost_count + deleted;
    EXIT WHEN deleted = 0;
  END LOOP;

  -- Sections and issues are small, delete directly
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