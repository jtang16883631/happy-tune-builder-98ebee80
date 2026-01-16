import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CloudTemplate {
  id: string;
  user_id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  inv_number: string | null;
  cost_file_name: string | null;
  job_ticket_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudSection {
  id: string;
  template_id: string;
  sect: string;
  description: string | null;
  full_section: string | null;
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
  created_at: string;
}

export interface CloudScanRecord {
  id: string;
  template_id: string;
  ndc: string;
  description: string | null;
  price: number | null;
  source: string | null;
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
      const { data, error: fetchError } = await supabase
        .from('data_templates')
        .select('*')
        .order('inv_date', { ascending: false, nullsFirst: false });

      if (fetchError) throw fetchError;
      setTemplates(data || []);
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
  const parseJobTicket = (rawData: any[][]): {
    invDate: string | null;
    invNumber: string | null;
    facilityName: string | null;
    sections: { sect: string; description: string }[];
  } => {
    let invDate: string | null = null;
    let invNumber: string | null = null;
    let facilityName: string | null = null;
    const sections: { sect: string; description: string }[] = [];

    // Scan raw data for metadata
    for (let r = 0; r < rawData.length; r++) {
      for (let c = 0; c < rawData[r].length; c++) {
        const cellValue = String(rawData[r][c] || '').toLowerCase().trim();

        if (cellValue === 'facility name' || cellValue.includes('facility name')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            facilityName = String(rawData[r][c + 1]).trim();
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

      for (let r = sectionListRowIndex; r < Math.min(sectionListRowIndex + 30, rawData.length); r++) {
        const rowLower = rawData[r].map((c) => String(c || '').toLowerCase());
        const sectIdx = rowLower.findIndex((v) => v.includes('sect'));
        const descIdx = rowLower.findIndex((v) => v.includes('description'));

        if (sectIdx >= 0 && descIdx >= 0) {
          headerRowIndex = r;
          sectCol = sectIdx;
          descCol = descIdx;
          break;
        }
      }

      if (headerRowIndex === -1) {
        headerRowIndex = sectionListRowIndex + 1;
      }

      for (let r = headerRowIndex + 1; r < rawData.length; r++) {
        const sectRaw = String(rawData[r][sectCol] || '').trim();
        const descRaw = String(rawData[r][descCol] || '').trim();

        if (!sectRaw && !descRaw) {
          break;
        }

        const sectDigits = sectRaw.replace(/\D/g, '');
        const paddedSect = sectDigits ? sectDigits.padStart(4, '0') : '';

        sections.push({
          sect: paddedSect || sectRaw,
          description: descRaw,
        });
      }
    }

    if (sections.length === 0) {
      sections.push({ sect: '0000', description: 'Default' });
    }

    return { invDate, invNumber, facilityName, sections };
  };

  // Import a template
  const importTemplate = useCallback(
    async (
      templateName: string,
      costRows: any[],
      jobTicketRawData: any[][],
      costFileName: string,
      jobTicketFileName: string
    ): Promise<{ success: boolean; error?: string; templateId?: string }> => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        const { invDate, invNumber, facilityName, sections } = parseJobTicket(jobTicketRawData);

        // Insert template
        const { data: templateData, error: templateError } = await supabase
          .from('data_templates')
          .insert({
            user_id: user.id,
            name: templateName,
            inv_date: invDate,
            facility_name: facilityName,
            inv_number: invNumber,
            cost_file_name: costFileName,
            job_ticket_file_name: jobTicketFileName,
          })
          .select()
          .single();

        if (templateError) throw templateError;

        const templateId = templateData.id;

        // Insert sections
        if (sections.length > 0) {
          const sectionInserts = sections.map((s) => ({
            template_id: templateId,
            sect: s.sect,
            description: s.description,
            full_section: `${s.sect}-${s.description}`,
          }));

          const { error: sectionsError } = await supabase
            .from('template_sections')
            .insert(sectionInserts);

          if (sectionsError) console.error('Error inserting sections:', sectionsError);
        }

        // Insert cost items in batches
        const costInserts = costRows
          .filter((row) => row['NDC 11'] || row['NDC'] || row['ndc'])
          .map((row) => ({
            template_id: templateId,
            ndc: String(row['NDC 11'] || row['NDC'] || row['ndc'] || '').trim(),
            material_description: row['Material Description'] || row['material_description'] || null,
            unit_price: row['Unit Price'] ? parseFloat(row['Unit Price']) : null,
            source: row['Source'] || null,
            material: row['Material'] || null,
            billing_date: row['Billing Date'] || row['Billing Da'] || null,
            manufacturer: row['manu'] || row['Manufacturer'] || null,
            generic: row['generic'] || null,
            strength: row['strength'] || null,
            size: row['size'] || null,
            dose: row['dose'] || null,
          }));

        // Insert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < costInserts.length; i += batchSize) {
          const batch = costInserts.slice(i, i + batchSize);
          const { error: costError } = await supabase.from('template_cost_items').insert(batch);
          if (costError) console.error('Error inserting cost items batch:', costError);
        }

        await fetchTemplates();
        return { success: true, templateId };
      } catch (err: any) {
        console.error('Import template error:', err);
        return { success: false, error: err.message };
      }
    },
    [user, fetchTemplates]
  );

  // Delete a template
  const deleteTemplate = useCallback(
    async (templateId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const { error: deleteError } = await supabase
          .from('data_templates')
          .delete()
          .eq('id', templateId);

        if (deleteError) throw deleteError;

        await fetchTemplates();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
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
    async (templateId: string, ndc: string): Promise<CloudCostItem | null> => {
      const cleanNdc = ndc.replace(/\D/g, '');
      
      const { data, error } = await supabase
        .from('template_cost_items')
        .select('*')
        .eq('template_id', templateId)
        .or(`ndc.eq.${cleanNdc},ndc.eq.${ndc}`)
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

  // Save scan records
  const saveScanRecords = useCallback(
    async (
      templateId: string,
      records: { ndc: string; description: string; price: number | null; source: string }[]
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Delete existing records for this template
        await supabase.from('template_scan_records').delete().eq('template_id', templateId);

        if (records.length === 0) return { success: true };

        // Insert new records
        const inserts = records.map((r) => ({
          template_id: templateId,
          ndc: r.ndc,
          description: r.description,
          price: r.price,
          source: r.source,
        }));

        const { error } = await supabase.from('template_scan_records').insert(inserts);
        if (error) throw error;

        return { success: true };
      } catch (err: any) {
        console.error('Error saving scan records:', err);
        return { success: false, error: err.message };
      }
    },
    []
  );

  // Load scan records
  const loadScanRecords = useCallback(async (templateId: string): Promise<CloudScanRecord[]> => {
    const { data, error } = await supabase
      .from('template_scan_records')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at');

    if (error) {
      console.error('Error loading scan records:', error);
      return [];
    }
    return data || [];
  }, []);

  return {
    templates,
    isLoading,
    error,
    isReady: !isLoading && !!user,
    importTemplate,
    deleteTemplate,
    getSections,
    getCostItemByNDC,
    saveScanRecords,
    loadScanRecords,
    refetch: fetchTemplates,
  };
}
