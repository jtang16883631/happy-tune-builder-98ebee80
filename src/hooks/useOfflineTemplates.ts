import { useState, useEffect, useCallback, useRef } from 'react';
import initSqlJs, { Database } from 'sql.js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DB_NAME = 'offline_templates_db';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'templates_db';
const SYNC_META_KEY = 'sync_meta';

export type TemplateStatus = 'active' | 'working' | 'completed';

export interface OfflineTemplate {
  id: string;
  cloud_id: string | null; // null if only local
  user_id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  inv_number: string | null;
  cost_file_name: string | null;
  job_ticket_file_name: string | null;
  status: TemplateStatus | null;
  created_at: string;
  updated_at: string;
  is_dirty: boolean; // true if local changes not synced
}

export interface OfflineSection {
  id: string;
  template_id: string;
  sect: string;
  description: string | null;
  full_section: string | null;
  cost_sheet?: string | null; // e.g., "GPO", "340B" (matches cloud template_sections.cost_sheet)
}

export interface OfflineCostItem {
  id: string;
  template_id: string;
  ndc: string | null;
  material_description: string | null;
  unit_price: number | null;
  source: string | null;
  material: string | null;
  sheet_name?: string | null; // e.g., "GPO", "340B" (matches cloud template_cost_items.sheet_name)
}

interface SyncMeta {
  lastSyncedAt: string | null;
  pendingChanges: number;
}

export interface SyncProgress {
  currentTemplate: string | null;
  currentTemplateIndex: number;
  totalTemplates: number;
  costItemsFetched: number;
  status: 'idle' | 'fetching_template' | 'fetching_sections' | 'fetching_cost_items' | 'saving' | 'complete';
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

const generateId = () => crypto.randomUUID();

// Accept isOnline from the authoritative useOnlineStatus hook so there is a
// single source of truth for connectivity throughout the app.
export function useOfflineTemplates(isOnline: boolean = navigator.onLine) {
  const { user } = useAuth();
  const [db, setDb] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({ lastSyncedAt: null, pendingChanges: 0 });
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    currentTemplate: null,
    currentTemplateIndex: 0,
    totalTemplates: 0,
    costItemsFetched: 0,
    status: 'idle',
  });
  const sqlRef = useRef<any>(null);

  // Initialize sql.js and load database
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        
        const SQL = await initSqlJs({
          locateFile: (file: string) => `${import.meta.env.BASE_URL}${file}`,
        });
        sqlRef.current = SQL;

        const savedDb = await loadFromIndexedDB<Uint8Array>(DB_KEY);
        const savedMeta = await loadFromIndexedDB<SyncMeta>(SYNC_META_KEY);

        if (savedDb) {
          const database = new SQL.Database(savedDb);
          setDb(database);
          if (savedMeta) setSyncMeta(savedMeta);
        } else {
          const database = new SQL.Database();
            database.run(`
              CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                cloud_id TEXT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                inv_date TEXT,
                facility_name TEXT,
                inv_number TEXT,
                cost_file_name TEXT,
                job_ticket_file_name TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_dirty INTEGER DEFAULT 0
              );
              
              CREATE TABLE IF NOT EXISTS sections (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                sect TEXT NOT NULL,
                description TEXT,
                full_section TEXT,
                cost_sheet TEXT,
                FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
              );
              
              CREATE TABLE IF NOT EXISTS cost_items (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                ndc TEXT,
                material_description TEXT,
                unit_price REAL,
                source TEXT,
                material TEXT,
                sheet_name TEXT,
                FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
              );
              
              CREATE INDEX IF NOT EXISTS idx_templates_date ON templates(inv_date DESC);
              CREATE INDEX IF NOT EXISTS idx_templates_cloud ON templates(cloud_id);
              CREATE INDEX IF NOT EXISTS idx_sections_template ON sections(template_id);
              CREATE INDEX IF NOT EXISTS idx_cost_template ON cost_items(template_id);
              CREATE INDEX IF NOT EXISTS idx_cost_ndc ON cost_items(ndc);
              CREATE INDEX IF NOT EXISTS idx_cost_sheet ON cost_items(sheet_name);
            `);
          
          setDb(database);
          await saveDatabase(database);
        }
      } catch (err: any) {
        console.error('Failed to initialize offline DB:', err);
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

  const saveDatabase = useCallback(async (database?: Database) => {
    const targetDb = database || db;
    if (!targetDb) return;
    
    const dbData = targetDb.export();
    await saveToIndexedDB(DB_KEY, new Uint8Array(dbData));
  }, [db]);

  const updateSyncMeta = useCallback(async (meta: Partial<SyncMeta>) => {
    const newMeta = { ...syncMeta, ...meta };
    setSyncMeta(newMeta);
    await saveToIndexedDB(SYNC_META_KEY, newMeta);
  }, [syncMeta]);

  // Get all templates from local DB
  const getTemplates = useCallback((): OfflineTemplate[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, cloud_id, user_id, name, inv_date, facility_name, inv_number, 
               cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty
        FROM templates
        ORDER BY inv_date DESC, name
      `);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as string,
        cloud_id: row[1] as string | null,
        user_id: row[2] as string,
        name: row[3] as string,
        inv_date: row[4] as string | null,
        facility_name: row[5] as string | null,
        inv_number: row[6] as string | null,
        cost_file_name: row[7] as string | null,
        job_ticket_file_name: row[8] as string | null,
        status: row[9] as TemplateStatus | null,
        created_at: row[10] as string,
        updated_at: row[11] as string,
        is_dirty: Boolean(row[12]),
      }));
    } catch (err) {
      console.error('Get templates error:', err);
      return [];
    }
  }, [db]);

  // Get pending changes count
  const getPendingChangesCount = useCallback((): number => {
    if (!db) return 0;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM templates WHERE is_dirty = 1`);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch {
      return 0;
    }
  }, [db]);

  // Update template status locally
  const updateTemplateStatus = useCallback(async (templateId: string, status: TemplateStatus) => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      db.run(`UPDATE templates SET status = ?, is_dirty = 1, updated_at = ? WHERE id = ?`, 
        [status, new Date().toISOString(), templateId]);
      await saveDatabase();
      await updateSyncMeta({ pendingChanges: getPendingChangesCount() });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase, updateSyncMeta, getPendingChangesCount]);

  // Get sections for a template
  const getSections = useCallback(async (templateId: string): Promise<OfflineSection[]> => {
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
        id: row[0] as string,
        template_id: row[1] as string,
        sect: row[2] as string,
        description: row[3] as string | null,
        full_section: row[4] as string | null,
        cost_sheet: (row[5] as string | null) ?? null,
      }));
    } catch (err) {
      console.error('Get sections error:', err);
      return [];
    }
  }, [db]);

  // Get cost item by NDC
  // If sheetName is provided, filter by that specific cost sheet (tab)
  const getCostItemByNDC = useCallback(
    async (templateId: string, ndc: string, sheetName?: string | null): Promise<OfflineCostItem | null> => {
      if (!db) return null;

      try {
        const cleanNdc = ndc.replace(/\D/g, '');
        
        // Build query based on whether sheetName filter is provided
        let query: string;
        let params: (string | null)[];
        
        if (sheetName) {
          // Filter by specific cost sheet
          query = `
            SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name
            FROM cost_items
            WHERE template_id = ? AND (ndc = ? OR ndc = ?) AND sheet_name = ?
            LIMIT 1
          `;
          params = [templateId, cleanNdc, ndc, sheetName];
        } else {
          // No sheet filter - return first match
          query = `
            SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name
            FROM cost_items
            WHERE template_id = ? AND (ndc = ? OR ndc = ?)
            LIMIT 1
          `;
          params = [templateId, cleanNdc, ndc];
        }
        
        const results = db.exec(query, params);

        if (results.length === 0 || results[0].values.length === 0) return null;

        const row = results[0].values[0];
        return {
          id: row[0] as string,
          template_id: row[1] as string,
          ndc: row[2] as string | null,
          material_description: row[3] as string | null,
          unit_price: row[4] as number | null,
          source: row[5] as string | null,
          material: row[6] as string | null,
          sheet_name: row[7] as string | null,
        };
      } catch (err) {
        console.error('Get cost item error:', err);
        return null;
      }
    },
    [db]
  );

  // Get all cost items for a template (for export to flash drive)
  const getAllCostItems = useCallback(
    async (templateId: string): Promise<Array<{
      ndc: string | null;
      material_description: string | null;
      unit_price: number | null;
      source: string | null;
      material: string | null;
      sheet_name: string | null;
    }>> => {
      if (!db) return [];

      try {
        const results = db.exec(`
          SELECT ndc, material_description, unit_price, source, material, sheet_name
          FROM cost_items
          WHERE template_id = ?
        `, [templateId]);

        if (results.length === 0) return [];

        return results[0].values.map((row: any[]) => ({
          ndc: row[0] as string | null,
          material_description: row[1] as string | null,
          unit_price: row[2] as number | null,
          source: row[3] as string | null,
          material: row[4] as string | null,
          sheet_name: row[5] as string | null,
        }));
      } catch (err) {
        console.error('Get all cost items error:', err);
        return [];
      }
    },
    [db]
  );

  // Get list of synced template cloud IDs
  const getSyncedTemplateIds = useCallback((): string[] => {
    if (!db) return [];
    try {
      const result = db.exec(`SELECT cloud_id FROM templates WHERE cloud_id IS NOT NULL`);
      if (result.length === 0) return [];
      return result[0].values.map(row => row[0] as string);
    } catch {
      return [];
    }
  }, [db]);

  // SYNC: Pull specific templates from cloud to local
  const syncSelectedTemplates = useCallback(async (templateIds: string[]): Promise<{ 
    success: boolean; 
    synced: number; 
    error?: string 
  }> => {
    if (!db || !user || !isOnline) {
      return { success: false, synced: 0, error: 'Cannot sync: offline or not authenticated' };
    }

    setIsSyncing(true);
    setSyncProgress({
      currentTemplate: null,
      currentTemplateIndex: 0,
      totalTemplates: templateIds.length,
      costItemsFetched: 0,
      status: 'idle',
    });

    try {
      // Get currently synced templates
      const currentlySynced = getSyncedTemplateIds();
      
      // Only ADD templates that aren't already downloaded — never remove existing ones
      const toAdd = templateIds.filter(id => !currentlySynced.includes(id));

      // Add newly selected templates
      let synced = 0;
      for (let i = 0; i < toAdd.length; i++) {
        const cloudId = toAdd[i];
        
        // Update progress - fetching template
        setSyncProgress(prev => ({
          ...prev,
          currentTemplateIndex: i + 1,
          status: 'fetching_template',
          costItemsFetched: 0,
        }));

        // Fetch template + count in parallel
        const [templateResult, countResult] = await Promise.all([
          supabase
            .from('data_templates')
            .select('id, user_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, status, created_at, updated_at')
            .eq('id', cloudId)
            .single(),
          supabase
            .from('template_cost_items')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', cloudId),
        ]);

        const { data: ct, error: fetchError } = templateResult;
        if (fetchError || !ct) continue;

        setSyncProgress(prev => ({
          ...prev,
          currentTemplate: ct.name || ct.facility_name || 'Template',
        }));

        // Use cloud ID as local ID so localStorage scan records stay consistent
        const localId = ct.id;

        // --- BEGIN TRANSACTION for all inserts of this template ---
        db.run('BEGIN TRANSACTION');

        try {
          db.run(`
            INSERT OR REPLACE INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, inv_number, 
                                   cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `, [
            localId, ct.id, ct.user_id, ct.name, ct.inv_date, ct.facility_name, ct.inv_number,
            ct.cost_file_name, ct.job_ticket_file_name, ct.status || 'active', ct.created_at, ct.updated_at
          ]);

          // Update progress - fetching sections
          setSyncProgress(prev => ({ ...prev, status: 'fetching_sections' }));

          // Fetch sections
          const { data: sections } = await supabase
            .from('template_sections')
            .select('id, template_id, sect, description, full_section, cost_sheet')
            .eq('template_id', ct.id);

          for (const s of sections || []) {
            db.run(`
              INSERT OR REPLACE INTO sections (id, template_id, sect, description, full_section, cost_sheet)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [s.id, localId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]);
          }

          // Update progress - fetching cost items
          setSyncProgress(prev => ({ ...prev, status: 'fetching_cost_items', costItemsFetched: 0 }));

          // Parallel fetch cost item pages
          const PAGE_SIZE = 1000;
          const totalCount = countResult.count || 0;
          const totalPages = Math.ceil(totalCount / PAGE_SIZE);
          const pageNumbers = Array.from({ length: Math.max(totalPages, 1) }, (_, i) => i);

          const pageResults = await Promise.all(
            pageNumbers.map(page =>
              supabase
                .from('template_cost_items')
                .select('id, ndc, material_description, unit_price, source, material, sheet_name')
                .eq('template_id', ct.id)
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            )
          );

          // Bulk insert with prepared statement
          const costStmt = db.prepare(`
            INSERT OR REPLACE INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          let totalCostItemsFetched = 0;
          for (const { data: costItems, error: costError } of pageResults) {
            if (costError) { console.error('Cost items fetch error:', costError); continue; }
            for (const c of costItems || []) {
              costStmt.run([c.id, localId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null]);
            }
            totalCostItemsFetched += (costItems?.length || 0);
            setSyncProgress(prev => ({ ...prev, costItemsFetched: totalCostItemsFetched }));
          }
          costStmt.free();

          db.run('COMMIT');
        } catch (txErr) {
          db.run('ROLLBACK');
          throw txErr;
        }

        // Update progress - saving
        setSyncProgress(prev => ({ ...prev, status: 'saving' }));

        synced++;
      }

      await saveDatabase();
      await updateSyncMeta({ lastSyncedAt: new Date().toISOString() });
      
      // Mark sync complete
      setSyncProgress(prev => ({ 
        ...prev, 
        status: 'complete',
        currentTemplate: null,
      }));
      
      return { success: true, synced: synced + (templateIds.length - toAdd.length) };
    } catch (err: any) {
      console.error('Sync selected templates error:', err);
      return { success: false, synced: 0, error: err.message };
    } finally {
      setIsSyncing(false);
      // Reset progress after a short delay
      setTimeout(() => {
        setSyncProgress({
          currentTemplate: null,
          currentTemplateIndex: 0,
          totalTemplates: 0,
          costItemsFetched: 0,
          status: 'idle',
        });
      }, 2000);
    }
  }, [db, user, isOnline, saveDatabase, updateSyncMeta, getSyncedTemplateIds]);

  // SYNC: Pull from cloud to local (all templates)
  const pullFromCloud = useCallback(async (): Promise<{ success: boolean; pulled: number; error?: string }> => {
    if (!db || !user || !isOnline) {
      return { success: false, pulled: 0, error: 'Cannot sync: offline or not authenticated' };
    }

    try {
      // Fetch all cloud templates (selective columns)
      const { data: cloudTemplates, error: fetchError } = await supabase
        .from('data_templates')
        .select('id, user_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, status, created_at, updated_at')
        .order('inv_date', { ascending: false });

      if (fetchError) throw fetchError;

      let pulled = 0;

      for (const ct of cloudTemplates || []) {
        // Check if exists locally by cloud_id
        const existing = db.exec(`SELECT id FROM templates WHERE cloud_id = ?`, [ct.id]);
        
        if (existing.length === 0 || existing[0].values.length === 0) {
          const localId = ct.id;

          // --- BEGIN TRANSACTION for all inserts of this template ---
          db.run('BEGIN TRANSACTION');

          try {
            db.run(`
              INSERT OR REPLACE INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, inv_number, 
                                     cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [
              localId, ct.id, ct.user_id, ct.name, ct.inv_date, ct.facility_name, ct.inv_number,
              ct.cost_file_name, ct.job_ticket_file_name, ct.status || 'active', ct.created_at, ct.updated_at
            ]);

            // Fetch sections and cost item count in parallel
            const [sectionsResult, countResult] = await Promise.all([
              supabase
                .from('template_sections')
                .select('id, template_id, sect, description, full_section, cost_sheet')
                .eq('template_id', ct.id),
              supabase
                .from('template_cost_items')
                .select('id', { count: 'exact', head: true })
                .eq('template_id', ct.id),
            ]);

            for (const s of sectionsResult.data || []) {
              db.run(`
                INSERT OR REPLACE INTO sections (id, template_id, sect, description, full_section, cost_sheet)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [s.id, localId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]);
            }

            // Parallel fetch cost item pages
            const PAGE_SIZE = 1000;
            const totalCount = countResult.count || 0;
            const totalPages = Math.ceil(totalCount / PAGE_SIZE);
            const pageNumbers = Array.from({ length: Math.max(totalPages, 1) }, (_, i) => i);

            const pageResults = await Promise.all(
              pageNumbers.map(page =>
                supabase
                  .from('template_cost_items')
                  .select('id, ndc, material_description, unit_price, source, material, sheet_name')
                  .eq('template_id', ct.id)
                  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
              )
            );

            // Bulk insert with prepared statement
            const costStmt = db.prepare(`
              INSERT OR REPLACE INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const { data: costItems, error: costError } of pageResults) {
              if (costError) { console.error('Cost items fetch error:', costError); continue; }
              for (const c of costItems || []) {
                costStmt.run([c.id, localId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null]);
              }
            }
            costStmt.free();

            db.run('COMMIT');
          } catch (txErr) {
            db.run('ROLLBACK');
            throw txErr;
          }

          pulled++;
        } else {
          // Update existing if not dirty
          const localId = existing[0].values[0][0] as string;
          const isDirty = db.exec(`SELECT is_dirty FROM templates WHERE id = ?`, [localId]);
          
          if (isDirty.length > 0 && !isDirty[0].values[0][0]) {
            db.run(`
              UPDATE templates SET name = ?, inv_date = ?, facility_name = ?, inv_number = ?,
                                   cost_file_name = ?, job_ticket_file_name = ?, status = ?, updated_at = ?
              WHERE id = ?
            `, [ct.name, ct.inv_date, ct.facility_name, ct.inv_number, 
                ct.cost_file_name, ct.job_ticket_file_name, ct.status, ct.updated_at, localId]);
          }
        }
      }

      await saveDatabase();
      await updateSyncMeta({ lastSyncedAt: new Date().toISOString() });
      
      return { success: true, pulled };
    } catch (err: any) {
      console.error('Pull from cloud error:', err);
      return { success: false, pulled: 0, error: err.message };
    }
  }, [db, user, isOnline, saveDatabase, updateSyncMeta]);

  // SYNC: Push local changes to cloud
  const pushToCloud = useCallback(async (): Promise<{ success: boolean; pushed: number; error?: string }> => {
    if (!db || !user || !isOnline) {
      return { success: false, pushed: 0, error: 'Cannot sync: offline or not authenticated' };
    }

    try {
      // Get dirty templates
      const dirtyResult = db.exec(`SELECT * FROM templates WHERE is_dirty = 1`);
      
      if (dirtyResult.length === 0 || dirtyResult[0].values.length === 0) {
        return { success: true, pushed: 0 };
      }

      let pushed = 0;
      const columns = dirtyResult[0].columns;
      
      for (const row of dirtyResult[0].values) {
        const template: any = {};
        columns.forEach((col, i) => template[col] = row[i]);

        if (template.cloud_id) {
          // Update existing cloud record
          const { error: updateError } = await supabase
            .from('data_templates')
            .update({
              name: template.name,
              inv_date: template.inv_date,
              facility_name: template.facility_name,
              status: template.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', template.cloud_id);

          if (updateError) throw updateError;
        } else {
          // Create new cloud record
          const { data: newTemplate, error: insertError } = await supabase
            .from('data_templates')
            .insert({
              user_id: user.id,
              name: template.name,
              inv_date: template.inv_date,
              facility_name: template.facility_name,
              inv_number: template.inv_number,
              cost_file_name: template.cost_file_name,
              job_ticket_file_name: template.job_ticket_file_name,
              status: template.status,
            })
            .select()
            .single();

          if (insertError) throw insertError;

          // Update local with cloud_id
          db.run(`UPDATE templates SET cloud_id = ? WHERE id = ?`, [newTemplate.id, template.id]);

          // Push sections
          const sectionsResult = db.exec(
            `SELECT sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`,
            [template.id]
          );
          if (sectionsResult.length > 0) {
            const sectionInserts = sectionsResult[0].values.map((s: any[]) => ({
              template_id: newTemplate.id,
              sect: s[0],
              description: s[1],
              full_section: s[2],
              cost_sheet: s[3] ?? null,
            }));
            await supabase.from('template_sections').insert(sectionInserts);
          }

          // Push cost items in batches
          const costResult = db.exec(
            `SELECT ndc, material_description, unit_price, source, material, sheet_name FROM cost_items WHERE template_id = ?`,
            [template.id]
          );
          if (costResult.length > 0) {
            const costInserts = costResult[0].values.map((c: any[]) => ({
              template_id: newTemplate.id,
              ndc: c[0],
              material_description: c[1],
              unit_price: c[2],
              source: c[3],
              material: c[4],
              sheet_name: c[5] ?? null,
            }));
            
            // Batch insert
            const batchSize = 500;
            for (let i = 0; i < costInserts.length; i += batchSize) {
              const batch = costInserts.slice(i, i + batchSize);
              await supabase.from('template_cost_items').insert(batch);
            }
          }
        }

        // Mark as clean
        db.run(`UPDATE templates SET is_dirty = 0 WHERE id = ?`, [template.id]);
        pushed++;
      }

      await saveDatabase();
      await updateSyncMeta({ 
        lastSyncedAt: new Date().toISOString(),
        pendingChanges: 0 
      });
      
      return { success: true, pushed };
    } catch (err: any) {
      console.error('Push to cloud error:', err);
      return { success: false, pushed: 0, error: err.message };
    }
  }, [db, user, isOnline, saveDatabase, updateSyncMeta]);

  // Full sync: push then pull
  const syncWithCloud = useCallback(async (): Promise<{ 
    success: boolean; 
    pushed: number; 
    pulled: number; 
    error?: string 
  }> => {
    if (!isOnline) {
      return { success: false, pushed: 0, pulled: 0, error: 'No internet connection' };
    }

    setIsSyncing(true);
    
    try {
      // Push local changes first
      const pushResult = await pushToCloud();
      if (!pushResult.success) {
        return { ...pushResult, pulled: 0 };
      }

      // Then pull cloud data
      const pullResult = await pullFromCloud();
      
      return {
        success: pullResult.success,
        pushed: pushResult.pushed,
        pulled: pullResult.pulled,
        error: pullResult.error,
      };
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, pushToCloud, pullFromCloud]);

  // Delete a locally downloaded template (and its sections/cost items)
  const deleteLocalTemplate = useCallback(async (templateId: string): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      db.run(`DELETE FROM cost_items WHERE template_id = ?`, [templateId]);
      db.run(`DELETE FROM sections WHERE template_id = ?`, [templateId]);
      db.run(`DELETE FROM templates WHERE id = ?`, [templateId]);
      await saveDatabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  // Get cost item count per template
  const getTemplateCostItemCount = useCallback((templateId: string): number => {
    if (!db) return 0;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM cost_items WHERE template_id = ?`, [templateId]);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch { return 0; }
  }, [db]);

  // Check if we have local data
  const hasLocalData = useCallback((): boolean => {
    if (!db) return false;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM templates`);
      return result.length > 0 && (result[0].values[0][0] as number) > 0;
    } catch {
      return false;
    }
  }, [db]);

  // Export offline database to binary format for flash drive transfer
  // If selectedIds is provided, only export those templates; otherwise export all.
  const exportToFlashDrive = useCallback((selectedIds?: string[]): { 
    data: Uint8Array; 
    templates: OfflineTemplate[];
    sectionCount: number;
    costItemCount: number;
  } | null => {
    if (!db || !sqlRef.current) return null;
    
    try {
      const allTemplates = getTemplates();
      const templatesToExport = selectedIds && selectedIds.length > 0
        ? allTemplates.filter(t => selectedIds.includes(t.id))
        : allTemplates;

      if (templatesToExport.length === 0) return null;

      // Build a filtered in-memory SQLite DB with only the selected templates
      const exportDb = new sqlRef.current.Database();
      exportDb.run(`
        CREATE TABLE templates (
          id TEXT PRIMARY KEY, cloud_id TEXT, user_id TEXT NOT NULL, name TEXT NOT NULL,
          inv_date TEXT, facility_name TEXT, inv_number TEXT, cost_file_name TEXT,
          job_ticket_file_name TEXT, status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_dirty INTEGER DEFAULT 0
        );
        CREATE TABLE sections (
          id TEXT PRIMARY KEY, template_id TEXT NOT NULL, sect TEXT NOT NULL,
          description TEXT, full_section TEXT, cost_sheet TEXT
        );
        CREATE TABLE cost_items (
          id TEXT PRIMARY KEY, template_id TEXT NOT NULL, ndc TEXT,
          material_description TEXT, unit_price REAL, source TEXT, material TEXT, sheet_name TEXT
        );
      `);

      let sectionCount = 0;
      let costItemCount = 0;

      for (const t of templatesToExport) {
        exportDb.run(
          `INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [t.id, t.cloud_id, t.user_id, t.name, t.inv_date, t.facility_name,
           t.inv_number, t.cost_file_name, t.job_ticket_file_name,
           t.status, t.created_at, t.updated_at, 0]
        );

        const sectResult = db.exec(`SELECT id, template_id, sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [t.id]);
        if (sectResult.length > 0) {
          for (const row of sectResult[0].values) {
            exportDb.run(`INSERT INTO sections VALUES (?,?,?,?,?,?)`, row as any[]);
            sectionCount++;
          }
        }

        const costResult = db.exec(`SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name FROM cost_items WHERE template_id = ?`, [t.id]);
        if (costResult.length > 0) {
          for (const row of costResult[0].values) {
            exportDb.run(`INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?)`, row as any[]);
            costItemCount++;
          }
        }
      }

      const dbData = exportDb.export();
      exportDb.close();

      return { 
        data: new Uint8Array(dbData), 
        templates: templatesToExport,
        sectionCount,
        costItemCount,
      };
    } catch (err) {
      console.error('Export to flash drive error:', err);
      return null;
    }
  }, [db, getTemplates]);

  // Export any cloud templates (by their cloud IDs) to a flash drive file.
  // For templates already on device, uses local data. For cloud-only templates,
  // fetches data directly from Supabase without saving to device.
  const exportCloudTemplatesToFlashDrive = useCallback(async (
    cloudTemplateIds: string[],
    onStatus?: (msg: string) => void,
  ): Promise<{
    data: Uint8Array;
    exportedTemplates: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; inv_number: string | null }>;
    costItemCount: number;
  } | null> => {
    if (!sqlRef.current) return null;

    try {
      const localTemplates = db ? getTemplates() : [];
      // Map cloud_id → local template
      const localByCloudId = new Map(localTemplates.filter(t => t.cloud_id).map(t => [t.cloud_id!, t]));

      const exportDb = new sqlRef.current.Database();
      exportDb.run(`
        CREATE TABLE templates (
          id TEXT PRIMARY KEY, cloud_id TEXT, user_id TEXT NOT NULL, name TEXT NOT NULL,
          inv_date TEXT, facility_name TEXT, inv_number TEXT, cost_file_name TEXT,
          job_ticket_file_name TEXT, status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_dirty INTEGER DEFAULT 0
        );
        CREATE TABLE sections (
          id TEXT PRIMARY KEY, template_id TEXT NOT NULL, sect TEXT NOT NULL,
          description TEXT, full_section TEXT, cost_sheet TEXT
        );
        CREATE TABLE cost_items (
          id TEXT PRIMARY KEY, template_id TEXT NOT NULL, ndc TEXT,
          material_description TEXT, unit_price REAL, source TEXT, material TEXT, sheet_name TEXT
        );
      `);

      let costItemCount = 0;
      const exportedTemplates: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; inv_number: string | null }> = [];

      for (let i = 0; i < cloudTemplateIds.length; i++) {
        const cloudId = cloudTemplateIds[i];
        const local = localByCloudId.get(cloudId);

        if (local && db) {
          // Use local data
          onStatus?.(`Exporting ${local.name} (from device)...`);
          exportDb.run(
            `INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [local.id, local.cloud_id, local.user_id, local.name, local.inv_date,
             local.facility_name, local.inv_number, local.cost_file_name,
             local.job_ticket_file_name, local.status, local.created_at, local.updated_at, 0]
          );

          const sectResult = db.exec(`SELECT id, template_id, sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [local.id]);
          if (sectResult.length > 0) {
            for (const row of sectResult[0].values) {
              exportDb.run(`INSERT INTO sections VALUES (?,?,?,?,?,?)`, row as any[]);
            }
          }

          const costResult = db.exec(`SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name FROM cost_items WHERE template_id = ?`, [local.id]);
          if (costResult.length > 0) {
            for (const row of costResult[0].values) {
              exportDb.run(`INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?)`, row as any[]);
              costItemCount++;
            }
          }

          exportedTemplates.push({ id: local.id, name: local.name, inv_date: local.inv_date, facility_name: local.facility_name, inv_number: local.inv_number });
        } else {
          // Fetch from cloud
          onStatus?.(`Downloading template ${i + 1}/${cloudTemplateIds.length} from cloud...`);

          const { data: tData } = await supabase
            .from('data_templates')
            .select('*')
            .eq('id', cloudId)
            .single();

          if (!tData) continue;

          const exportId = generateId();
          exportDb.run(
            `INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [exportId, tData.id, tData.user_id, tData.name, tData.inv_date,
             tData.facility_name, tData.inv_number, tData.cost_file_name,
             tData.job_ticket_file_name, tData.status ?? 'active',
             tData.created_at, tData.updated_at, 0]
          );

          // Fetch sections
          const { data: sections } = await supabase
            .from('template_sections')
            .select('*')
            .eq('template_id', cloudId);

          for (const s of sections ?? []) {
            exportDb.run(
              `INSERT INTO sections VALUES (?,?,?,?,?,?)`,
              [generateId(), exportId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]
            );
          }

          // Fetch cost items in parallel pages
          const PAGE_SIZE = 1000;
          const { count: totalCount } = await supabase
            .from('template_cost_items')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', cloudId);

          const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);
          const pages = Array.from({ length: Math.max(totalPages, 1) }, (_, p) => p);

          const pageResults = await Promise.all(
            pages.map(p =>
              supabase
                .from('template_cost_items')
                .select('*')
                .eq('template_id', cloudId)
                .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
            )
          );

          for (const { data: items } of pageResults) {
            for (const c of items ?? []) {
              exportDb.run(
                `INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?)`,
                [generateId(), exportId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null]
              );
              costItemCount++;
            }
          }

          exportedTemplates.push({ id: exportId, name: tData.name, inv_date: tData.inv_date, facility_name: tData.facility_name, inv_number: tData.inv_number });
        }
      }

      const dbData = exportDb.export();
      exportDb.close();

      return { data: new Uint8Array(dbData), exportedTemplates, costItemCount };
    } catch (err) {
      console.error('Export cloud templates to flash drive error:', err);
      return null;
    }
  }, [db, getTemplates]);

  // Preview import from flash drive file
  const previewFlashDriveImport = useCallback(async (
    file: File
  ): Promise<{ 
    success: boolean; 
    error?: string; 
    templates?: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; costItemCount?: number }>;
  }> => {
    if (!sqlRef.current) return { success: false, error: 'SQL.js not initialized' };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
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
        
        return {
          id: String(templateId),
          cloud_id: row[1] as string | null,
          name: row[2] as string,
          inv_date: row[3] as string | null,
          facility_name: row[4] as string | null,
          costItemCount,
        };
      });
      
      tempDb.close();
      
      return { success: true, templates };
    } catch (err: any) {
      console.error('Preview flash drive import error:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Import selected templates from flash drive file into offline database
  const importFromFlashDrive = useCallback(async (
    file: File,
    selectedIds: string[],
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string; imported: number }> => {
    if (!sqlRef.current || !db) return { success: false, error: 'Database not initialized', imported: 0 };
    
    // Use cached user ID for offline mode fallback
    const userId = user?.id || localStorage.getItem('cached_user_id') || 'offline_user';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const sourceDb = new sqlRef.current.Database(data);
      
      let imported = 0;
      const total = selectedIds.length;
      
      for (let i = 0; i < selectedIds.length; i++) {
        const sourceId = selectedIds[i];
        onProgress?.(Math.round(((i + 0.5) / total) * 100));
        
        // Get template from source
        const templateResult = sourceDb.exec(`
          SELECT cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name
          FROM templates WHERE id = ?
        `, [sourceId]);
        
        if (templateResult.length === 0 || templateResult[0].values.length === 0) continue;
        
        const tRow = templateResult[0].values[0];
        const templateName = tRow[1] as string;
        const cloudId = tRow[0] as string | null;
        
        // Check if already exists by name
        const existing = db.exec(`SELECT id FROM templates WHERE name = ?`, [templateName]);
        if (existing.length > 0 && existing[0].values.length > 0) {
          // Skip duplicates
          continue;
        }
        
        // Generate new local ID
        const newLocalId = generateId();
        
        // Insert template
        db.run(`
          INSERT INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, inv_number, 
                                 cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0)
        `, [
          newLocalId, 
          cloudId, 
          userId, 
          templateName, 
          tRow[2], 
          tRow[3], 
          tRow[4], 
          tRow[5], 
          tRow[6], 
          new Date().toISOString(), 
          new Date().toISOString()
        ]);
        
        // Copy sections
        const sectionsResult = sourceDb.exec(`
          SELECT sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?
        `, [sourceId]);
        
        if (sectionsResult.length > 0) {
          for (const sRow of sectionsResult[0].values) {
            db.run(`
              INSERT INTO sections (id, template_id, sect, description, full_section, cost_sheet)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [generateId(), newLocalId, sRow[0], sRow[1], sRow[2], sRow[3]]);
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
              INSERT INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [generateId(), newLocalId, cRow[0], cRow[1], cRow[2], cRow[3], cRow[4], cRow[5]]);
          }
        }
        
        imported++;
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }
      
      sourceDb.close();
      await saveDatabase();
      
      return { success: true, imported };
    } catch (err: any) {
      console.error('Import from flash drive error:', err);
      return { success: false, error: err.message, imported: 0 };
    }
  }, [db, user, saveDatabase]);

  // Offline section management: Add a new section locally
  const addSection = useCallback(async (
    templateId: string,
    sect: string,
    description: string | null,
    fullSection: string | null,
    costSheet: string | null
  ): Promise<{ success: boolean; error?: string; id?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      const id = generateId();
      db.run(`
        INSERT INTO sections (id, template_id, sect, description, full_section, cost_sheet)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, templateId, sect, description, fullSection, costSheet]);
      await saveDatabase();
      return { success: true, id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  // Offline section management: Update an existing section
  const updateSection = useCallback(async (
    sectionId: string,
    updates: { description?: string; full_section?: string; cost_sheet?: string | null }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      const setClauses: string[] = [];
      const params: any[] = [];
      if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
      if (updates.full_section !== undefined) { setClauses.push('full_section = ?'); params.push(updates.full_section); }
      if (updates.cost_sheet !== undefined) { setClauses.push('cost_sheet = ?'); params.push(updates.cost_sheet); }
      if (setClauses.length === 0) return { success: true };
      params.push(sectionId);
      db.run(`UPDATE sections SET ${setClauses.join(', ')} WHERE id = ?`, params);
      await saveDatabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  // Offline section management: Delete a section
  const deleteSection = useCallback(async (
    sectionId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      db.run(`DELETE FROM sections WHERE id = ?`, [sectionId]);
      await saveDatabase();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, saveDatabase]);

  return {
    templates: db ? getTemplates() : [],
    isLoading,
    isSyncing,
    syncMeta,
    syncProgress,
    error,
    isReady: !isLoading && !!db,
    hasLocalData: hasLocalData(),
    pendingChanges: getPendingChangesCount(),
    syncedTemplateIds: getSyncedTemplateIds(),
    
    // Local operations
    updateTemplateStatus,
    getSections,
    getCostItemByNDC,
    getAllCostItems,
    deleteLocalTemplate,
    getTemplateCostItemCount,
    
    // Offline section management
    addSection,
    updateSection,
    deleteSection,
    
    // Sync operations
    syncWithCloud,
    pullFromCloud,
    pushToCloud,
    syncSelectedTemplates,
    
    // Flash drive operations
    exportToFlashDrive,
    exportCloudTemplatesToFlashDrive,
    previewFlashDriveImport,
    importFromFlashDrive,
  };
}
