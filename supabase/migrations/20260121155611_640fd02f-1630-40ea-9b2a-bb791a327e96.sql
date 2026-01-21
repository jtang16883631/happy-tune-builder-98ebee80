-- Store section lists on each scheduled job so new tickets can inherit prior sections
CREATE TABLE IF NOT EXISTS public.scheduled_job_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_job_id uuid NOT NULL REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  sect text NOT NULL,
  description text NULL,
  full_section text NULL,
  cost_sheet text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_sections_job_id
  ON public.scheduled_job_sections(schedule_job_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_sections_job_id_sect
  ON public.scheduled_job_sections(schedule_job_id, sect);

ALTER TABLE public.scheduled_job_sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_job_sections'
      AND policyname = 'Authenticated users can view scheduled job sections'
  ) THEN
    CREATE POLICY "Authenticated users can view scheduled job sections"
    ON public.scheduled_job_sections
    FOR SELECT
    USING (auth.uid() IS NOT NULL);
  END IF;

  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_job_sections'
      AND policyname = 'Authenticated users can create scheduled job sections'
  ) THEN
    CREATE POLICY "Authenticated users can create scheduled job sections"
    ON public.scheduled_job_sections
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_job_sections'
      AND policyname = 'Authenticated users can update scheduled job sections'
  ) THEN
    CREATE POLICY "Authenticated users can update scheduled job sections"
    ON public.scheduled_job_sections
    FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_job_sections'
      AND policyname = 'Authenticated users can delete scheduled job sections'
  ) THEN
    CREATE POLICY "Authenticated users can delete scheduled job sections"
    ON public.scheduled_job_sections
    FOR DELETE
    USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_scheduled_job_sections_updated_at'
  ) THEN
    CREATE TRIGGER update_scheduled_job_sections_updated_at
    BEFORE UPDATE ON public.scheduled_job_sections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
