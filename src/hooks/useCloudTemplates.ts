import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ImportJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'merging' | 'complete' | 'failed';
  package_status: 'none' | 'building' | 'ready' | 'failed';
  package_path: string | null;
  package_error: string | null;
  total_rows: number;
  processed_rows: number;
  rows_per_sec: number;
  avg_batch_ms: number;
  error_message: string | null;
}

/**
 * Parse Excel client-side, create import job, send parsed rows in chunks
 * to the backend for bulk SQL insert, then call finalize for merge + package build.
 */
async function startCostImportJob(
  templateId: string,
  userId: string,
  costFile: File,
  costFileName: string,
  onChunkProgress?: (sent: number, total: number) => void
): Promise<{ jobId: string } | { error: string }> {
  const XLSX = await import('xlsx');
  const CHUNK_SIZE = 50000; // rows per request — larger = fewer HTTP round-trips
  const PARALLEL_CHUNKS = 8; // send up to 8 chunks simultaneously

  // 1. Parse Excel client-side
  console.log(`[CostImport] Parsing ${costFileName} client-side...`);
  const arrayBuffer = await costFile.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

  // Column order for compact array format (must match edge function)
  const COLUMNS = ['ndc','material_description','unit_price','source','material','billing_date','manufacturer','generic','strength','size','dose','sheet_name'];

  const allRows: any[][] = []; // compact: each row is a positional array
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length <= 1) continue;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[0] || String(row[0]).trim().length === 0) continue;

      let billingDate: string | null = null;
      if (row[5] != null && String(row[5]).trim()) {
        if (typeof row[5] === 'number') {
          const d = new Date((row[5] - 25569) * 86400 * 1000);
          billingDate = d.toISOString().split('T')[0];
        } else {
          const parsed = new Date(String(row[5]));
          billingDate = isNaN(parsed.getTime()) ? String(row[5]).substring(0, 50) : parsed.toISOString().split('T')[0];
        }
      }

      // Compact array: positional values matching COLUMNS order
      allRows.push([
        row[0] != null ? String(row[0]).trim().substring(0, 50) : null,
        row[1] != null ? String(row[1]).trim().substring(0, 255) : null,
        row[2] != null ? parseFloat(String(row[2])) : null,
        row[3] != null ? String(row[3]).trim().substring(0, 255) : null,
        row[4] != null ? String(row[4]).trim().substring(0, 50) : null,
        billingDate,
        row[6] != null ? String(row[6]).trim().substring(0, 255) : null,
        row[7] != null ? String(row[7]).trim().substring(0, 255) : null,
        row[8] != null ? String(row[8]).trim().substring(0, 100) : null,
        row[9] != null ? String(row[9]).trim().substring(0, 50) : null,
        row[10] != null ? String(row[10]).trim().substring(0, 100) : null,
        sheetName.substring(0, 50),
      ]);
    }
  }

  console.log(`[CostImport] Parsed ${allRows.length} rows from ${workbook.SheetNames.length} sheets`);

  if (allRows.length === 0) {
    return { error: 'No data rows found in the Excel file' };
  }

  // 2. Create import job record (no file upload needed)
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      template_id: templateId,
      user_id: userId,
      file_path: `client-parsed/${templateId}/${Date.now()}`,
      cost_file_name: costFileName,
      status: 'pending',
      total_rows: allRows.length,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return { error: `Job creation failed: ${jobErr?.message || 'Unknown'}` };
  }

  // 3. Send rows in chunks using compact array format
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'No active session' };
  }

  const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
  const baseUrl = `https://${projectId}.supabase.co/functions/v1/process-cost-import`;
  const headers = {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };

  // Send chunks in parallel batches
  for (let batchStart = 0; batchStart < totalChunks; batchStart += PARALLEL_CHUNKS) {
    const batchEnd = Math.min(batchStart + PARALLEL_CHUNKS, totalChunks);
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k);

    onChunkProgress?.(batchStart * CHUNK_SIZE, allRows.length);

    const results = await Promise.all(
      batchIndices.map(async (i) => {
        const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            job_id: job.id,
            action: 'append',
            columns: COLUMNS,
            rows: chunk,
            chunk_index: i,
            total_chunks: totalChunks,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text();
          return { error: `Chunk ${i + 1}/${totalChunks} failed: ${errBody}` };
        }
        return { ok: true };
      })
    );

    // Check if any chunk in this batch failed
    const failed = results.find(r => 'error' in r);
    if (failed && 'error' in failed) {
      console.error(`[CostImport] Parallel batch failed:`, failed.error);
      return { error: failed.error };
    }

    console.log(`[CostImport] Batch ${Math.floor(batchStart / PARALLEL_CHUNKS) + 1}/${Math.ceil(totalChunks / PARALLEL_CHUNKS)}: chunks ${batchStart + 1}-${batchEnd} done`);
  }

  onChunkProgress?.(allRows.length, allRows.length);
  console.log(`[CostImport] All ${totalChunks} chunks sent (${PARALLEL_CHUNKS} parallel), finalizing...`);

  // 4. Call finalize (merge + package build) — retry up to 3 times with backoff
  const finalizeBody = JSON.stringify({
    job_id: job.id,
    action: 'finalize',
    total_rows: allRows.length,
  });

  (async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Wait before retrying to let DB recover from chunk upload load
        if (attempt > 0) {
          const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s
          console.log(`[CostImport] Finalize retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
        const res = await fetch(baseUrl, { method: 'POST', headers, body: finalizeBody });
        if (res.ok || res.status === 202) {
          console.log(`[CostImport] Finalize request accepted (attempt ${attempt + 1})`);
          return;
        }
        console.warn(`[CostImport] Finalize attempt ${attempt + 1} failed: ${res.status}`);
      } catch (err: any) {
        console.warn(`[CostImport] Finalize attempt ${attempt + 1} error:`, err.message);
      }
    }
    console.error('[CostImport] Finalize failed after all retries. Data is in staging — can be re-triggered.');
  })();

  return { jobId: job.id };
}

/**
 * Poll import job status including package_status
 */
async function pollImportJob(jobId: string): Promise<ImportJobStatus | null> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id, status, total_rows, processed_rows, rows_per_sec, avg_batch_ms, error_message, package_status, package_path, package_error')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;
  return data as unknown as ImportJobStatus;
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
  sheet_name: string | null;
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

  // Parse job ticket to extract sections and metadata (client-side, lightweight)
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

    // Try to extract invoice number from filename first
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

  // Import a template - frontend only uploads file + creates job + triggers backend
  const importTemplate = useCallback(
    async (
      templateName: string,
      costFile: File | null,
      jobTicketRawData: any[][],
      costFileName: string,
      jobTicketFileName: string,
      skipRefetch: boolean = false,
      onProgress?: (p: { stage: 'template' | 'sections' | 'uploading' | 'server'; inserted: number; total: number; jobId?: string }) => void
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

        if (skipRefetch) {
          setTemplates((prev) => {
            if (prev.some((t) => t.id === templateId)) return prev;
            return [templateData as CloudTemplate, ...prev];
          });
        }

        // Insert sections
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

        // If we have a cost file, parse client-side and send chunks to backend
        if (costFile) {
          onProgress?.({ stage: 'uploading', inserted: 0, total: 1 });

          const result = await startCostImportJob(
            templateId,
            user.id,
            costFile,
            costFileName,
            (sent, total) => onProgress?.({ stage: 'uploading', inserted: sent, total })
          );

          if ('error' in result) {
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

  // Import ticket only (no cost data)
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

        if (skipRefetch) {
          setTemplates((prev) => {
            if (prev.some((t) => t.id === templateId)) return prev;
            return [templateData as CloudTemplate, ...prev];
          });
        }

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

  // Update cost data for a template - upload file, trigger backend
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

  // Delete a template via backend RPC directly from the client
  const deleteTemplate = useCallback(
    async (templateId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        console.log(`[deleteTemplate] Starting delete for template ${templateId}`);
        const chunkSize = 10000;

        // 1. Chunk-delete scan_records
        for (let i = 0; i < 200; i++) {
          const { data, error } = await supabase.rpc('delete_template_chunk', {
            _template_id: templateId,
            _table_name: 'scan_records',
            _chunk_size: chunkSize,
          });
          if (error) throw new Error(`scan_records error: ${error.message}`);
          if (!data || (data as number) < chunkSize) break;
        }

        // 2. Chunk-delete cost_items
        for (let i = 0; i < 200; i++) {
          const { data, error } = await supabase.rpc('delete_template_chunk', {
            _template_id: templateId,
            _table_name: 'template_cost_items',
            _chunk_size: chunkSize,
          });
          if (error) throw new Error(`template_cost_items error: ${error.message}`);
          if (!data || (data as number) < chunkSize) break;
        }

        // 3. Clean up import staging data before deleting template to avoid CASCADE timeout
        const { data: importJobs, error: jobsErr } = await supabase
          .from('import_jobs')
          .select('id')
          .eq('template_id', templateId);
        
        if (jobsErr) throw new Error(`import_jobs query error: ${jobsErr.message}`);

        if (importJobs && importJobs.length > 0) {
          for (const job of importJobs) {
            for (let i = 0; i < 200; i++) {
              const { count, error: stageErr } = await supabase
                .from('import_staging_cost_items')
                .delete({ count: 'exact' })
                .eq('job_id', job.id)
                .limit(chunkSize);
              if (stageErr) throw new Error(`staging delete error: ${stageErr.message}`);
              if (!count || count < chunkSize) break;
            }
          }
          const { error: delJobsErr } = await supabase
            .from('import_jobs')
            .delete()
            .eq('template_id', templateId);
          if (delJobsErr) throw new Error(`import_jobs delete error: ${delJobsErr.message}`);
        }

        // 4. Delete small tables
        await supabase.rpc('delete_template_chunk', {
          _template_id: templateId,
          _table_name: 'template_sections',
        });
        await supabase.rpc('delete_template_chunk', {
          _template_id: templateId,
          _table_name: 'template_issues',
        });

        // 5. Delete the template itself
        const { error: delTemplateErr } = await supabase.rpc('delete_template_chunk', {
          _template_id: templateId,
          _table_name: 'data_templates',
        });
        if (delTemplateErr) throw new Error(`data_templates error: ${delTemplateErr.message}`);

        console.log('[deleteTemplate] Finished successfully');
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

  // Get cost item by NDC
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
        .order('created_at', { ascending: true })
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

      setTemplates(prev => prev.map(t => 
        t.id === templateId ? { ...t, status } : t
      ));

      return { success: true };
    } catch (err: any) {
      console.error('Error updating template status:', err);
      return { success: false, error: err.message };
    }
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
    pollImportJob,
    refetch: fetchTemplates,
  };
}
