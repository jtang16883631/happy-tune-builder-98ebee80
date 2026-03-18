
-- Import jobs table for tracking async import status
CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.data_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  file_path text NOT NULL,
  cost_file_name text,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  rows_per_sec numeric DEFAULT 0,
  avg_batch_ms numeric DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Staging table mirrors template_cost_items + job_id
CREATE TABLE public.import_staging_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  ndc text,
  material_description text,
  unit_price numeric,
  source text,
  material text,
  billing_date text,
  manufacturer text,
  generic text,
  strength text,
  size text,
  dose text,
  sheet_name text
);

-- Indexes
CREATE INDEX idx_import_jobs_template_id ON public.import_jobs(template_id);
CREATE INDEX idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX idx_import_staging_job_id ON public.import_staging_cost_items(job_id);
CREATE INDEX idx_import_staging_template_id ON public.import_staging_cost_items(template_id);

-- RLS
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_staging_cost_items ENABLE ROW LEVEL SECURITY;

-- import_jobs: users can view/create their own jobs
CREATE POLICY "Users can view their own import jobs"
  ON public.import_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own import jobs"
  ON public.import_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staging: no direct client access needed (edge function uses service role)
-- But allow SELECT for debugging
CREATE POLICY "Users can view their own staging items"
  ON public.import_staging_cost_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.import_jobs
    WHERE import_jobs.id = import_staging_cost_items.job_id
    AND import_jobs.user_id = auth.uid()
  ));
