import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface PreviousJobData {
  client_name: string;
  client_id: string | null;
  address: string | null;
  phone: string | null;
  previous_inventory_value: string | null;
  onsite_contact: string | null;
  corporate_contact: string | null;
  email_data_to: string | null;
  final_invoice_to: string | null;
  notes: string | null;
  special_notes: string | null;
  exact_count_required: boolean | null;
  partial_inventory: boolean | null;
  client_onsite: boolean | null;
  hotel_info: string | null;
  // Source info
  source: 'scheduled_jobs' | 'data_templates';
  source_id: string;
  original_invoice: string;
}

export function usePreviousInvoiceLookup() {
  const [isSearching, setIsSearching] = useState(false);
  const [foundJob, setFoundJob] = useState<PreviousJobData | null>(null);

  const searchPreviousInvoice = async (invoiceNumber: string): Promise<PreviousJobData | null> => {
    if (!invoiceNumber || invoiceNumber.length < 3) {
      return null;
    }

    setIsSearching(true);
    try {
      // First, search in scheduled_jobs
      const { data: scheduledJobs, error: scheduledError } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .ilike('invoice_number', `%${invoiceNumber}%`)
        .order('job_date', { ascending: false })
        .limit(1);

      if (scheduledError) {
        console.error('Error searching scheduled_jobs:', scheduledError);
      }

      if (scheduledJobs && scheduledJobs.length > 0) {
        const job = scheduledJobs[0];
        const result: PreviousJobData = {
          client_name: job.client_name,
          client_id: job.client_id,
          address: job.address,
          phone: job.phone,
          previous_inventory_value: job.previous_inventory_value,
          onsite_contact: job.onsite_contact,
          corporate_contact: job.corporate_contact,
          email_data_to: job.email_data_to,
          final_invoice_to: job.final_invoice_to,
          notes: job.notes,
          special_notes: job.special_notes,
          exact_count_required: job.exact_count_required,
          partial_inventory: job.partial_inventory,
          client_onsite: job.client_onsite,
          hotel_info: job.hotel_info,
          source: 'scheduled_jobs',
          source_id: job.id,
          original_invoice: job.invoice_number || invoiceNumber,
        };
        setFoundJob(result);
        toast({
          title: 'Previous job found!',
          description: `Found: ${job.client_name} (${job.invoice_number})`,
        });
        return result;
      }

      // If not found in scheduled_jobs, search in data_templates
      // Search by inv_number OR by name (which often contains the invoice number)
      const { data: templates, error: templateError } = await supabase
        .from('data_templates')
        .select('*')
        .or(`inv_number.ilike.%${invoiceNumber}%,name.ilike.%${invoiceNumber}%`)
        .order('inv_date', { ascending: false })
        .limit(1);

      if (templateError) {
        console.error('Error searching data_templates:', templateError);
      }

      if (templates && templates.length > 0) {
        const template = templates[0];
        const result: PreviousJobData = {
          client_name: template.facility_name || template.name,
          client_id: null,
          address: null,
          phone: null,
          previous_inventory_value: null,
          onsite_contact: null,
          corporate_contact: null,
          email_data_to: null,
          final_invoice_to: null,
          notes: null,
          special_notes: null,
          exact_count_required: null,
          partial_inventory: null,
          client_onsite: null,
          hotel_info: null,
          source: 'data_templates',
          source_id: template.id,
          original_invoice: template.inv_number || invoiceNumber,
        };
        setFoundJob(result);
        toast({
          title: 'Previous template found!',
          description: `Found: ${template.facility_name || template.name} (${template.inv_number})`,
        });
        return result;
      }

      setFoundJob(null);
      toast({
        title: 'No previous job found',
        description: `No records match invoice "${invoiceNumber}"`,
        variant: 'destructive',
      });
      return null;
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search failed',
        description: 'An error occurred while searching',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  const clearFoundJob = useCallback(() => {
    setFoundJob(null);
  }, []);

  return {
    isSearching,
    foundJob,
    searchPreviousInvoice,
    clearFoundJob,
  };
}
