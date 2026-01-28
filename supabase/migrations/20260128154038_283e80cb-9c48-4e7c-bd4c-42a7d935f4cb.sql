-- Create table for company-wide OneDrive credentials (shared by all users)
CREATE TABLE public.onedrive_company_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_by UUID REFERENCES auth.users(id),
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onedrive_company_tokens ENABLE ROW LEVEL SECURITY;

-- Everyone can read the company OneDrive connection (to use it)
CREATE POLICY "All authenticated users can view company OneDrive tokens"
ON public.onedrive_company_tokens
FOR SELECT
TO authenticated
USING (true);

-- Only privileged users (owner/developer) can manage the connection
CREATE POLICY "Privileged users can insert company OneDrive tokens"
ON public.onedrive_company_tokens
FOR INSERT
TO authenticated
WITH CHECK (public.is_privileged(auth.uid()));

CREATE POLICY "Privileged users can update company OneDrive tokens"
ON public.onedrive_company_tokens
FOR UPDATE
TO authenticated
USING (public.is_privileged(auth.uid()));

CREATE POLICY "Privileged users can delete company OneDrive tokens"
ON public.onedrive_company_tokens
FOR DELETE
TO authenticated
USING (public.is_privileged(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_onedrive_company_tokens_updated_at
BEFORE UPDATE ON public.onedrive_company_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();