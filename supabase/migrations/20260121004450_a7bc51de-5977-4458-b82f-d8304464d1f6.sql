-- Add a reference column to link scheduled_jobs with live_tracker_jobs
ALTER TABLE public.scheduled_jobs 
ADD COLUMN IF NOT EXISTS tracker_job_id uuid REFERENCES public.live_tracker_jobs(id) ON DELETE SET NULL;

-- Add a reference column to link live_tracker_jobs back to scheduled_jobs
ALTER TABLE public.live_tracker_jobs 
ADD COLUMN IF NOT EXISTS schedule_job_id uuid REFERENCES public.scheduled_jobs(id) ON DELETE SET NULL;

-- Create a function to auto-create/update tracker job when schedule event has invoice number
CREATE OR REPLACE FUNCTION public.sync_schedule_to_tracker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tracker_id uuid;
BEGIN
  -- Only process if this is a work event with an invoice number
  IF NEW.event_type = 'work' AND NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    
    -- Check if tracker job already exists
    IF NEW.tracker_job_id IS NOT NULL THEN
      -- Update existing tracker job
      UPDATE public.live_tracker_jobs
      SET 
        job_name = COALESCE(NEW.client_name, 'Untitled Job'),
        promise_invoice_number = NEW.invoice_number,
        group_name = NEW.client_name,
        updated_at = now()
      WHERE id = NEW.tracker_job_id;
    ELSE
      -- Create new tracker job
      INSERT INTO public.live_tracker_jobs (
        job_name,
        promise_invoice_number,
        group_name,
        stage,
        schedule_job_id,
        created_by
      ) VALUES (
        COALESCE(NEW.client_name, 'Untitled Job'),
        NEW.invoice_number,
        NEW.client_name,
        'making_price_files',
        NEW.id,
        NEW.created_by
      )
      RETURNING id INTO tracker_id;
      
      -- Update the schedule job with the tracker reference
      NEW.tracker_job_id := tracker_id;
    END IF;
    
  ELSIF NEW.tracker_job_id IS NOT NULL AND (NEW.invoice_number IS NULL OR NEW.invoice_number = '') THEN
    -- If invoice number was removed, optionally unlink (but keep the tracker job)
    -- Just clear the link, don't delete the tracker job
    NULL; -- Keep the link for now
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT and UPDATE on scheduled_jobs
DROP TRIGGER IF EXISTS sync_schedule_to_tracker_trigger ON public.scheduled_jobs;
CREATE TRIGGER sync_schedule_to_tracker_trigger
BEFORE INSERT OR UPDATE ON public.scheduled_jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_schedule_to_tracker();

-- Create function to sync tracker updates back to schedule (for stage updates)
CREATE OR REPLACE FUNCTION public.sync_tracker_to_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If tracker job has a linked schedule job, update it when relevant fields change
  IF NEW.schedule_job_id IS NOT NULL THEN
    -- We could sync status back if needed
    -- For now, just ensure the link is maintained
    UPDATE public.scheduled_jobs
    SET tracker_job_id = NEW.id
    WHERE id = NEW.schedule_job_id AND (tracker_job_id IS NULL OR tracker_job_id != NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for tracker updates
DROP TRIGGER IF EXISTS sync_tracker_to_schedule_trigger ON public.live_tracker_jobs;
CREATE TRIGGER sync_tracker_to_schedule_trigger
AFTER INSERT OR UPDATE ON public.live_tracker_jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_tracker_to_schedule();