-- Create changelog entries table
CREATE TABLE public.changelog_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  release_date DATE NOT NULL,
  changes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Anyone can view changelog" 
ON public.changelog_entries 
FOR SELECT 
USING (true);

-- Only privileged users can insert
CREATE POLICY "Privileged users can insert changelog" 
ON public.changelog_entries 
FOR INSERT 
WITH CHECK (public.is_privileged(auth.uid()));

-- Only privileged users can update
CREATE POLICY "Privileged users can update changelog" 
ON public.changelog_entries 
FOR UPDATE 
USING (public.is_privileged(auth.uid()));

-- Only privileged users can delete
CREATE POLICY "Privileged users can delete changelog" 
ON public.changelog_entries 
FOR DELETE 
USING (public.is_privileged(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_changelog_entries_updated_at
BEFORE UPDATE ON public.changelog_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial v1.0.0 entry
INSERT INTO public.changelog_entries (version, release_date, changes) VALUES (
  '1.0.0',
  '2026-01-25',
  ARRAY[
    'Initial release of Meridian Portal',
    'Added NDC scanning with IO-based outer pack detection',
    'Implemented Live Tracker workflow management',
    'Added Schedule Hub for job scheduling',
    'Team Chat with real-time messaging',
    'Timesheet tracking functionality',
    'Master Data (FDA) database management',
    'Compile tool for Excel aggregation'
  ]
);