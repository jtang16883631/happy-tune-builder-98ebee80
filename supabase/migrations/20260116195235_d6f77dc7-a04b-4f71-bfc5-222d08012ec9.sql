-- Add UPDATE policy for template_sections so managers can rename sections
CREATE POLICY "Managers can update sections" 
ON public.template_sections 
FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role));