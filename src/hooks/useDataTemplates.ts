import { useState, useEffect, useCallback, useRef } from 'react';
import initSqlJs, { Database } from 'sql.js';

const DB_NAME = 'data_template_database';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'template_db';
const META_KEY = 'template_meta';

interface TemplateMeta {
  lastUpdated: string;
  templateCount: number;
}

export interface DataTemplate {
  id: number;
  name: string;
  inv_date: string;
  facility_name: string;
  inv_number: string;
  created_at: string;
  cost_file_name: string;
  job_ticket_file_name: string;
}

export interface TemplateSection {
  id: number;
  template_id: number;
  sect: string;
  description: string;
  full_section: string; // e.g., "0001-Topicals-EENT"
}

export interface TemplateCostItem {
  id: number;
  template_id: number;
  ndc: string;
  material_description: string;
  unit_price: number | null;
  source: string | null;
  material: string | null;
  billing_date: string | null;
  manufacturer: string | null;
  generic: string | null;
  strength: string | null;
  size: string | null;
  dose: string | null;
}

// IndexedDB helpers
const openIndexedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
  });
};

const saveToIndexedDB = async (key: string, data: any): Promise<void> => {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readwrite');
    const store = transaction.objectStore(DB_STORE);
    const request = store.put(data, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    transaction.oncomplete = () => db.close();
  });
};

const loadFromIndexedDB = async <T>(key: string): Promise<T | null> => {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readonly');
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
    transaction.oncomplete = () => db.close();
  });
};

export function useDataTemplates() {
  const [db, setDb] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sqlRef = useRef<any>(null);

  // Initialize sql.js and load existing database
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        
        const SQL = await initSqlJs({
          locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
        });
        sqlRef.current = SQL;

        const savedDb = await loadFromIndexedDB<Uint8Array>(DB_KEY);
        const savedMeta = await loadFromIndexedDB<TemplateMeta>(META_KEY);

        if (savedDb && savedMeta) {
          const database = new SQL.Database(savedDb);
          setDb(database);
          setMeta(savedMeta);
        } else {
          // Create new database with schema
          const database = new SQL.Database();
          database.run(`
            CREATE TABLE IF NOT EXISTS templates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT UNIQUE NOT NULL,
              inv_date TEXT,
              facility_name TEXT,
              inv_number TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              cost_file_name TEXT,
              job_ticket_file_name TEXT
            );
            
            CREATE TABLE IF NOT EXISTS sections (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              sect TEXT NOT NULL,
              description TEXT,
              full_section TEXT,
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS cost_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              ndc TEXT,
              material_description TEXT,
              unit_price REAL,
              source TEXT,
              material TEXT,
              billing_date TEXT,
              manufacturer TEXT,
              generic TEXT,
              strength TEXT,
              size TEXT,
              dose TEXT,
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
            );
            
            CREATE INDEX idx_templates_date ON templates(inv_date DESC);
            CREATE INDEX idx_sections_template ON sections(template_id);
            CREATE INDEX idx_cost_template ON cost_items(template_id);
            CREATE INDEX idx_cost_ndc ON cost_items(ndc);
          `);
          
          setDb(database);
          
          // Save empty database
          const dbData = database.export();
          await saveToIndexedDB(DB_KEY, new Uint8Array(dbData));
          await saveToIndexedDB(META_KEY, { lastUpdated: new Date().toISOString(), templateCount: 0 });
        }
      } catch (err: any) {
        console.error('Failed to initialize SQL.js:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      db?.close();
    };
  }, []);

  const saveDatabase = useCallback(async () => {
    if (!db) return;
    
    const dbData = db.export();
    const count = getTemplateCount();
    const newMeta = { lastUpdated: new Date().toISOString(), templateCount: count };
    
    await saveToIndexedDB(DB_KEY, new Uint8Array(dbData));
    await saveToIndexedDB(META_KEY, newMeta);
    setMeta(newMeta);
  }, [db]);

  // Extract template name from filename
  const extractTemplateName = (fileName: string): string => {
    // Remove file extension
    let name = fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, '');
    // Remove common prefixes
    name = name.replace(/^(ALL COST DATA|BLJC|JobTicketTemplate)\s*/i, '');
    // Remove date patterns at the end (MM.DD.YY or similar)
    name = name.replace(/\s+\d{2}\.\d{2}\.\d{2}\s*$/i, '');
    // Clean up extra spaces
    name = name.replace(/\s+/g, ' ').trim();
    return name;
  };

  // Parse job ticket to extract sections and inv date (matching Python logic exactly)
  const parseJobTicket = (rows: any[], rawData: any[][]): { 
    invDate: string | null; 
    invNumber: string | null; 
    facilityName: string | null; 
    sections: { sect: string; description: string }[] 
  } => {
    let invDate: string | null = null;
    let invNumber: string | null = null;
    let facilityName: string | null = null;
    const sections: { sect: string; description: string }[] = [];

    // Scan raw data for metadata (like Python's applymap approach)
    for (let r = 0; r < rawData.length; r++) {
      for (let c = 0; c < rawData[r].length; c++) {
        const cellValue = String(rawData[r][c] || '').toLowerCase().trim();
        
        // Look for Facility Name
        if (cellValue === 'facility name' || cellValue.includes('facility name')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            facilityName = String(rawData[r][c + 1]).trim();
          }
        }
        
        // Look for Inv. Date or Inv Date
        if (cellValue === 'inv. date' || cellValue === 'inv date' || cellValue.includes('inv. date')) {
          if (c + 1 < rawData[r].length && rawData[r][c + 1]) {
            const rawDate = rawData[r][c + 1];
            if (rawDate) {
              // Try to parse the date
              try {
                if (typeof rawDate === 'number') {
                  // Excel date serial number
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
      const rowText = rawData[r].map(c => String(c || '').toLowerCase()).join(' ');
      if (rowText.includes('section list')) {
        sectionListRowIndex = r;
        break;
      }
    }

    if (sectionListRowIndex >= 0) {
      // Find header row with "sect" and "description" (within 30 rows)
      let headerRowIndex = -1;
      let sectCol = 0;
      let descCol = 1;

      for (let r = sectionListRowIndex; r < Math.min(sectionListRowIndex + 30, rawData.length); r++) {
        const rowLower = rawData[r].map(c => String(c || '').toLowerCase());
        const sectIdx = rowLower.findIndex(v => v.includes('sect'));
        const descIdx = rowLower.findIndex(v => v.includes('description'));
        
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

      // Read rows EXACTLY as-is (keep order, keep duplicates)
      for (let r = headerRowIndex + 1; r < rawData.length; r++) {
        const sectRaw = String(rawData[r][sectCol] || '').trim();
        const descRaw = String(rawData[r][descCol] || '').trim();

        // Stop only when BOTH are blank
        if (!sectRaw && !descRaw) {
          break;
        }

        // Extract digits and pad to 4 digits
        const sectDigits = sectRaw.replace(/\D/g, '');
        const paddedSect = sectDigits ? sectDigits.padStart(4, '0') : '';
        
        // Format: "0008 - Narcotics"
        const fullSection = paddedSect ? `${paddedSect} - ${descRaw}` : descRaw;
        
        sections.push({
          sect: paddedSect || sectRaw,
          description: descRaw,
        });
      }
    }

    // Fallback: if no sections found, add a default
    if (sections.length === 0) {
      sections.push({ sect: '0000', description: 'Default' });
    }

    return { invDate, invNumber, facilityName, sections };
  };

  // Import a template pair (cost data + job ticket)
  const importTemplate = useCallback(async (
    templateName: string,
    costRows: any[],
    jobTicketRows: any[],
    jobTicketRawData: any[][],
    costFileName: string,
    jobTicketFileName: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      // Parse job ticket with raw data for cell scanning
      const { invDate, invNumber, facilityName, sections } = parseJobTicket(jobTicketRows, jobTicketRawData);

      // Check if template already exists
      const existing = db.exec(`SELECT id FROM templates WHERE name = ?`, [templateName]);
      if (existing.length > 0 && existing[0].values.length > 0) {
        return { success: false, error: `Template "${templateName}" already exists` };
      }

      // Insert template
      db.run(`
        INSERT INTO templates (name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [templateName, invDate, facilityName, invNumber, costFileName, jobTicketFileName, new Date().toISOString()]);

      // Get the template ID
      const result = db.exec(`SELECT last_insert_rowid()`);
      const templateId = result[0].values[0][0] as number;

      // Insert sections
      const sectionStmt = db.prepare(`
        INSERT INTO sections (template_id, sect, description, full_section)
        VALUES (?, ?, ?, ?)
      `);

      for (const section of sections) {
        const fullSection = `${section.sect}-${section.description}`;
        sectionStmt.run([templateId, section.sect, section.description, fullSection]);
      }
      sectionStmt.free();

      // Insert cost items
      const costStmt = db.prepare(`
        INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of costRows) {
        const ndc = row['NDC 11'] || row['NDC'] || row['ndc'];
        if (!ndc) continue;

        costStmt.run([
          templateId,
          String(ndc).trim(),
          row['Material Description'] || row['material_description'] || null,
          row['Unit Price'] ? parseFloat(row['Unit Price']) : null,
          row['Source'] || null,
          row['Material'] || null,
          row['Billing Date'] || row['Billing Da'] || null,
          row['manu'] || row['Manufacturer'] || null,
          row['generic'] || null,
          row['strength'] || null,
          row['size'] || null,
          row['dose'] || null,
        ]);
      }
      costStmt.free();

      await saveDatabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  // Update cost data for existing template
  const updateTemplateCost = useCallback(async (
    templateId: number,
    costRows: any[],
    costFileName: string
  ): Promise<{ success: boolean; error?: string; updated: number }> => {
    if (!db) return { success: false, error: 'Database not initialized', updated: 0 };

    try {
      // Delete existing cost items
      db.run(`DELETE FROM cost_items WHERE template_id = ?`, [templateId]);

      // Update cost file name
      db.run(`UPDATE templates SET cost_file_name = ? WHERE id = ?`, [costFileName, templateId]);

      // Insert new cost items
      const costStmt = db.prepare(`
        INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let count = 0;
      for (const row of costRows) {
        const ndc = row['NDC 11'] || row['NDC'] || row['ndc'];
        if (!ndc) continue;

        costStmt.run([
          templateId,
          String(ndc).trim(),
          row['Material Description'] || row['material_description'] || null,
          row['Unit Price'] ? parseFloat(row['Unit Price']) : null,
          row['Source'] || null,
          row['Material'] || null,
          row['Billing Date'] || row['Billing Da'] || null,
          row['manu'] || row['Manufacturer'] || null,
          row['generic'] || null,
          row['strength'] || null,
          row['size'] || null,
          row['dose'] || null,
        ]);
        count++;
      }
      costStmt.free();

      await saveDatabase();
      return { success: true, updated: count };
    } catch (err: any) {
      return { success: false, error: err.message, updated: 0 };
    }
  }, [db, saveDatabase]);

  // Get all templates sorted by date
  const getTemplates = useCallback((): DataTemplate[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, name, inv_date, facility_name, inv_number, created_at, cost_file_name, job_ticket_file_name
        FROM templates
        ORDER BY inv_date DESC, name
      `);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        inv_date: row[2] as string,
        facility_name: row[3] as string,
        inv_number: row[4] as string,
        created_at: row[5] as string,
        cost_file_name: row[6] as string,
        job_ticket_file_name: row[7] as string,
      }));
    } catch (err) {
      console.error('Get templates error:', err);
      return [];
    }
  }, [db]);

  // Get sections for a template
  const getTemplateSections = useCallback((templateId: number): TemplateSection[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, template_id, sect, description, full_section
        FROM sections
        WHERE template_id = ?
        ORDER BY sect
      `, [templateId]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        template_id: row[1] as number,
        sect: row[2] as string,
        description: row[3] as string,
        full_section: row[4] as string,
      }));
    } catch (err) {
      console.error('Get sections error:', err);
      return [];
    }
  }, [db]);

  // Get cost items count for a template
  const getCostItemCount = useCallback((templateId: number): number => {
    if (!db) return 0;

    try {
      const results = db.exec(`SELECT COUNT(*) FROM cost_items WHERE template_id = ?`, [templateId]);
      if (results.length === 0) return 0;
      return results[0].values[0][0] as number;
    } catch (err) {
      return 0;
    }
  }, [db]);

  // Delete templates
  const deleteTemplates = useCallback(async (templateIds: number[]): Promise<void> => {
    if (!db || templateIds.length === 0) return;

    for (const id of templateIds) {
      db.run(`DELETE FROM sections WHERE template_id = ?`, [id]);
      db.run(`DELETE FROM cost_items WHERE template_id = ?`, [id]);
      db.run(`DELETE FROM templates WHERE id = ?`, [id]);
    }

    await saveDatabase();
  }, [db, saveDatabase]);

  // Get template count
  const getTemplateCount = useCallback((): number => {
    if (!db) return 0;

    try {
      const results = db.exec('SELECT COUNT(*) FROM templates');
      if (results.length === 0) return 0;
      return results[0].values[0][0] as number;
    } catch (err) {
      return 0;
    }
  }, [db]);

  return {
    isLoading,
    isReady: !!db,
    meta,
    error,
    extractTemplateName,
    importTemplate,
    updateTemplateCost,
    getTemplates,
    getTemplateSections,
    getCostItemCount,
    deleteTemplates,
    getTemplateCount,
  };
}
