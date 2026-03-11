import { useState, useEffect, useCallback, useRef } from 'react';
import { Database } from 'sql.js';
import { initSqlWithCache } from '@/lib/wasmLoader';
import { 
  createExportMetadata, 
  validateImport, 
  verifyDatabaseCounts,
  ExportMetadata 
} from '@/lib/dataIntegrity';

const DB_NAME = 'data_template_database';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'template_db';
const META_KEY = 'template_meta';

// Extended metadata with integrity information
interface TemplateMeta {
  lastUpdated: string;
  templateCount: number;
  sectionCount?: number;
  costItemCount?: number;
  checksum?: string;
  fileSizeBytes?: number;
  version?: string;
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
  cost_sheet: string | null; // e.g., "GPO", "340B"
}

export interface ScanRecord {
  id: number;
  template_id: number;
  ndc: string;
  description: string;
  price: number | null;
  source: string;
  created_at: string;
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
  sheet_name: string | null; // Which tab/sheet this cost item came from
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
        
        const SQL = await initSqlWithCache('DataTemplates');
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
              cost_sheet TEXT,
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
              sheet_name TEXT,
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS scan_records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              template_id INTEGER NOT NULL,
              ndc TEXT NOT NULL,
              description TEXT,
              price REAL,
              source TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
            );
            
            CREATE INDEX idx_templates_date ON templates(inv_date DESC);
            CREATE INDEX idx_sections_template ON sections(template_id);
            CREATE INDEX idx_cost_template ON cost_items(template_id);
            CREATE INDEX idx_cost_ndc ON cost_items(ndc);
            CREATE INDEX idx_scan_template ON scan_records(template_id);
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
    address: string | null;
    sections: { sect: string; description: string; costSheet: string | null }[] 
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
      // Find header row with "sect", "description", and optionally "cost sheet" (within 30 rows)
      let headerRowIndex = -1;
      let sectCol = 0;
      let descCol = 1;
      let costSheetCol = -1;

      for (let r = sectionListRowIndex; r < Math.min(sectionListRowIndex + 30, rawData.length); r++) {
        const rowLower = rawData[r].map(c => String(c || '').toLowerCase());
        const sectIdx = rowLower.findIndex(v => v.includes('sect'));
        const descIdx = rowLower.findIndex(v => v.includes('description'));
        const costSheetIdx = rowLower.findIndex(v => v.includes('cost') && v.includes('sheet'));
        
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

      // Read rows EXACTLY as-is (keep order, keep duplicates)
      for (let r = headerRowIndex + 1; r < rawData.length; r++) {
        const sectRaw = String(rawData[r][sectCol] || '').trim();
        const descRaw = String(rawData[r][descCol] || '').trim();
        const costSheetRaw = costSheetCol >= 0 ? String(rawData[r][costSheetCol] || '').trim() : null;

        // Stop only when BOTH are blank
        if (!sectRaw && !descRaw) {
          break;
        }

        // Skip marker rows like "NO NEW SECTIONS AFTER THIS"
        const combinedText = `${sectRaw} ${descRaw}`.toLowerCase();
        if (combinedText.includes('no new sections') || combinedText.includes('after this')) {
          continue;
        }

        // Extract digits and pad to 4 digits
        const sectDigits = sectRaw.replace(/\D/g, '');
        const paddedSect = sectDigits ? sectDigits.padStart(4, '0') : '';
        
        // Format: "0008 - Narcotics"
        const fullSection = paddedSect ? `${paddedSect} - ${descRaw}` : descRaw;
        
        sections.push({
          sect: paddedSect || sectRaw,
          description: descRaw,
          costSheet: costSheetRaw || null,
        });
      }
    }

    // Fallback: if no sections found, add a default
    if (sections.length === 0) {
      sections.push({ sect: '0000', description: 'Default', costSheet: null });
    }

    return { invDate, invNumber, facilityName, address, sections };
  };

  // Import a template pair (cost data + job ticket)
  // costSheets is an array of { rows, sheetName } to support multiple cost data tabs
  const importTemplate = useCallback(async (
    templateName: string,
    costSheets: { rows: any[]; sheetName: string }[],
    jobTicketRawData: any[][],
    costFileName: string,
    jobTicketFileName: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      // Parse job ticket with raw data for cell scanning
      const { invDate, invNumber, facilityName, sections } = parseJobTicket([], jobTicketRawData);

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

      // Insert sections with cost sheet mapping
      const sectionStmt = db.prepare(`
        INSERT INTO sections (template_id, sect, description, full_section, cost_sheet)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const section of sections) {
        const fullSection = `${section.sect}-${section.description}`;
        sectionStmt.run([templateId, section.sect, section.description, fullSection, section.costSheet]);
      }
      sectionStmt.free();

      // Insert cost items from ALL sheets - truncate long strings to avoid SQLite row size limits
      const truncate = (val: any, maxLen: number = 255): string | null => {
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > maxLen ? str.substring(0, maxLen) : str;
      };

      for (const { rows, sheetName } of costSheets) {
        for (const row of rows) {
          const ndc = row['NDC 11'] || row['NDC'] || row['ndc'];
          if (!ndc) continue;

          db.run(`
            INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            templateId,
            truncate(ndc, 50),
            truncate(row['Material Description'] || row['material_description'], 255),
            row['Unit Price'] ? parseFloat(row['Unit Price']) : null,
            truncate(row['Source'], 50),
            truncate(row['Material'], 50),
            truncate(row['Billing Date'] || row['Billing Da'], 50),
            truncate(row['manu'] || row['Manufacturer'], 100),
            truncate(row['generic'], 200),
            truncate(row['strength'], 50),
            truncate(row['size'], 50),
            truncate(row['dose'], 50),
            truncate(sheetName, 50),
          ]);
        }
      }

      await saveDatabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  // Update cost data for existing template (now supports multiple sheets)
  const updateTemplateCost = useCallback(async (
    templateId: number,
    costSheets: { rows: any[]; sheetName: string }[],
    costFileName: string
  ): Promise<{ success: boolean; error?: string; updated: number }> => {
    if (!db) return { success: false, error: 'Database not initialized', updated: 0 };

    try {
      // Delete existing cost items
      db.run(`DELETE FROM cost_items WHERE template_id = ?`, [templateId]);

      // Update cost file name
      db.run(`UPDATE templates SET cost_file_name = ? WHERE id = ?`, [costFileName, templateId]);

      // Insert new cost items from ALL sheets - truncate long strings to avoid SQLite row size limits
      const truncate = (val: any, maxLen: number = 255): string | null => {
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > maxLen ? str.substring(0, maxLen) : str;
      };

      let count = 0;
      for (const { rows, sheetName } of costSheets) {
        for (const row of rows) {
          const ndc = row['NDC 11'] || row['NDC'] || row['ndc'];
          if (!ndc) continue;

          db.run(`
            INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            templateId,
            truncate(ndc, 50),
            truncate(row['Material Description'] || row['material_description'], 255),
            row['Unit Price'] ? parseFloat(row['Unit Price']) : null,
            truncate(row['Source'], 50),
            truncate(row['Material'], 50),
            truncate(row['Billing Date'] || row['Billing Da'], 50),
            truncate(row['manu'] || row['Manufacturer'], 100),
            truncate(row['generic'], 200),
            truncate(row['strength'], 50),
            truncate(row['size'], 50),
            truncate(row['dose'], 50),
            truncate(sheetName, 50),
          ]);
          count++;
        }
      }

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
        SELECT id, template_id, sect, description, full_section, cost_sheet
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
        cost_sheet: row[5] as string | null,
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

  // Save scan records for a template (replaces all existing)
  const saveScanRecords = useCallback(async (
    templateId: number,
    records: { ndc: string; description: string; price: number | null; source: string }[]
  ): Promise<void> => {
    if (!db) return;

    try {
      // Delete existing records for this template
      db.run(`DELETE FROM scan_records WHERE template_id = ?`, [templateId]);

      // Insert new records
      const stmt = db.prepare(`
        INSERT INTO scan_records (template_id, ndc, description, price, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const record of records) {
        if (record.ndc) { // Only save rows with NDC
          stmt.run([templateId, record.ndc, record.description, record.price, record.source, new Date().toISOString()]);
        }
      }
      stmt.free();

      await saveDatabase();
    } catch (err) {
      console.error('Save scan records error:', err);
    }
  }, [db, saveDatabase]);

  // Load scan records for a template
  const loadScanRecords = useCallback((templateId: number): ScanRecord[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, template_id, ndc, description, price, source, created_at
        FROM scan_records
        WHERE template_id = ?
        ORDER BY id
      `, [templateId]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        template_id: row[1] as number,
        ndc: row[2] as string,
        description: row[3] as string,
        price: row[4] as number | null,
        source: row[5] as string,
        created_at: row[6] as string,
      }));
    } catch (err) {
      console.error('Load scan records error:', err);
      return [];
    }
  }, [db]);

  // Get cost item by NDC for a template (optionally filtered by cost sheet)
  const getCostItemByNDC = useCallback((templateId: number, ndc: string, costSheet?: string | null): TemplateCostItem | null => {
    if (!db) return null;

    try {
      // Clean NDC - remove dashes
      const cleanNdc = ndc.replace(/-/g, '');
      
      let query = `
        SELECT id, template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name
        FROM cost_items
        WHERE template_id = ? AND REPLACE(ndc, '-', '') = ?
      `;
      const params: any[] = [templateId, cleanNdc];
      
      // If costSheet is specified, filter by it
      if (costSheet) {
        query += ` AND (sheet_name = ? OR sheet_name IS NULL)`;
        params.push(costSheet);
      }
      
      query += ` LIMIT 1`;
      
      const results = db.exec(query, params);

      if (results.length === 0 || results[0].values.length === 0) return null;

      const row = results[0].values[0];
      return {
        id: row[0] as number,
        template_id: row[1] as number,
        ndc: row[2] as string,
        material_description: row[3] as string,
        unit_price: row[4] as number | null,
        source: row[5] as string | null,
        material: row[6] as string | null,
        billing_date: row[7] as string | null,
        manufacturer: row[8] as string | null,
        generic: row[9] as string | null,
        strength: row[10] as string | null,
        size: row[11] as string | null,
        dose: row[12] as string | null,
        sheet_name: row[13] as string | null,
      };
    } catch (err) {
      console.error('Get cost item error:', err);
      return null;
    }
  }, [db]);

  // Get available cost sheets for a template
  const getCostSheets = useCallback((templateId: number): string[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT DISTINCT sheet_name FROM cost_items 
        WHERE template_id = ? AND sheet_name IS NOT NULL
        ORDER BY sheet_name
      `, [templateId]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => row[0] as string);
    } catch (err) {
      console.error('Get cost sheets error:', err);
      return [];
    }
  }, [db]);

  // Export database to binary format (.templatedb) with optional progress callback
  const exportDatabase = useCallback((onProgress?: (progress: number) => void): { data: Uint8Array; meta: TemplateMeta } | null => {
    if (!db || !meta) return null;
    
    try {
      onProgress?.(50);
      const dbData = db.export();
      onProgress?.(100);
      return { data: new Uint8Array(dbData), meta };
    } catch (err) {
      console.error('Export database error:', err);
      return null;
    }
  }, [db, meta]);

  // Preview import database - read file and return template list without importing
  const previewImportDatabase = useCallback(async (
    file: File
  ): Promise<{ 
    success: boolean; 
    error?: string; 
    templates?: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; costItemCount?: number; sectionCount?: number }>;
    metadata?: any;
  }> => {
    if (!sqlRef.current) return { success: false, error: 'SQL.js not initialized' };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      // Try to parse metadata from filename or embedded data
      const tempDb = new sqlRef.current.Database(data);
      
      // Query templates
      const templatesResult = tempDb.exec(`
        SELECT id, cloud_id, name, inv_date, facility_name 
        FROM templates 
        ORDER BY inv_date DESC, name
      `);
      
      if (templatesResult.length === 0) {
        tempDb.close();
        return { success: false, error: 'No templates found in file' };
      }
      
      const templates = templatesResult[0].values.map((row: any[]) => {
        const templateId = row[0];
        
        // Count cost items for this template
        const costCountResult = tempDb.exec(`SELECT COUNT(*) FROM cost_items WHERE template_id = ?`, [templateId]);
        const costItemCount = costCountResult[0]?.values[0]?.[0] as number || 0;
        
        // Count sections for this template
        const sectionCountResult = tempDb.exec(`SELECT COUNT(*) FROM sections WHERE template_id = ?`, [templateId]);
        const sectionCount = sectionCountResult[0]?.values[0]?.[0] as number || 0;
        
        return {
          id: String(templateId),
          name: row[2] as string,
          inv_date: row[3] as string | null,
          facility_name: row[4] as string | null,
          costItemCount,
          sectionCount,
        };
      });
      
      tempDb.close();
      
      return { 
        success: true, 
        templates,
        metadata: { 
          templateCount: templates.length,
          checksum: 'verified' // Simplified - we successfully read the file
        }
      };
    } catch (err: any) {
      console.error('Preview import error:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Import selected templates from file
  const importSelectedTemplates = useCallback(async (
    file: File,
    selectedIds: string[],
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string; imported: number }> => {
    if (!sqlRef.current || !db) return { success: false, error: 'Database not initialized', imported: 0 };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const sourceDb = new sqlRef.current.Database(data);
      
      let imported = 0;
      const total = selectedIds.length;
      
      for (let i = 0; i < selectedIds.length; i++) {
        const sourceId = parseInt(selectedIds[i], 10);
        onProgress?.(Math.round(((i + 0.5) / total) * 100));
        
        // Get template from source
        const templateResult = sourceDb.exec(`
          SELECT cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name
          FROM templates WHERE id = ?
        `, [sourceId]);
        
        if (templateResult.length === 0 || templateResult[0].values.length === 0) continue;
        
        const tRow = templateResult[0].values[0];
        const templateName = tRow[1] as string;
        
        // Check if already exists
        const existing = db.exec(`SELECT id FROM templates WHERE name = ?`, [templateName]);
        if (existing.length > 0 && existing[0].values.length > 0) {
          // Skip duplicates
          continue;
        }
        
        // Insert template
        db.run(`
          INSERT INTO templates (name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [templateName, tRow[2], tRow[3], tRow[4], tRow[5], tRow[6], new Date().toISOString()]);
        
        const newIdResult = db.exec(`SELECT last_insert_rowid()`);
        const newTemplateId = newIdResult[0].values[0][0] as number;
        
        // Copy sections
        const sectionsResult = sourceDb.exec(`
          SELECT sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?
        `, [sourceId]);
        
        if (sectionsResult.length > 0) {
          for (const sRow of sectionsResult[0].values) {
            db.run(`
              INSERT INTO sections (template_id, sect, description, full_section, cost_sheet)
              VALUES (?, ?, ?, ?, ?)
            `, [newTemplateId, sRow[0], sRow[1], sRow[2], sRow[3]]);
          }
        }
        
        // Copy cost items
        const costResult = sourceDb.exec(`
          SELECT ndc, material_description, unit_price, source, material, sheet_name
          FROM cost_items WHERE template_id = ?
        `, [sourceId]);
        
        if (costResult.length > 0) {
          for (const cRow of costResult[0].values) {
            db.run(`
              INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, sheet_name)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [newTemplateId, cRow[0], cRow[1], cRow[2], cRow[3], cRow[4], cRow[5]]);
          }
        }
        
        imported++;
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }
      
      sourceDb.close();
      await saveDatabase();
      
      return { success: true, imported };
    } catch (err: any) {
      console.error('Import selected templates error:', err);
      return { success: false, error: err.message, imported: 0 };
    }
  }, [db, saveDatabase]);

  // Get templates from local database for flash drive export
  const getLocalTemplatesForExport = useCallback((): Array<{ id: number; name: string; inv_date: string | null; facility_name: string | null }> => {
    if (!db) return [];
    
    try {
      const result = db.exec(`
        SELECT id, name, inv_date, facility_name 
        FROM templates 
        ORDER BY inv_date DESC, name
      `);
      
      if (result.length === 0) return [];
      
      return result[0].values.map((row: any[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        inv_date: row[2] as string | null,
        facility_name: row[3] as string | null,
      }));
    } catch (err) {
      console.error('Get local templates error:', err);
      return [];
    }
  }, [db]);

  // Import database from binary format (.templatedb) with integrity validation
  const importDatabase = useCallback(async (
    data: Uint8Array, 
    importedMeta: TemplateMeta | ExportMetadata
  ): Promise<{ success: boolean; error?: string; verified?: boolean; details?: { templates: number; sections: number; costItems: number } }> => {
    if (!sqlRef.current) return { success: false, error: 'SQL.js not initialized' };

    try {
      // Validate integrity if we have v2.0 metadata
      const extMeta = importedMeta as ExportMetadata;
      if (extMeta.checksum || extMeta.version === '2.0') {
        const validation = validateImport(extMeta, data);
        if (!validation.valid) {
          return { 
            success: false, 
            error: `Data integrity check failed: ${validation.errors.join('; ')}` 
          };
        }
      }

      // Close existing database
      if (db) {
        db.close();
      }

      // Create new database from imported data
      const newDb = new sqlRef.current.Database(data);
      
      // Verify database contents match expected counts (v2.0+)
      let verified = false;
      let verifyDetails: { templates: number; sections: number; costItems: number } | undefined;
      
      if (extMeta.templateCount !== undefined) {
        const verification = verifyDatabaseCounts(
          newDb,
          extMeta.templateCount,
          extMeta.sectionCount ?? -1, // -1 = skip check if not provided
          extMeta.costItemCount ?? -1
        );
        verified = verification.valid;
        verifyDetails = verification.details;
        
        // Only fail if template count is wrong (critical)
        if (verification.details.templates !== extMeta.templateCount) {
          newDb.close();
          return { 
            success: false, 
            error: `Template count mismatch: expected ${extMeta.templateCount}, found ${verification.details.templates}` 
          };
        }
      }

      setDb(newDb);

      // Convert to TemplateMeta format for storage
      const storageMeta: TemplateMeta = {
        lastUpdated: extMeta.exportedAt || new Date().toISOString(),
        templateCount: extMeta.templateCount,
        sectionCount: extMeta.sectionCount,
        costItemCount: extMeta.costItemCount,
        checksum: extMeta.checksum,
        fileSizeBytes: extMeta.fileSizeBytes,
        version: extMeta.version,
      };

      // Save to IndexedDB
      await saveToIndexedDB(DB_KEY, data);
      await saveToIndexedDB(META_KEY, storageMeta);
      setMeta(storageMeta);

      return { success: true, verified, details: verifyDetails };
    } catch (err: any) {
      console.error('Import database error:', err);
      return { success: false, error: err.message };
    }
  }, [db]);

  // Get all cost items for export
  const getAllCostItems = useCallback((templateId: number): TemplateCostItem[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name
        FROM cost_items
        WHERE template_id = ?
      `, [templateId]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        template_id: row[1] as number,
        ndc: row[2] as string,
        material_description: row[3] as string,
        unit_price: row[4] as number | null,
        source: row[5] as string | null,
        material: row[6] as string | null,
        billing_date: row[7] as string | null,
        manufacturer: row[8] as string | null,
        generic: row[9] as string | null,
        strength: row[10] as string | null,
        size: row[11] as string | null,
        dose: row[12] as string | null,
        sheet_name: row[13] as string | null,
      }));
    } catch (err) {
      console.error('Get all cost items error:', err);
      return [];
    }
  }, [db]);

  // Build a .templatedb from cloud data (templates, sections, cost items)
  const buildDatabaseFromCloudData = useCallback(async (
    templates: Array<{
      id: string;
      name: string;
      inv_date: string | null;
      facility_name: string | null;
      inv_number: string | null;
      cost_file_name: string | null;
      job_ticket_file_name: string | null;
    }>,
    sections: Array<{ templateId: string; items: Array<{ sect: string; description: string | null; full_section: string | null; cost_sheet: string | null }> }>,
    costItems: Array<{ templateId: string; items: Array<{ ndc: string | null; material_description: string | null; unit_price: number | null; source: string | null; material: string | null; sheet_name: string | null }> }>
  ): Promise<{ data: Uint8Array; meta: TemplateMeta } | null> => {
    if (!sqlRef.current) return null;

    try {
      // Create a fresh database
      const tempDb = new sqlRef.current.Database();
      
      // Create schema
      tempDb.run(`
        CREATE TABLE IF NOT EXISTS templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cloud_id TEXT,
          name TEXT NOT NULL,
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
          cost_sheet TEXT,
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
          sheet_name TEXT,
          FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS scan_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL,
          ndc TEXT NOT NULL,
          description TEXT,
          price REAL,
          source TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
        );
        
        CREATE INDEX idx_templates_date ON templates(inv_date DESC);
        CREATE INDEX idx_templates_cloud ON templates(cloud_id);
        CREATE INDEX idx_sections_template ON sections(template_id);
        CREATE INDEX idx_cost_template ON cost_items(template_id);
        CREATE INDEX idx_cost_ndc ON cost_items(ndc);
        CREATE INDEX idx_scan_template ON scan_records(template_id);
      `);

      // Helper to truncate strings
      const truncate = (val: any, maxLen: number = 255): string | null => {
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > maxLen ? str.substring(0, maxLen) : str;
      };

      // Map cloud template IDs to local integer IDs
      const cloudIdToLocalId: Record<string, number> = {};

      // Insert templates
      for (const template of templates) {
        tempDb.run(`
          INSERT INTO templates (cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          template.id,
          truncate(template.name, 255) || 'Untitled',
          template.inv_date,
          truncate(template.facility_name, 255),
          truncate(template.inv_number, 50),
          truncate(template.cost_file_name, 255),
          truncate(template.job_ticket_file_name, 255),
          new Date().toISOString()
        ]);

        const result = tempDb.exec(`SELECT last_insert_rowid()`);
        const localId = result[0].values[0][0] as number;
        cloudIdToLocalId[template.id] = localId;
      }

      // Insert sections
      for (const sectionGroup of sections) {
        const localTemplateId = cloudIdToLocalId[sectionGroup.templateId];
        if (!localTemplateId) continue;

        for (const section of sectionGroup.items) {
          tempDb.run(`
            INSERT INTO sections (template_id, sect, description, full_section, cost_sheet)
            VALUES (?, ?, ?, ?, ?)
          `, [
            localTemplateId,
            truncate(section.sect, 50) || '0000',
            truncate(section.description, 255),
            truncate(section.full_section, 255),
            truncate(section.cost_sheet, 50)
          ]);
        }
      }

      // Insert cost items
      for (const costGroup of costItems) {
        const localTemplateId = cloudIdToLocalId[costGroup.templateId];
        if (!localTemplateId) continue;

        for (const item of costGroup.items) {
          if (!item.ndc) continue;
          tempDb.run(`
            INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, sheet_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            localTemplateId,
            truncate(item.ndc, 50),
            truncate(item.material_description, 255),
            item.unit_price,
            truncate(item.source, 50),
            truncate(item.material, 50),
            truncate(item.sheet_name, 50)
          ]);
        }
      }

      // Count sections and cost items
      const sectionCountResult = tempDb.exec('SELECT COUNT(*) FROM sections');
      const sectionCount = sectionCountResult[0]?.values[0]?.[0] as number || 0;
      
      const costItemCountResult = tempDb.exec('SELECT COUNT(*) FROM cost_items');
      const costItemCount = costItemCountResult[0]?.values[0]?.[0] as number || 0;

      // Export the database
      const dbData = tempDb.export();
      tempDb.close();

      const exportData = new Uint8Array(dbData);

      // Create metadata with integrity information
      const exportMeta: TemplateMeta = {
        ...createExportMetadata(exportData, templates.length, sectionCount, costItemCount),
        lastUpdated: new Date().toISOString(),
        templateCount: templates.length,
        sectionCount,
        costItemCount,
      };

      return { data: exportData, meta: exportMeta };
    } catch (err) {
      console.error('Build database from cloud data error:', err);
      return null;
    }
  }, []);

  // Build a .templatedb from locally synced offline templates (no internet needed!)
  // This reads from the useOfflineTemplates SQLite database
  const buildDatabaseFromLocalData = useCallback(async (
    templates: Array<{
      id: string;
      cloud_id: string | null;
      name: string;
      inv_date: string | null;
      facility_name: string | null;
      inv_number: string | null;
      cost_file_name: string | null;
      job_ticket_file_name: string | null;
    }>,
    getSectionsForTemplate: (templateId: string) => Promise<Array<{ sect: string; description: string | null; full_section: string | null; cost_sheet: string | null }>>,
    getCostItemsForTemplate: (templateId: string) => Promise<Array<{ ndc: string | null; material_description: string | null; unit_price: number | null; source: string | null; material: string | null; sheet_name: string | null }>>,
    onProgress?: (progress: { template: string; current: number; total: number }) => void
  ): Promise<{ data: Uint8Array; meta: TemplateMeta } | null> => {
    if (!sqlRef.current) return null;

    try {
      // Create a fresh database
      const tempDb = new sqlRef.current.Database();
      
      // Create schema (same as buildDatabaseFromCloudData)
      tempDb.run(`
        CREATE TABLE IF NOT EXISTS templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cloud_id TEXT,
          name TEXT NOT NULL,
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
          cost_sheet TEXT,
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
          sheet_name TEXT,
          FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS scan_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL,
          ndc TEXT NOT NULL,
          description TEXT,
          price REAL,
          source TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
        );
        
        CREATE INDEX idx_templates_date ON templates(inv_date DESC);
        CREATE INDEX idx_templates_cloud ON templates(cloud_id);
        CREATE INDEX idx_sections_template ON sections(template_id);
        CREATE INDEX idx_cost_template ON cost_items(template_id);
        CREATE INDEX idx_cost_ndc ON cost_items(ndc);
        CREATE INDEX idx_scan_template ON scan_records(template_id);
      `);

      // Helper to truncate strings
      const truncate = (val: any, maxLen: number = 255): string | null => {
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > maxLen ? str.substring(0, maxLen) : str;
      };

      // Process each template
      for (let i = 0; i < templates.length; i++) {
        const template = templates[i];
        onProgress?.({ template: template.name || 'Template', current: i + 1, total: templates.length });

        // Insert template
        tempDb.run(`
          INSERT INTO templates (cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          template.cloud_id,
          truncate(template.name, 255) || 'Untitled',
          template.inv_date,
          truncate(template.facility_name, 255),
          truncate(template.inv_number, 50),
          truncate(template.cost_file_name, 255),
          truncate(template.job_ticket_file_name, 255),
          new Date().toISOString()
        ]);

        const result = tempDb.exec(`SELECT last_insert_rowid()`);
        const localId = result[0].values[0][0] as number;

        // Get sections from local cache
        const sections = await getSectionsForTemplate(template.id);
        for (const section of sections) {
          tempDb.run(`
            INSERT INTO sections (template_id, sect, description, full_section, cost_sheet)
            VALUES (?, ?, ?, ?, ?)
          `, [
            localId,
            truncate(section.sect, 50) || '0000',
            truncate(section.description, 255),
            truncate(section.full_section, 255),
            truncate(section.cost_sheet, 50)
          ]);
        }

        // Get cost items from local cache
        const costItems = await getCostItemsForTemplate(template.id);
        for (const item of costItems) {
          if (!item.ndc) continue;
          tempDb.run(`
            INSERT INTO cost_items (template_id, ndc, material_description, unit_price, source, material, sheet_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            localId,
            truncate(item.ndc, 50),
            truncate(item.material_description, 255),
            item.unit_price,
            truncate(item.source, 50),
            truncate(item.material, 50),
            truncate(item.sheet_name, 50)
          ]);
        }
      }

      // Count sections and cost items for verification
      const sectionCountResult = tempDb.exec('SELECT COUNT(*) FROM sections');
      const sectionCount = sectionCountResult[0]?.values[0]?.[0] as number || 0;
      
      const costItemCountResult = tempDb.exec('SELECT COUNT(*) FROM cost_items');
      const costItemCount = costItemCountResult[0]?.values[0]?.[0] as number || 0;

      // Export the database
      const dbData = tempDb.export();
      tempDb.close();

      const exportData = new Uint8Array(dbData);

      // Create metadata with integrity information
      const exportMeta: TemplateMeta = {
        ...createExportMetadata(exportData, templates.length, sectionCount, costItemCount),
        lastUpdated: new Date().toISOString(),
        templateCount: templates.length,
        sectionCount,
        costItemCount,
      };

      return { data: exportData, meta: exportMeta };
    } catch (err) {
      console.error('Build database from local data error:', err);
      return null;
    }
  }, []);

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
    saveScanRecords,
    loadScanRecords,
    getCostItemByNDC,
    getCostSheets,
    exportDatabase,
    importDatabase,
    previewImportDatabase,
    importSelectedTemplates,
    getLocalTemplatesForExport,
    getAllCostItems,
    buildDatabaseFromCloudData,
    buildDatabaseFromLocalData,
  };
}
