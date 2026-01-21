-- Drop existing trigger and function with CASCADE
DROP TRIGGER IF EXISTS sync_schedule_to_tracker_trigger ON public.scheduled_jobs;
DROP FUNCTION IF EXISTS public.sync_schedule_to_tracker() CASCADE;

-- Recreate function that works with AFTER trigger
CREATE OR REPLACE FUNCTION public.sync_schedule_to_tracker()
RETURNS TRIGGER AS $$
DECLARE
  new_tracker_id UUID;
BEGIN
  -- Only process work events with invoice numbers
  IF NEW.event_type = 'work' AND NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    -- Check if already linked
    IF NEW.tracker_job_id IS NULL THEN
      -- Create new tracker job
      INSERT INTO public.live_tracker_jobs (
        job_name,
        promise_invoice_number,
        group_name,
        stage,
        schedule_job_id,
        created_by
      ) VALUES (
        COALESCE(NEW.client_name, 'Unnamed Job'),
        NEW.invoice_number,
        COALESCE(NEW.client_name, 'Ungrouped'),
        'making_price_files',
        NEW.id,
        NEW.created_by
      )
      RETURNING id INTO new_tracker_id;
      
      -- Update the scheduled job with tracker reference
      UPDATE public.scheduled_jobs 
      SET tracker_job_id = new_tracker_id 
      WHERE id = NEW.id;
    ELSE
      -- Update existing tracker job
      UPDATE public.live_tracker_jobs
      SET 
        job_name = COALESCE(NEW.client_name, 'Unnamed Job'),
        promise_invoice_number = NEW.invoice_number,
        group_name = COALESCE(NEW.client_name, 'Ungrouped'),
        updated_at = now()
      WHERE id = NEW.tracker_job_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that runs AFTER insert/update
CREATE TRIGGER sync_schedule_to_tracker_trigger
  AFTER INSERT OR UPDATE ON public.scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_schedule_to_tracker();