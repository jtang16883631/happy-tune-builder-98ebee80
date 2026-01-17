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

  // Import a template - uses column positions for Cost Data:
  // Column A (index 0) = NDC
  // Column B (index 1) = material_description (Med Desc)
  // Column C (index 2) = unit_price (Pack Cost)
  // Column D (index 3) = source (SOURCE)
  // Column E (index 4) = material (Item Number)
  const importTemplate = useCallback(
    async (
      templateName: string,
      costRows: any[],
      jobTicketRawData: any[][],
      costFileName: string,
      jobTicketFileName: string,
      skipRefetch: boolean = false
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

        // Get column keys from first row (headers) to map by position
        const columnKeys = costRows.length > 0 ? Object.keys(costRows[0]) : [];
        
        // Insert cost items in batches - using column position (not names)
        const costInserts = costRows
          .filter((row) => {
            // Column A (index 0) should have NDC
            const ndcValue = columnKeys[0] ? row[columnKeys[0]] : null;
            return ndcValue && String(ndcValue).trim().length > 0;
          })
          .map((row) => {
            // Map by column position:
            // Column A (0) = NDC
            // Column B (1) = material_description
            // Column C (2) = unit_price (Pack Cost)
            // Column D (3) = source (SOURCE)
            // Column E (4) = material (Item Number)
            const colA = columnKeys[0] ? row[columnKeys[0]] : null; // NDC
            const colB = columnKeys[1] ? row[columnKeys[1]] : null; // material_description
            const colC = columnKeys[2] ? row[columnKeys[2]] : null; // unit_price
            const colD = columnKeys[3] ? row[columnKeys[3]] : null; // source
            const colE = columnKeys[4] ? row[columnKeys[4]] : null; // material (Item Number)
            
            return {
              template_id: templateId,
              ndc: String(colA || '').trim(),
              material_description: colB ? String(colB).trim() : null,
              unit_price: colC ? parseFloat(String(colC)) : null,
              source: colD ? String(colD).trim() : null,
              material: colE ? String(colE).trim() : null,
              billing_date: null,
              manufacturer: null,
              generic: null,
              strength: null,
              size: null,
              dose: null,
            };
          });

        // Insert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < costInserts.length; i += batchSize) {
          const batch = costInserts.slice(i, i + batchSize);
          const { error: costError } = await supabase.from('template_cost_items').insert(batch);
          if (costError) console.error('Error inserting cost items batch:', costError);
        }

        // Only refetch if not in bulk import mode
        if (!skipRefetch) {
          await fetchTemplates();
        }
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

  // Get cost item by NDC - returns first match by import order (VLOOKUP logic)
  const getCostItemByNDC = useCallback(
    async (templateId: string, ndc: string): Promise<CloudCostItem | null> => {
      const cleanNdc = ndc.replace(/\D/g, '');
      
      const { data, error } = await supabase
        .from('template_cost_items')
        .select('*')
        .eq('template_id', templateId)
        .or(`ndc.eq.${cleanNdc},ndc.eq.${ndc}`)
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

  return {
    templates,
    isLoading,
    error,
    isReady: !isLoading && !!user,
    importTemplate,
    deleteTemplate,
    getSections,
    getCostItemByNDC,
    refetch: fetchTemplates,
  };
}
