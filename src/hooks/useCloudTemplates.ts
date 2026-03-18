import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fire-and-forget: trigger the build-offline-package edge function
 * to pre-build a compressed cost items package in storage.
 */
async function triggerOfflinePackageBuild(templateId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/build-offline-package?template_id=${templateId}`;
    // Fire and forget — don't block the import
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }).then(r => {
      if (r.ok) console.log(`[OfflinePackage] Build triggered for ${templateId}`);
      else console.warn(`[OfflinePackage] Build failed for ${templateId}: ${r.status}`);
    }).catch(err => console.warn('[OfflinePackage] Build trigger error:', err));
  } catch { /* ignore */ }
}

export interface ImportJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'merging' | 'complete' | 'failed';
  total_rows: number;
  processed_rows: number;
  rows_per_sec: number;
  avg_batch_ms: number;
  error_message: string | null;
}

/**
 * Upload a cost Excel file to storage and kick off server-side import.
 * Returns the job_id for polling.
 */
async function startCostImportJob(
  templateId: string,
  userId: string,
  costFile: File,
  costFileName: string
): Promise<{ jobId: string } | { error: string }> {
  const filePath = `cost-imports/${templateId}/${Date.now()}-${costFileName}`;

  // 1. Upload file to storage
  const { error: uploadErr } = await supabase.storage
    .from('uploads')
    .upload(filePath, costFile, { upsert: true });

  if (uploadErr) {
    return { error: `Upload failed: ${uploadErr.message}` };
  }

  // 2. Create import job record
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      template_id: templateId,
      user_id: userId,
      file_path: filePath,
      cost_file_name: costFileName,
      status: 'pending',
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    // Cleanup uploaded file
    await supabase.storage.from('uploads').remove([filePath]);
    return { error: `Job creation failed: ${jobErr?.message || 'Unknown'}` };
  }

  // 3. Invoke edge function (fire-and-forget — we poll status)
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'No active session' };
  }

  fetch(`https://${projectId}.supabase.co/functions/v1/process-cost-import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job_id: job.id }),
  }).catch(err => console.warn('[CostImport] Edge function invoke error:', err));

  return { jobId: job.id };
}

/**
 * Poll import job status
 */
async function pollImportJob(jobId: string): Promise<ImportJobStatus | null> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id, status, total_rows, processed_rows, rows_per_sec, avg_batch_ms, error_message')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;
  return data as ImportJobStatus;
}

export type TemplateStatus = 'active' | 'working' | 'completed';

export interface CloudTemplate {
  id: string;
  user_id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  address: string | null;
  inv_number: string | null;
  cost_file_name: string | null;
  job_ticket_file_name: string | null;
  status: TemplateStatus | null;
  created_at: string;
  updated_at: string;
}

export interface CloudSection {
  id: string;
  template_id: string;
  sect: string;
  description: string | null;
  full_section: string | null;
  cost_sheet?: string | null;
  created_at: string;
}

export interface CloudCostItem {
  id: string;
  template_id: string;
  ndc: string | null;
  material_description: string | null;
  unit_price: number | null;
  source: string | null;
  material: string | null;
  billing_date: string | null;
  manufacturer: string | null;
  generic: string | null;
  strength: string | null;
  size: string | null;
  dose: string | null;
  sheet_name: string | null; // Which cost sheet tab this item came from
  created_at: string;
}

export function useCloudTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<CloudTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all templates for current user
  const fetchTemplates = useCallback(async () => {
    if (!user) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      // Fetch all templates (Supabase defaults to 1000 row limit)
      let allTemplates: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('data_templates')
          .select('*')
          .order('inv_date', { ascending: false, nullsFirst: false })
          .range(from, from + pageSize - 1);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allTemplates = allTemplates.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setTemplates(allTemplates as CloudTemplate[]);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Parse job ticket to extract sections and metadata
  const parseJobTicket = (rawData: any[][], fileName?: string): {
    invDate: string | null;
    invNumber: string | null;
    facilityName: string | null;
    address: string | null;
    sections: { sect: string; description: string; costSheet: string | null }[];
  } => {
    let invDate: string | null = null;
    let invNumber: string | null = null;
    let facilityName: string | null = null;
    let address: string | null = null;
    const sections: { sect: string; description: string; costSheet: string | null }[] = [];

    // Extract address from cell C5 (row index 4, col index 2)
    if (rawData.length > 4 && rawData[4] && rawData[4].length > 2 && rawData[4][2]) {
      address = String(rawData[4][2]).trim() || null;
    }

    // Try to extract invoice number from filename first (e.g., "25090182.xlsx" or "25090182 - Client Name.xlsx")
    if (fileName) {
      const fileNameWithoutExt = fileName.replace(/\.(xlsx?|xls)$/i, '');
      const invoiceMatch = fileNameWithoutExt.match(/^(\d{8})/);
      if (invoiceMatch) {
        invNumber = invoiceMatch[1];
      }
    }

    // Scan raw data for metadata
    for (let r = 0; r < rawData.length; r++) {
      for (let c = 0; c < rawData[r].length; c++) {
        const cellValue = String(rawData[r][c] || '').toLowerCase().trim();

        if (cellValue === 'facility name' || cellValue.includes('facility name')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            facilityName = String(rawData[r][c + 1]).trim();
          }
        }

        // Look for invoice number in the Excel data
        if (cellValue === 'inv. #' || cellValue === 'inv #' || cellValue === 'inv.#' || 
            cellValue === 'invoice #' || cellValue === 'invoice number' || 
            cellValue.includes('inv. #') || cellValue.includes('invoice #')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            const parsedInvNum = String(rawData[r][c + 1]).trim();
            if (parsedInvNum) {
              invNumber = parsedInvNum;
            }
          }
        }

        if (cellValue === 'inv. date' || cellValue === 'inv date' || cellValue.includes('inv. date')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            const rawDate = rawData[r][c + 1];
            if (rawDate) {
              try {
                if (typeof rawDate === 'number') {
                  const date = new Date((rawDate - 25569) * 86400 * 1000);
                  invDate = date.toISOString().split('T')[0];
                } else {
                  const parsed = new Date(rawDate);
                  if (!isNaN(parsed.getTime())) {
                    invDate = parsed.toISOString().split('T')[0];
                  } else {
                    invDate = String(rawDate);
                  }
                }
              } catch {
                invDate = String(rawDate);
              }
            }
          }
        }
      }
    }

    // Find Section List header and parse sections
    let sectionListRowIndex = -1;
    for (let r = 0; r < rawData.length; r++) {
      const rowText = rawData[r].map((c) => String(c || '').toLowerCase()).join(' ');
      if (rowText.includes('section list')) {
        sectionListRowIndex = r;
        break;
      }
    }

    if (sectionListRowIndex >= 0) {
      let headerRowIndex = -1;
      let sectCol = 0;
      let descCol = 1;
      let costSheetCol = -1;

      for (let r = sectionListRowIndex; r < Math.min(sectionListRowIndex + 30, rawData.length); r++) {
        const rowLower = rawData[r].map((c) => String(c || '').toLowerCase());
        const sectIdx = rowLower.findIndex((v) => v.includes('sect'));
        const descIdx = rowLower.findIndex((v) => v.includes('description'));
        const costSheetIdx = rowLower.findIndex((v) => v.includes('cost') && v.includes('sheet'));

        if (sectIdx >= 0 && descIdx >= 0) {
          headerRowIndex = r;
          sectCol = sectIdx;
          descCol = descIdx;
          costSheetCol = costSheetIdx;
          break;
        }
      }

      if (headerRowIndex === -1) {
        headerRowIndex = sectionListRowIndex + 1;
      }

      for (let r = headerRowIndex + 1; r < rawData.length; r++) {
        const sectRaw = String(rawData[r][sectCol] || '').trim();
        const descRaw = String(rawData[r][descCol] || '').trim();
        const costSheetRaw = costSheetCol >= 0 ? String(rawData[r][costSheetCol] || '').trim() : null;

        if (!sectRaw && !descRaw) {
          break;
        }

        const sectDigits = sectRaw.replace(/\D/g, '');
        const paddedSect = sectDigits ? sectDigits.padStart(4, '0') : '';

        sections.push({
          sect: paddedSect || sectRaw,
          description: descRaw,
          costSheet: costSheetRaw || null,
        });
      }
    }

    if (sections.length === 0) {
      sections.push({ sect: '0000', description: 'Default', costSheet: null });
    }

    return { invDate, invNumber, facilityName, address, sections };
  };

  // Import a template - uploads cost file to storage for server-side processing
  // costFile is the raw Excel File object; jobTicketRawData is still parsed client-side for metadata
  const importTemplate = useCallback(
    async (
      templateName: string,
      costFile: File | null,
      costSheets: { rows: any[]; sheetName: string }[],
      jobTicketRawData: any[][],
      costFileName: string,
      jobTicketFileName: string,
      skipRefetch: boolean = false,
      onProgress?: (p: { stage: 'template' | 'sections' | 'cost' | 'uploading' | 'server'; inserted: number; total: number; jobId?: string }) => void
    ): Promise<{ success: boolean; error?: string; templateId?: string; jobId?: string }> => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        const { invDate, invNumber, facilityName, address, sections } = parseJobTicket(jobTicketRawData, jobTicketFileName);

        // Insert template
        const { data: templateData, error: templateError } = await supabase
          .from('data_templates')
          .insert({
            user_id: user.id,
            name: templateName,
            inv_date: invDate,
            facility_name: facilityName,
            address,
            inv_number: invNumber,
            cost_file_name: costFileName,
            job_ticket_file_name: jobTicketFileName,
          })
          .select()
          .single();

        if (templateError) {
          if (templateError.code === '23505' || templateError.message?.includes('unique')) {
            return { success: false, error: `A template named "${templateName}" already exists. Please use a different name.` };
          }
          throw templateError;
        }

        const templateId = templateData.id;

        // In bulk mode we optimistically add the template so UI shows all created items
        if (skipRefetch) {
          setTemplates((prev) => {
            if (prev.some((t) => t.id === templateId)) return prev;
            return [templateData as CloudTemplate, ...prev];
          });
        }

        // Insert sections with cost_sheet mapping
        if (sections.length > 0) {
          const sectionInserts = sections.map((s) => ({
            template_id: templateId,
            sect: s.sect,
            description: s.description,
            full_section: `${s.sect}-${s.description}`,
            cost_sheet: s.costSheet,
          }));

          const { error: sectionsError } = await supabase
            .from('template_sections')
            .insert(sectionInserts);

          if (sectionsError) console.error('Error inserting sections:', sectionsError);
        }

        // If we have a cost file, upload it and start server-side import
        if (costFile) {
          onProgress?.({ stage: 'uploading', inserted: 0, total: 1 });

          const result = await startCostImportJob(templateId, user.id, costFile, costFileName);

          if ('error' in result) {
            // Fallback: cost upload failed but template+sections are created
            console.error('Cost import job failed to start:', result.error);
            if (!skipRefetch) await fetchTemplates();
            return { success: true, templateId, error: `Template created but cost import failed: ${result.error}` };
          }

          onProgress?.({ stage: 'server', inserted: 0, total: 0, jobId: result.jobId });

          if (!skipRefetch) await fetchTemplates();
          return { success: true, templateId, jobId: result.jobId };
        }

        // No cost file — just template + sections
        if (!skipRefetch) await fetchTemplates();
        return { success: true, templateId };
      } catch (err: any) {
        console.error('Import template error:', err);
        return { success: false, error: err.message };
      }
    },
    [user, fetchTemplates]
  );
  // Import ticket only (no cost data) - creates template + sections from job ticket
  const importTicketOnly = useCallback(
    async (
      templateName: string,
      jobTicketRawData: any[][],
      jobTicketFileName: string,
      skipRefetch: boolean = false
    ): Promise<{ success: boolean; error?: string; templateId?: string }> => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        const { invDate, invNumber, facilityName, address, sections } = parseJobTicket(jobTicketRawData, jobTicketFileName);

        // Insert template
        const { data: templateData, error: templateError } = await supabase
          .from('data_templates')
          .insert({
            user_id: user.id,
            name: templateName,
            inv_date: invDate,
            facility_name: facilityName,
            address,
            inv_number: invNumber,
            cost_file_name: null,
            job_ticket_file_name: jobTicketFileName,
          })
          .select()
          .single();

        if (templateError) {
          if (templateError.code === '23505' || templateError.message?.includes('unique')) {
            return { success: false, error: `A template named "${templateName}" already exists. Please use a different name.` };
          }
          throw templateError;
        }

        const templateId = templateData.id;

        // In bulk mode we optimistically add the template so UI shows all created items
        if (skipRefetch) {
          setTemplates((prev) => {
            if (prev.some((t) => t.id === templateId)) return prev;
            return [templateData as CloudTemplate, ...prev];
          });
        }

        // Insert sections with cost_sheet mapping
        if (sections.length > 0) {
          const sectionInserts = sections.map((s) => ({
            template_id: templateId,
            sect: s.sect,
            description: s.description,
            full_section: `${s.sect}-${s.description}`,
            cost_sheet: s.costSheet,
          }));

          const { error: sectionsError } = await supabase
            .from('template_sections')
            .insert(sectionInserts);

          if (sectionsError) console.error('Error inserting sections:', sectionsError);
        }

        // Only refetch if not in bulk import mode
        if (!skipRefetch) {
          await fetchTemplates();
        }
        return { success: true, templateId };
      } catch (err: any) {
        console.error('Import ticket only error:', err);
        return { success: false, error: err.message };
      }
    },
    [user, fetchTemplates]
  );

  // Update cost data for a template - uploads file for server-side processing
  const updateCostData = useCallback(
    async (
      templateId: string,
      costFile: File,
      costFileName: string
    ): Promise<{ success: boolean; error?: string; jobId?: string }> => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        const result = await startCostImportJob(templateId, user.id, costFile, costFileName);

        if ('error' in result) {
          return { success: false, error: result.error };
        }

        return { success: true, jobId: result.jobId };
      } catch (err: any) {
        console.error('Update cost data error:', err);
        return { success: false, error: err.message };
      }
    },
    [user]
  );

  // Delete related rows in batches to avoid statement timeout
  // Delete related rows in batches to avoid statement timeout
  // Uses direct filter-based delete instead of fetching IDs first for speed
  const deleteBatched = useCallback(
    async (table: 'scan_records' | 'template_cost_items' | 'template_sections', templateId: string) => {
      // First, get total count to know if we need batching
      const { count, error: countErr } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('template_id', templateId);

      if (countErr) throw countErr;
      if (!count || count === 0) return;

      // For small datasets, delete directly
      if (count <= 1000) {
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq('template_id', templateId);
        if (delErr) throw delErr;
        return;
      }

      // For large datasets, delete in ID-range batches
      let lastId = '00000000-0000-0000-0000-000000000000';
      const maxIterations = Math.ceil(count / 500) + 10;
      for (let i = 0; i < maxIterations; i++) {
        // Fetch a batch of IDs
        const { data: rows, error: fetchErr } = await supabase
          .from(table)
          .select('id')
          .eq('template_id', templateId)
          .gt('id', lastId)
          .order('id', { ascending: true })
          .limit(500);

        if (fetchErr) throw fetchErr;
        if (!rows || rows.length === 0) break;

        const ids = rows.map((r) => r.id);
        lastId = ids[ids.length - 1];

        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .in('id', ids);

        if (delErr) throw delErr;

        // Safety: verify rows were actually deleted (RLS might silently block)
        const { count: remaining } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in('id', ids);

        if (remaining && remaining === ids.length) {
          // Nothing was deleted — RLS is blocking, bail out
          console.warn(`[deleteBatched] RLS blocking deletes on ${table}, aborting`);
          throw new Error(`Permission denied: cannot delete from ${table}`);
        }

        if (rows.length < 500) break;
      }
    },
    []
  );

  // Delete a template via backend function (service role bypasses RLS)
  const deleteTemplate = useCallback(
    async (templateId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data, error } = await supabase.functions.invoke('delete-template', {
          body: { templateId },
        });

        if (error) {
          console.error('[deleteTemplate] Edge function error:', error);
          return { success: false, error: error.message || 'Delete failed' };
        }

        if (data?.error) {
          return { success: false, error: data.error };
        }

        console.log('[deleteTemplate] Deleted:', data?.deleted);
        await fetchTemplates();
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || err?.details || String(err) || 'Unknown error';
        console.error('[deleteTemplate] Error:', msg);
        return { success: false, error: msg };
      }
    },
    [fetchTemplates]
  );

  // Get sections for a template
  const getSections = useCallback(async (templateId: string): Promise<CloudSection[]> => {
    const { data, error } = await supabase
      .from('template_sections')
      .select('*')
      .eq('template_id', templateId)
      .order('sect');

    if (error) {
      console.error('Error fetching sections:', error);
      return [];
    }
    return data || [];
  }, []);

  // Get cost item by NDC - returns first match by import order (VLOOKUP logic)
  // If sheetName is provided, we ONLY search within that cost tab.
  const getCostItemByNDC = useCallback(
    async (templateId: string, ndc: string, sheetName?: string | null): Promise<CloudCostItem | null> => {
      const cleanNdc = ndc.replace(/\D/g, '');

      let query = supabase
        .from('template_cost_items')
        .select('*')
        .eq('template_id', templateId)
        .or(`ndc.eq.${cleanNdc},ndc.eq.${ndc}`);

      if (sheetName) {
        query = query.eq('sheet_name', sheetName);
      }

      const { data, error } = await query
        .order('created_at', { ascending: true }) // First imported = first match (VLOOKUP logic)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cost item:', error);
        return null;
      }
      return data;
    },
    []
  );

  // Update template status
  const updateTemplateStatus = useCallback(async (templateId: string, status: TemplateStatus) => {
    try {
      const { error: updateError } = await supabase
        .from('data_templates')
        .update({ status })
        .eq('id', templateId);

      if (updateError) throw updateError;

      // Update local state
      setTemplates(prev => prev.map(t => 
        t.id === templateId ? { ...t, status } : t
      ));

      return { success: true };
    } catch (err: any) {
      console.error('Error updating template status:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const buildOfflinePackage = useCallback(async (templateId: string) => {
    triggerOfflinePackageBuild(templateId);
  }, []);

  return {
    templates,
    isLoading,
    error,
    isReady: !isLoading && !!user,
    importTemplate,
    importTicketOnly,
    updateCostData,
    deleteTemplate,
    getSections,
    getCostItemByNDC,
    updateTemplateStatus,
    buildOfflinePackage,
    pollImportJob,
    refetch: fetchTemplates,
  };
}
