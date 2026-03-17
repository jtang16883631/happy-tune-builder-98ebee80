import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import initSqlJs, { Database } from 'sql.js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { gzipDecompress, isGzipped } from '@/lib/compression';
import { initSqlWithCache } from '@/lib/wasmLoader';

const DB_NAME = 'offline_templates_db';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'templates_db';
const SYNC_META_KEY = 'sync_meta';
const ELECTRON_DB_FILE = 'offline_templates.db';

// ─── Electron file system helpers ─────────────────────────────────
const _isElectron = (): boolean => !!(window as any).electronAPI?.offlineSaveDb;

const _electronSave = async (data: Uint8Array): Promise<boolean> => {
  if (!_isElectron()) return false;
  try {
    // Convert Uint8Array to base64 for IPC transfer
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const result = await (window as any).electronAPI.offlineSaveDb(ELECTRON_DB_FILE, base64);
    if (result.success) {
      console.log(`[OfflineFS] Saved to local file: ${(result.size / 1024).toFixed(0)} KB`);
      return true;
    }
    console.error('[OfflineFS] Save failed:', result.error);
    return false;
  } catch (err) {
    console.error('[OfflineFS] Save error:', err);
    return false;
  }
};

const _electronLoad = async (): Promise<Uint8Array | null> => {
  if (!_isElectron()) return null;
  try {
    const result = await (window as any).electronAPI.offlineLoadDb(ELECTRON_DB_FILE);
    if (!result.success || !result.data) return null;
    // Convert base64 back to Uint8Array
    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    console.log(`[OfflineFS] Loaded from local file: ${(bytes.byteLength / 1024).toFixed(0)} KB`);
    return bytes;
  } catch (err) {
    console.error('[OfflineFS] Load error:', err);
    return null;
  }
};

export type TemplateStatus = 'active' | 'working' | 'completed';

export interface OfflineTemplate {
  id: string;
  cloud_id: string | null;
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
  is_dirty: boolean;
}

export interface OfflineSection {
  id: string;
  template_id: string;
  sect: string;
  description: string | null;
  full_section: string | null;
  cost_sheet?: string | null;
}

export interface OfflineCostItem {
  id: string;
  template_id: string;
  ndc: string | null;
  material_description: string | null;
  unit_price: number | null;
  source: string | null;
  material: string | null;
  sheet_name?: string | null;
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

// ─── IndexedDB helpers ────────────────────────────────────────────
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
    store.put(data, key);
    // CRITICAL: resolve on transaction.oncomplete, NOT request.onsuccess
    // This ensures the data is fully committed to disk before we proceed.
    // Resolving on onsuccess could lose data if the app closes before commit.
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(new Error('IndexedDB transaction aborted')); };
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

const ensureOfflineSchema = async (database: Database, persist = false): Promise<void> => {
  database.run(SCHEMA_SQL);

  try {
    const costItemsInfo = database.exec(`PRAGMA table_info(cost_items)`);
    const existingColumns = new Set((costItemsInfo[0]?.values ?? []).map((row: any[]) => String(row[1])));
    const missingColumns = [
      'billing_date TEXT',
      'manufacturer TEXT',
      'generic TEXT',
      'strength TEXT',
      'size TEXT',
      'dose TEXT',
    ].filter(def => !existingColumns.has(def.split(' ')[0]));

    for (const columnDef of missingColumns) {
      database.run(`ALTER TABLE cost_items ADD COLUMN ${columnDef}`);
    }

    const templateInfo = database.exec(`PRAGMA table_info(templates)`);
    const templateColumns = new Set((templateInfo[0]?.values ?? []).map((row: any[]) => String(row[1])));
    if (!templateColumns.has('address')) {
      database.run(`ALTER TABLE templates ADD COLUMN address TEXT`);
    }

    if (persist && (missingColumns.length > 0 || !templateColumns.has('address'))) {
      await _saveDatabase(database);
      console.log('[OfflineDB] Schema repaired for existing local database');
    }
  } catch (schemaErr) {
    console.error('[OfflineDB] Schema repair failed:', schemaErr);
    throw schemaErr;
  }
};

// ─── Module-level singleton ───────────────────────────────────────
// All hook instances share a single SQLite database to prevent race
// conditions where multiple instances overwrite each other's data.

let _db: Database | null = null;
let _sqlRef: any = null;
let _initPromise: Promise<Database | null> | null = null;
let _isInitialised = false;
let _version = 0; // bumped on every mutation so React re-renders

const _listeners = new Set<() => void>();
function _notify() {
  _version++;
  _listeners.forEach(fn => fn());
}
function _subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
function _getSnapshot() { return _version; }

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY, cloud_id TEXT, user_id TEXT, name TEXT NOT NULL,
    inv_date TEXT, facility_name TEXT, address TEXT, inv_number TEXT, cost_file_name TEXT,
    job_ticket_file_name TEXT, status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_dirty INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY, template_id TEXT NOT NULL, sect TEXT NOT NULL,
    description TEXT, full_section TEXT, cost_sheet TEXT,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cost_items (
    id TEXT PRIMARY KEY, template_id TEXT NOT NULL, ndc TEXT,
    material_description TEXT, unit_price REAL, source TEXT, material TEXT, sheet_name TEXT,
    billing_date TEXT, manufacturer TEXT, generic TEXT, strength TEXT, size TEXT, dose TEXT,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_templates_date ON templates(inv_date DESC);
  CREATE INDEX IF NOT EXISTS idx_templates_cloud ON templates(cloud_id);
  CREATE INDEX IF NOT EXISTS idx_sections_template ON sections(template_id);
  CREATE INDEX IF NOT EXISTS idx_cost_template ON cost_items(template_id);
  CREATE INDEX IF NOT EXISTS idx_cost_ndc ON cost_items(ndc);
  CREATE INDEX IF NOT EXISTS idx_cost_sheet ON cost_items(sheet_name);
`;

async function _doInit(): Promise<Database | null> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      console.log('[OfflineDB] Singleton init starting…');
      const isElectron = _isElectron();
      console.log(`[OfflineDB] Storage backend: ${isElectron ? 'Electron local file' : 'IndexedDB'}`);
      const SQL = await initSqlWithCache('OfflineDB');
      _sqlRef = SQL;

      // Try Electron file system first, then fall back to IndexedDB
      let savedDb: Uint8Array | null = null;
      if (isElectron) {
        savedDb = await _electronLoad();
        if (savedDb) {
          console.log(`[OfflineDB] Local file data: ${(savedDb.byteLength / 1024).toFixed(0)} KB`);
        } else {
          // Migration: try loading from IndexedDB and save to local file
          const idbData = await loadFromIndexedDB<Uint8Array>(DB_KEY);
          if (idbData) {
            console.log(`[OfflineDB] Migrating ${(idbData.byteLength / 1024).toFixed(0)} KB from IndexedDB to local file…`);
            savedDb = idbData;
            await _electronSave(idbData);
          }
        }
      } else {
        savedDb = await loadFromIndexedDB<Uint8Array>(DB_KEY);
        console.log(`[OfflineDB] IndexedDB data: ${savedDb ? `${(savedDb.byteLength / 1024).toFixed(0)} KB` : 'null'}`);
      }

      if (savedDb) {
        _db = new SQL.Database(savedDb);
        await ensureOfflineSchema(_db, true);

        try {
          const tc = _db.exec('SELECT COUNT(*) FROM templates');
          const cc = _db.exec('SELECT COUNT(*) FROM cost_items');
          const templateCount = tc[0]?.values[0][0] as number;
          const costCount = cc[0]?.values[0][0] as number;
          const cloudCount = _db.exec('SELECT COUNT(*) FROM templates WHERE cloud_id IS NOT NULL');
          const localCount = _db.exec('SELECT COUNT(*) FROM templates WHERE cloud_id IS NULL');
          console.log(`[OfflineDB] Restored: ${templateCount} templates (${cloudCount[0]?.values[0][0]} cloud-synced, ${localCount[0]?.values[0][0]} local-only), ${costCount} cost_items`);
          
          try {
            const names = _db.exec('SELECT name, cloud_id FROM templates LIMIT 10');
            if (names.length > 0) {
              const list = names[0].values.map((r: any[]) => `${r[0]}${r[1] ? ' [cloud]' : ' [local]'}`).join(', ');
              console.log(`[OfflineDB] Templates: ${list}`);
            }
          } catch {}
          
          try {
            const manifest = localStorage.getItem('offline_manifest');
            if (manifest) {
              const parsed = JSON.parse(manifest);
              if (parsed.templateCount && templateCount < parsed.templateCount) {
                console.warn(`[OfflineDB] Template count mismatch! Expected ${parsed.templateCount}, got ${templateCount}. Data may have been lost.`);
              }
            }
          } catch {}
        } catch {}
      } else {
        _db = new SQL.Database();
        await ensureOfflineSchema(_db);
        console.log('[OfflineDB] Created fresh database (not persisted until data is added)');
        
        try {
          const manifest = localStorage.getItem('offline_manifest');
          if (manifest) {
            const parsed = JSON.parse(manifest);
            if (parsed.offlineReady && parsed.templateCount > 0) {
              console.error(`[OfflineDB] CRITICAL: Manifest says ${parsed.templateCount} templates should exist, but storage returned empty! Data may have been lost.`);
            }
          }
        } catch {}
      }

      _isInitialised = true;
      _notify();
      return _db;
    } catch (err: any) {
      console.error('[OfflineDB] Init failed:', err);
      return null;
    }
  })();

  return _initPromise;
}

async function _saveDatabase(database?: Database) {
  const targetDb = database || _db;
  if (!targetDb) return;
  const dbData = targetDb.export();
  const bytes = new Uint8Array(dbData);
  const sizeKB = (bytes.byteLength / 1024).toFixed(0);

  // Use Electron file system if available, otherwise IndexedDB
  if (_isElectron()) {
    console.log(`[OfflineDB] Saving ${sizeKB} KB to local file…`);
    const saved = await _electronSave(bytes);
    if (!saved) {
      console.error('[OfflineDB] SAVE TO LOCAL FILE FAILED! Falling back to IndexedDB…');
      await saveToIndexedDB(DB_KEY, bytes);
    }
  } else {
    console.log(`[OfflineDB] Saving ${sizeKB} KB to IndexedDB…`);
    await saveToIndexedDB(DB_KEY, bytes);
    try {
      const readBack = await loadFromIndexedDB<Uint8Array>(DB_KEY);
      if (!readBack || readBack.byteLength !== bytes.byteLength) {
        console.error(`[OfflineDB] SAVE VERIFICATION FAILED! Wrote ${bytes.byteLength} but read back ${readBack?.byteLength ?? 0}`);
      } else {
        console.log(`[OfflineDB] Save verified: ${(readBack.byteLength / 1024).toFixed(0)} KB confirmed in IndexedDB`);
      }
    } catch (verifyErr) {
      console.error('[OfflineDB] Save verification error:', verifyErr);
    }
  }
}

async function _ensureDb(): Promise<Database | null> {
  if (_db) return _db;
  if (_initPromise) {
    const result = await _initPromise;
    if (result) return result;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[OfflineDB] Retry attempt ${attempt}/3…`);
    await new Promise(r => setTimeout(r, 500 * attempt));
    _initPromise = null; // allow re-init
    const result = await _doInit();
    if (result) return result;
  }
  console.error('[OfflineDB] All init attempts failed');
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useOfflineTemplates(isOnline: boolean = navigator.onLine) {
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({ lastSyncedAt: null, pendingChanges: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!_isInitialised);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    currentTemplate: null, currentTemplateIndex: 0, totalTemplates: 0,
    costItemsFetched: 0, status: 'idle',
  });

  // Subscribe to singleton mutations so all hook consumers re-render together
  useSyncExternalStore(_subscribe, _getSnapshot);

  // Trigger singleton init on first mount (idempotent)
  useEffect(() => {
    if (_isInitialised) {
      setIsLoading(false);
      // Load sync meta
      loadFromIndexedDB<SyncMeta>(SYNC_META_KEY).then(m => { if (m) setSyncMeta(m); });
      return;
    }
    let cancelled = false;
    _doInit().then(() => {
      if (!cancelled) {
        setIsLoading(false);
        setError(_db ? null : 'Failed to initialise database');
        loadFromIndexedDB<SyncMeta>(SYNC_META_KEY).then(m => { if (m) setSyncMeta(m); });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const db = _db;

  const updateSyncMeta = useCallback(async (meta: Partial<SyncMeta>) => {
    const newMeta = { ...syncMeta, ...meta };
    setSyncMeta(newMeta);
    await saveToIndexedDB(SYNC_META_KEY, newMeta);
  }, [syncMeta]);

  // ── Read helpers ──────────────────────────────────────────────

  const getTemplates = useCallback((): OfflineTemplate[] => {
    if (!db) return [];
    try {
      const results = db.exec(`
        SELECT id, cloud_id, user_id, name, inv_date, facility_name, address, inv_number,
               cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty
        FROM templates ORDER BY inv_date DESC, name
      `);
      if (results.length === 0) return [];
      return results[0].values.map((row: any[]) => ({
        id: row[0] as string, cloud_id: row[1] as string | null, user_id: row[2] as string,
        name: row[3] as string, inv_date: row[4] as string | null,
        facility_name: row[5] as string | null, address: row[6] as string | null,
        inv_number: row[7] as string | null,
        cost_file_name: row[8] as string | null, job_ticket_file_name: row[9] as string | null,
        status: row[10] as TemplateStatus | null, created_at: row[11] as string,
        updated_at: row[12] as string, is_dirty: Boolean(row[13]),
      }));
    } catch (err) { console.error('[OfflineDB] getTemplates error:', err); return []; }
  }, [db]);

  const getPendingChangesCount = useCallback((): number => {
    if (!db) return 0;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM templates WHERE is_dirty = 1`);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch { return 0; }
  }, [db]);

  const getSyncedTemplateIds = useCallback((): string[] => {
    if (!db) return [];
    try {
      const result = db.exec(`SELECT cloud_id FROM templates WHERE cloud_id IS NOT NULL`);
      if (result.length === 0) return [];
      return result[0].values.map(row => row[0] as string);
    } catch { return []; }
  }, [db]);

  const updateTemplateStatus = useCallback(async (templateId: string, status: TemplateStatus) => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      db.run(`UPDATE templates SET status = ?, is_dirty = 1, updated_at = ? WHERE id = ?`,
        [status, new Date().toISOString(), templateId]);
      await _saveDatabase();
      _notify();
      await updateSyncMeta({ pendingChanges: getPendingChangesCount() });
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }, [db, updateSyncMeta, getPendingChangesCount]);

  const getSections = useCallback(async (templateId: string): Promise<OfflineSection[]> => {
    if (!db) return [];
    try {
      const results = db.exec(`
        SELECT id, template_id, sect, description, full_section, cost_sheet
        FROM sections WHERE template_id = ? ORDER BY sect
      `, [templateId]);
      if (results.length === 0) return [];
      return results[0].values.map((row: any[]) => ({
        id: row[0] as string, template_id: row[1] as string, sect: row[2] as string,
        description: row[3] as string | null, full_section: row[4] as string | null,
        cost_sheet: (row[5] as string | null) ?? null,
      }));
    } catch (err) { console.error('Get sections error:', err); return []; }
  }, [db]);

  const getCostItemByNDC = useCallback(
    async (templateId: string, ndc: string, sheetName?: string | null): Promise<OfflineCostItem | null> => {
      if (!db) return null;
      try {
        const cleanNdc = ndc.replace(/\D/g, '');
        let query: string;
        let params: (string | null)[];
        if (sheetName) {
          query = `SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name
                   FROM cost_items WHERE template_id = ? AND (ndc = ? OR ndc = ?) AND sheet_name = ? LIMIT 1`;
          params = [templateId, cleanNdc, ndc, sheetName];
        } else {
          query = `SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name
                   FROM cost_items WHERE template_id = ? AND (ndc = ? OR ndc = ?) LIMIT 1`;
          params = [templateId, cleanNdc, ndc];
        }
        const results = db.exec(query, params);
        if (results.length === 0 || results[0].values.length === 0) return null;
        const row = results[0].values[0];
        return {
          id: row[0] as string, template_id: row[1] as string, ndc: row[2] as string | null,
          material_description: row[3] as string | null, unit_price: row[4] as number | null,
          source: row[5] as string | null, material: row[6] as string | null,
          sheet_name: row[7] as string | null,
        };
      } catch (err) { console.error('Get cost item error:', err); return null; }
    }, [db]);

  const getAllCostItems = useCallback(
    async (templateId: string): Promise<Array<{
      ndc: string | null; material_description: string | null; unit_price: number | null;
      source: string | null; material: string | null; sheet_name: string | null;
    }>> => {
      if (!db) return [];
      try {
        const results = db.exec(`
          SELECT ndc, material_description, unit_price, source, material, sheet_name
          FROM cost_items WHERE template_id = ?
        `, [templateId]);
        if (results.length === 0) return [];
        return results[0].values.map((row: any[]) => ({
          ndc: row[0] as string | null, material_description: row[1] as string | null,
          unit_price: row[2] as number | null, source: row[3] as string | null,
          material: row[4] as string | null, sheet_name: row[5] as string | null,
        }));
      } catch (err) { console.error('Get all cost items error:', err); return []; }
    }, [db]);

  // ── Sync: download selected templates from cloud ──────────────

  const syncSelectedTemplates = useCallback(async (templateIds: string[]): Promise<{
    success: boolean; synced: number; error?: string;
  }> => {
    const activeDb = db || await _ensureDb();
    if (activeDb) {
      await ensureOfflineSchema(activeDb, true);
    }
    if (!activeDb || !user || !isOnline) {
      const reason = !activeDb ? 'Local database not ready — please reload' : !user ? 'Not authenticated' : 'No internet connection';
      return { success: false, synced: 0, error: reason };
    }

    setIsSyncing(true);
    setSyncProgress({ currentTemplate: null, currentTemplateIndex: 0, totalTemplates: templateIds.length, costItemsFetched: 0, status: 'idle' });

    try {
      const currentlySynced = getSyncedTemplateIds();
      const toAdd = templateIds.filter(id => !currentlySynced.includes(id));
      const alreadySyncedCount = templateIds.length - toAdd.length;
      let synced = 0;
      const failedTemplates: Array<{ id: string; reason: string }> = [];

      for (let i = 0; i < toAdd.length; i++) {
        const cloudId = toAdd[i];
        setSyncProgress(prev => ({ ...prev, currentTemplateIndex: i + 1, status: 'fetching_template', costItemsFetched: 0 }));

        try {
          const [templateResult, countResult] = await Promise.all([
            supabase.from('data_templates')
              .select('id, user_id, name, inv_date, facility_name, address, inv_number, cost_file_name, job_ticket_file_name, status, created_at, updated_at')
              .eq('id', cloudId).single(),
            supabase.from('template_cost_items')
              .select('id', { count: 'exact', head: true })
              .eq('template_id', cloudId),
          ]);

          const { data: ct, error: fetchError } = templateResult;
          if (fetchError || !ct) {
            const reason = fetchError?.message || 'Template not found in cloud';
            failedTemplates.push({ id: cloudId, reason });
            console.error(`[OfflineDB] Failed to fetch template ${cloudId}:`, reason);
            continue;
          }

          setSyncProgress(prev => ({ ...prev, currentTemplate: ct.name || ct.facility_name || 'Template' }));

          const localId = ct.id;
          activeDb.run('BEGIN TRANSACTION');
          try {
            activeDb.run(`
              INSERT OR REPLACE INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, address, inv_number,
                                     cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [localId, ct.id, ct.user_id, ct.name, ct.inv_date, ct.facility_name, ct.address, ct.inv_number,
                ct.cost_file_name, ct.job_ticket_file_name, ct.status || 'active', ct.created_at, ct.updated_at]);

            setSyncProgress(prev => ({ ...prev, status: 'fetching_sections' }));
            const { data: sections, error: sectionsError } = await supabase.from('template_sections')
              .select('id, template_id, sect, description, full_section, cost_sheet')
              .eq('template_id', ct.id);

            if (sectionsError) throw sectionsError;

            for (const s of sections || []) {
              activeDb.run(`INSERT OR REPLACE INTO sections (id, template_id, sect, description, full_section, cost_sheet) VALUES (?, ?, ?, ?, ?, ?)`,
                [s.id, localId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]);
            }

            setSyncProgress(prev => ({ ...prev, status: 'fetching_cost_items', costItemsFetched: 0 }));
            const BATCH_SIZE = 1000;
            const CONCURRENCY = 6;
            const MAX_RETRIES = 3;
            const totalExpected = countResult.count ?? 0;
            let totalCostItemsFetched = 0;

            const costStmt = activeDb.prepare(`
              INSERT OR REPLACE INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Helper to fetch a single range with retry
            const fetchRangeWithRetry = async (from: number, to: number, attempt = 0): Promise<{ from: number; data: any[] | null; error: any }> => {
              const res = await supabase
                .from('template_cost_items')
                .select('id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose')
                .eq('template_id', ct.id)
                .order('id', { ascending: true })
                .range(from, to);
              if (res.error && attempt < MAX_RETRIES) {
                const isRetryable = res.error.code === '57014' || res.error.message?.includes('timeout') || res.error.message?.includes('connection');
                if (isRetryable) {
                  console.log(`[OfflineDB] Retry ${attempt + 1} for range ${from}-${to} (${res.error.code})`);
                  await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                  return fetchRangeWithRetry(from, to, attempt + 1);
                }
              }
              return { from, data: res.data, error: res.error };
            };

            // Use parallel .range() fetching with retry
            let offset = 0;
            while (true) {
              const rangePromises: Array<ReturnType<typeof fetchRangeWithRetry>> = [];
              for (let p = 0; p < CONCURRENCY; p++) {
                const from = offset + p * BATCH_SIZE;
                const to = from + BATCH_SIZE - 1;
                if (totalExpected > 0 && from >= totalExpected) break;
                rangePromises.push(fetchRangeWithRetry(from, to));
              }

              if (rangePromises.length === 0) break;

              const results = await Promise.all(rangePromises);

              // Sort results by their starting offset so we process in order
              results.sort((a, b) => a.from - b.from);

              let batchTotal = 0;
              let highestFullBatchFrom = -1;
              for (const res of results) {
                if (res.error) throw res.error;
                if (!res.data || res.data.length === 0) continue;
                for (const c of res.data) {
                  costStmt.run([c.id, localId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null, c.billing_date ?? null, c.manufacturer ?? null, c.generic ?? null, c.strength ?? null, c.size ?? null, c.dose ?? null]);
                }
                batchTotal += res.data.length;
                if (res.data.length === BATCH_SIZE) {
                  highestFullBatchFrom = res.from;
                }
              }

              totalCostItemsFetched += batchTotal;
              offset += CONCURRENCY * BATCH_SIZE;
              setSyncProgress(prev => ({ ...prev, costItemsFetched: totalCostItemsFetched }));

              // Stop only when NO batch in this cycle returned a full page
              if (batchTotal === 0 || highestFullBatchFrom < 0) break;
            }
            costStmt.free();
            console.log(`[OfflineDB] Fetched ${totalCostItemsFetched} cost items for ${ct.name} (expected ${totalExpected})`);
            activeDb.run('COMMIT');
          } catch (txErr) {
            activeDb.run('ROLLBACK');
            throw txErr;
          }

          setSyncProgress(prev => ({ ...prev, status: 'saving' }));
          synced++;
        } catch (templateErr: any) {
          const reason = templateErr?.message || 'Unknown sync error';
          failedTemplates.push({ id: cloudId, reason });
          console.error(`[OfflineDB] Failed to sync template ${cloudId}:`, templateErr);
        }
      }

      if (synced > 0) {
        // Persist to IndexedDB
        try {
          const vc = activeDb.exec('SELECT COUNT(*) FROM templates');
          const vcc = activeDb.exec('SELECT COUNT(*) FROM cost_items');
          console.log(`[OfflineDB] Pre-save: ${vc[0]?.values[0][0]} templates, ${vcc[0]?.values[0][0]} cost_items`);
        } catch {}

        await _saveDatabase(activeDb);

        try {
          const savedCheck = await loadFromIndexedDB<Uint8Array>(DB_KEY);
          console.log(`[OfflineDB] Post-save IndexedDB: ${savedCheck ? `${(savedCheck.byteLength / 1024).toFixed(0)} KB` : 'FAILED'}`);
        } catch {}

        await updateSyncMeta({ lastSyncedAt: new Date().toISOString() });
        _notify(); // notify all subscribers

        // Save offline manifest to localStorage for cold start verification
        try {
          const allTemplates = activeDb.exec('SELECT id, name FROM templates');
          if (allTemplates.length > 0) {
            const manifest = {
              templateCount: allTemplates[0].values.length,
              templateIds: allTemplates[0].values.map(r => r[0]),
              lastTemplateId: toAdd[toAdd.length - 1] ?? templateIds[templateIds.length - 1] ?? null,
              lastSyncedAt: new Date().toISOString(),
              offlineReady: true,
            };
            localStorage.setItem('offline_manifest', JSON.stringify(manifest));
            console.log(`[OfflineDB] Offline manifest saved: ${manifest.templateCount} templates`);
          }
        } catch (manifestErr) {
          console.warn('[OfflineDB] Failed to save offline manifest:', manifestErr);
        }
      }

      setSyncProgress(prev => ({ ...prev, status: 'complete', currentTemplate: null }));

      const totalSynced = synced + alreadySyncedCount;
      if (totalSynced === 0 && failedTemplates.length > 0) {
        return {
          success: false,
          synced: 0,
          error: `Failed to sync ${failedTemplates.length} template(s). First error: ${failedTemplates[0].reason}`,
        };
      }

      if (failedTemplates.length > 0) {
        return {
          success: true,
          synced: totalSynced,
          error: `${failedTemplates.length} template(s) failed to sync. Check console logs for details.`,
        };
      }

      return { success: true, synced: totalSynced };
    } catch (err: any) {
      console.error('Sync selected templates error:', err);
      return { success: false, synced: 0, error: err.message };
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress({ currentTemplate: null, currentTemplateIndex: 0, totalTemplates: 0, costItemsFetched: 0, status: 'idle' });
      }, 2000);
    }
  }, [db, user, isOnline, getSyncedTemplateIds, updateSyncMeta]);

  // ── Pull all from cloud ───────────────────────────────────────

  const pullFromCloud = useCallback(async (): Promise<{ success: boolean; pulled: number; error?: string }> => {
    if (db) {
      await ensureOfflineSchema(db, true);
    }
    if (!db || !user || !isOnline) {
      const reason = !db ? 'Local database not ready' : !user ? 'Not authenticated' : 'No internet connection';
      return { success: false, pulled: 0, error: reason };
    }
    try {
      const { data: cloudTemplates, error: fetchError } = await supabase
        .from('data_templates')
        .select('id, user_id, name, inv_date, facility_name, address, inv_number, cost_file_name, job_ticket_file_name, status, created_at, updated_at')
        .order('inv_date', { ascending: false });
      if (fetchError) throw fetchError;

      let pulled = 0;
      for (const ct of cloudTemplates || []) {
        const existing = db.exec(`SELECT id FROM templates WHERE cloud_id = ?`, [ct.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
          const localId = ct.id;
          db.run('BEGIN TRANSACTION');
          try {
            db.run(`INSERT OR REPLACE INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, address, inv_number,
                     cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [localId, ct.id, ct.user_id, ct.name, ct.inv_date, ct.facility_name, ct.address, ct.inv_number,
               ct.cost_file_name, ct.job_ticket_file_name, ct.status || 'active', ct.created_at, ct.updated_at]);

            const [sectionsResult, countResult] = await Promise.all([
              supabase.from('template_sections').select('id, template_id, sect, description, full_section, cost_sheet').eq('template_id', ct.id),
              supabase.from('template_cost_items').select('id', { count: 'exact', head: true }).eq('template_id', ct.id),
            ]);
            for (const s of sectionsResult.data || []) {
              db.run(`INSERT OR REPLACE INTO sections (id, template_id, sect, description, full_section, cost_sheet) VALUES (?, ?, ?, ?, ?, ?)`,
                [s.id, localId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]);
            }

            const BATCH_SIZE = 2000;
            let lastId = '00000000-0000-0000-0000-000000000000';
            const costStmt = db.prepare(`INSERT OR REPLACE INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            while (true) {
              const { data: costItems, error: costError } = await supabase
                .from('template_cost_items')
                .select('id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose')
                .eq('template_id', ct.id)
                .gt('id', lastId)
                .order('id', { ascending: true })
                .limit(BATCH_SIZE);

              if (costError) throw costError;
              if (!costItems || costItems.length === 0) break;

              for (const c of costItems) {
                costStmt.run([c.id, localId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null, c.billing_date ?? null, c.manufacturer ?? null, c.generic ?? null, c.strength ?? null, c.size ?? null, c.dose ?? null]);
              }

              lastId = costItems[costItems.length - 1].id;
              if (costItems.length < BATCH_SIZE) break;
            }
            costStmt.free();
            db.run('COMMIT');
          } catch (txErr) { db.run('ROLLBACK'); throw txErr; }
          pulled++;
        } else {
          const localId = existing[0].values[0][0] as string;
          const isDirty = db.exec(`SELECT is_dirty FROM templates WHERE id = ?`, [localId]);
          if (isDirty.length > 0 && !isDirty[0].values[0][0]) {
            db.run(`UPDATE templates SET name = ?, inv_date = ?, facility_name = ?, address = ?, inv_number = ?,
                     cost_file_name = ?, job_ticket_file_name = ?, status = ?, updated_at = ? WHERE id = ?`,
              [ct.name, ct.inv_date, ct.facility_name, ct.address, ct.inv_number, ct.cost_file_name, ct.job_ticket_file_name, ct.status, ct.updated_at, localId]);
          }
        }
      }

      await _saveDatabase();
      _notify();
      await updateSyncMeta({ lastSyncedAt: new Date().toISOString() });
      return { success: true, pulled };
    } catch (err: any) {
      console.error('Pull from cloud error:', err);
      return { success: false, pulled: 0, error: err.message };
    }
  }, [db, user, isOnline, updateSyncMeta]);

  // ── Push local changes to cloud ───────────────────────────────

  const pushToCloud = useCallback(async (): Promise<{ success: boolean; pushed: number; error?: string }> => {
    if (!db || !user || !isOnline) {
      const reason = !db ? 'Local database not ready' : !user ? 'Not authenticated' : 'No internet connection';
      return { success: false, pushed: 0, error: reason };
    }
    try {
      const dirtyResult = db.exec(`SELECT * FROM templates WHERE is_dirty = 1`);
      if (dirtyResult.length === 0 || dirtyResult[0].values.length === 0) return { success: true, pushed: 0 };

      let pushed = 0;
      const columns = dirtyResult[0].columns;
      for (const row of dirtyResult[0].values) {
        const template: any = {};
        columns.forEach((col, i) => template[col] = row[i]);

        if (template.cloud_id) {
          const { error: updateError } = await supabase.from('data_templates').update({
            name: template.name, inv_date: template.inv_date, facility_name: template.facility_name,
            status: template.status, updated_at: new Date().toISOString(),
          }).eq('id', template.cloud_id);
          if (updateError) throw updateError;
        } else {
          const { data: newTemplate, error: insertError } = await supabase.from('data_templates').insert({
            user_id: user.id, name: template.name, inv_date: template.inv_date,
            facility_name: template.facility_name, inv_number: template.inv_number,
            cost_file_name: template.cost_file_name, job_ticket_file_name: template.job_ticket_file_name,
            status: template.status,
          }).select().single();
          if (insertError) throw insertError;

          db.run(`UPDATE templates SET cloud_id = ? WHERE id = ?`, [newTemplate.id, template.id]);

          const sectionsResult = db.exec(`SELECT sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [template.id]);
          if (sectionsResult.length > 0) {
            const sectionInserts = sectionsResult[0].values.map((s: any[]) => ({
              template_id: newTemplate.id, sect: s[0], description: s[1], full_section: s[2], cost_sheet: s[3] ?? null,
            }));
            await supabase.from('template_sections').insert(sectionInserts);
          }

          const costResult = db.exec(`SELECT ndc, material_description, unit_price, source, material, sheet_name FROM cost_items WHERE template_id = ?`, [template.id]);
          if (costResult.length > 0) {
            const costInserts = costResult[0].values.map((c: any[]) => ({
              template_id: newTemplate.id, ndc: c[0], material_description: c[1], unit_price: c[2],
              source: c[3], material: c[4], sheet_name: c[5] ?? null,
            }));
            const batchSize = 500;
            for (let i = 0; i < costInserts.length; i += batchSize) {
              await supabase.from('template_cost_items').insert(costInserts.slice(i, i + batchSize));
            }
          }
        }
        db.run(`UPDATE templates SET is_dirty = 0 WHERE id = ?`, [template.id]);
        pushed++;
      }

      await _saveDatabase();
      _notify();
      await updateSyncMeta({ lastSyncedAt: new Date().toISOString(), pendingChanges: 0 });
      return { success: true, pushed };
    } catch (err: any) {
      console.error('Push to cloud error:', err);
      return { success: false, pushed: 0, error: err.message };
    }
  }, [db, user, isOnline, updateSyncMeta]);

  const syncWithCloud = useCallback(async (): Promise<{ success: boolean; pushed: number; pulled: number; error?: string }> => {
    if (!isOnline) return { success: false, pushed: 0, pulled: 0, error: 'No internet connection' };
    setIsSyncing(true);
    try {
      const pushResult = await pushToCloud();
      if (!pushResult.success) return { ...pushResult, pulled: 0 };
      const pullResult = await pullFromCloud();
      return { success: pullResult.success, pushed: pushResult.pushed, pulled: pullResult.pulled, error: pullResult.error };
    } finally { setIsSyncing(false); }
  }, [isOnline, pushToCloud, pullFromCloud]);

  // ── Delete local template ─────────────────────────────────────

  const deleteLocalTemplate = useCallback(async (templateId: string): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      db.run(`DELETE FROM cost_items WHERE template_id = ?`, [templateId]);
      db.run(`DELETE FROM sections WHERE template_id = ?`, [templateId]);
      db.run(`DELETE FROM templates WHERE id = ?`, [templateId]);
      await _saveDatabase();
      _notify();
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }, [db]);

  const getTemplateCostItemCount = useCallback((templateId: string): number => {
    if (!db) return 0;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM cost_items WHERE template_id = ?`, [templateId]);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch { return 0; }
  }, [db]);

  const hasLocalData = useCallback((): boolean => {
    if (!db) return false;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM templates`);
      return result.length > 0 && (result[0].values[0][0] as number) > 0;
    } catch { return false; }
  }, [db]);

  // ── Flash drive: export ───────────────────────────────────────

  const exportToFlashDrive = useCallback((selectedIds?: string[]): {
    data: Uint8Array; templates: OfflineTemplate[]; sectionCount: number; costItemCount: number;
  } | null => {
    if (!db || !_sqlRef) return null;
    try {
      const allTemplates = getTemplates();
      const templatesToExport = selectedIds?.length ? allTemplates.filter(t => selectedIds.includes(t.id)) : allTemplates;
      if (templatesToExport.length === 0) return null;

      const exportDb = new _sqlRef.Database();
      exportDb.run(`
        CREATE TABLE templates (id TEXT PRIMARY KEY, cloud_id TEXT, user_id TEXT, name TEXT NOT NULL,
          inv_date TEXT, facility_name TEXT, address TEXT, inv_number TEXT, cost_file_name TEXT,
          job_ticket_file_name TEXT, status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_dirty INTEGER DEFAULT 0);
        CREATE TABLE sections (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, sect TEXT NOT NULL,
          description TEXT, full_section TEXT, cost_sheet TEXT);
        CREATE TABLE cost_items (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, ndc TEXT,
          material_description TEXT, unit_price REAL, source TEXT, material TEXT, sheet_name TEXT,
          billing_date TEXT, manufacturer TEXT, generic TEXT, strength TEXT, size TEXT, dose TEXT);
      `);

      let sectionCount = 0, costItemCount = 0;
      for (const t of templatesToExport) {
        exportDb.run(`INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [t.id, t.cloud_id, t.user_id, t.name, t.inv_date, t.facility_name, t.address, t.inv_number,
           t.cost_file_name, t.job_ticket_file_name, t.status, t.created_at, t.updated_at, 0]);

        const sectResult = db.exec(`SELECT id, template_id, sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [t.id]);
        if (sectResult.length > 0) { for (const row of sectResult[0].values) { exportDb.run(`INSERT INTO sections VALUES (?,?,?,?,?,?)`, row as any[]); sectionCount++; } }

        const costResult = db.exec(`SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose FROM cost_items WHERE template_id = ?`, [t.id]);
        if (costResult.length > 0) { for (const row of costResult[0].values) { exportDb.run(`INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, row as any[]); costItemCount++; } }
      }

      const dbData = exportDb.export();
      exportDb.close();
      return { data: new Uint8Array(dbData), templates: templatesToExport, sectionCount, costItemCount };
    } catch (err) { console.error('Export to flash drive error:', err); return null; }
  }, [db, getTemplates]);

  // ── Flash drive: export cloud templates ────────────────────────

  const exportCloudTemplatesToFlashDrive = useCallback(async (
    cloudTemplateIds: string[],
    onStatus?: (msg: string) => void,
  ): Promise<{
    data: Uint8Array;
    exportedTemplates: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; inv_number: string | null }>;
    costItemCount: number;
  } | null> => {
    if (!_sqlRef) return null;
    try {
      const localTemplates = db ? getTemplates() : [];
      const localByCloudId = new Map(localTemplates.filter(t => t.cloud_id).map(t => [t.cloud_id!, t]));

      const exportDb = new _sqlRef.Database();
      exportDb.run(`
        CREATE TABLE templates (id TEXT PRIMARY KEY, cloud_id TEXT, user_id TEXT, name TEXT NOT NULL,
          inv_date TEXT, facility_name TEXT, address TEXT, inv_number TEXT, cost_file_name TEXT,
          job_ticket_file_name TEXT, status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_dirty INTEGER DEFAULT 0);
        CREATE TABLE sections (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, sect TEXT NOT NULL,
          description TEXT, full_section TEXT, cost_sheet TEXT);
        CREATE TABLE cost_items (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, ndc TEXT,
          material_description TEXT, unit_price REAL, source TEXT, material TEXT, sheet_name TEXT,
          billing_date TEXT, manufacturer TEXT, generic TEXT, strength TEXT, size TEXT, dose TEXT);
      `);

      let costItemCount = 0;
      const exportedTemplates: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; inv_number: string | null }> = [];

      for (let i = 0; i < cloudTemplateIds.length; i++) {
        const cloudId = cloudTemplateIds[i];
        const local = localByCloudId.get(cloudId);

        if (local && db) {
          onStatus?.(`Exporting ${local.name} (from device)...`);
          exportDb.run(`INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [local.id, local.cloud_id, local.user_id, local.name, local.inv_date, local.facility_name, local.address,
             local.inv_number, local.cost_file_name, local.job_ticket_file_name, local.status, local.created_at, local.updated_at, 0]);

          const sectResult = db.exec(`SELECT id, template_id, sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [local.id]);
          if (sectResult.length > 0) { for (const row of sectResult[0].values) { exportDb.run(`INSERT INTO sections VALUES (?,?,?,?,?,?)`, row as any[]); } }

          const costResult = db.exec(`SELECT id, template_id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose FROM cost_items WHERE template_id = ?`, [local.id]);
          if (costResult.length > 0) { for (const row of costResult[0].values) { exportDb.run(`INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, row as any[]); costItemCount++; } }

          exportedTemplates.push({ id: local.id, name: local.name, inv_date: local.inv_date, facility_name: local.facility_name, inv_number: local.inv_number });
        } else {
          onStatus?.(`Downloading template ${i + 1}/${cloudTemplateIds.length} from cloud...`);
          const { data: tData } = await supabase.from('data_templates').select('*').eq('id', cloudId).single();
          if (!tData) continue;

          const exportId = generateId();
          exportDb.run(`INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [exportId, tData.id, tData.user_id, tData.name, tData.inv_date, tData.facility_name, tData.address,
             tData.inv_number, tData.cost_file_name, tData.job_ticket_file_name, tData.status ?? 'active',
             tData.created_at, tData.updated_at, 0]);

          const { data: sections } = await supabase.from('template_sections').select('*').eq('template_id', cloudId);
          for (const s of sections ?? []) {
            exportDb.run(`INSERT INTO sections VALUES (?,?,?,?,?,?)`,
              [generateId(), exportId, s.sect, s.description, s.full_section, s.cost_sheet ?? null]);
          }

          const BATCH_SIZE = 2000;
          let lastId = '00000000-0000-0000-0000-000000000000';

          while (true) {
            const { data: items, error: itemsError } = await supabase
              .from('template_cost_items')
              .select('*')
              .eq('template_id', cloudId)
              .gt('id', lastId)
              .order('id', { ascending: true })
              .limit(BATCH_SIZE);

            if (itemsError) throw itemsError;
            if (!items || items.length === 0) break;

            for (const c of items) {
              exportDb.run(`INSERT INTO cost_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [generateId(), exportId, c.ndc, c.material_description, c.unit_price, c.source, c.material, c.sheet_name ?? null, c.billing_date ?? null, c.manufacturer ?? null, c.generic ?? null, c.strength ?? null, c.size ?? null, c.dose ?? null]);
              costItemCount++;
            }

            lastId = items[items.length - 1].id;
            if (items.length < BATCH_SIZE) break;
          }
          exportedTemplates.push({ id: exportId, name: tData.name, inv_date: tData.inv_date, facility_name: tData.facility_name, inv_number: tData.inv_number });
        }
      }

      const dbData = exportDb.export();
      exportDb.close();
      return { data: new Uint8Array(dbData), exportedTemplates, costItemCount };
    } catch (err) { console.error('Export cloud templates error:', err); return null; }
  }, [db, getTemplates]);

  // ── Flash drive: preview import ───────────────────────────────

  const previewFlashDriveImport = useCallback(async (
    file: File
  ): Promise<{
    success: boolean; error?: string;
    templates?: Array<{ id: string; name: string; inv_date: string | null; facility_name: string | null; costItemCount?: number }>;
  }> => {
    if (!_sqlRef) {
      await _ensureDb();
      if (!_sqlRef) return { success: false, error: 'SQL.js not initialized' };
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      let data = new Uint8Array(arrayBuffer);
      if (isGzipped(data)) { data = await gzipDecompress(data) as any; }
      const tempDb = new _sqlRef.Database(data as any);

      const templatesResult = tempDb.exec(`SELECT id, cloud_id, name, inv_date, facility_name FROM templates ORDER BY inv_date DESC, name`);
      if (templatesResult.length === 0) { tempDb.close(); return { success: false, error: 'No templates found in file' }; }

      const templates = templatesResult[0].values.map((row: any[]) => {
        const templateId = row[0];
        const costCountResult = tempDb.exec(`SELECT COUNT(*) FROM cost_items WHERE template_id = ?`, [templateId]);
        const costItemCount = costCountResult[0]?.values[0]?.[0] as number || 0;
        return {
          id: String(templateId), cloud_id: row[1] as string | null, name: row[2] as string,
          inv_date: row[3] as string | null, facility_name: row[4] as string | null, costItemCount,
        };
      });

      tempDb.close();
      return { success: true, templates };
    } catch (err: any) {
      console.error('Preview flash drive import error:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // ── Flash drive: import ───────────────────────────────────────

  const importFromFlashDrive = useCallback(async (
    file: File, selectedIds: string[], onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string; imported: number }> => {
    if (!_sqlRef || !db) return { success: false, error: 'Database not initialized', imported: 0 };
    const userId = user?.id || localStorage.getItem('cached_user_id') || 'offline_user';

    try {
      const arrayBuffer = await file.arrayBuffer();
      let data = new Uint8Array(arrayBuffer);
      if (isGzipped(data)) { data = await gzipDecompress(data) as any; }
      const sourceDb = new _sqlRef.Database(data as any);

      let imported = 0;
      let lastImportedLocalId: string | null = null;
      const total = selectedIds.length;

      for (let i = 0; i < selectedIds.length; i++) {
        const sourceId = selectedIds[i];
        onProgress?.(Math.round(((i + 0.5) / total) * 100));

        // Try with address column first, fall back without it for old DBs
        let templateResult;
        let hasAddressCol = true;
        try {
          templateResult = sourceDb.exec(`SELECT cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name, address FROM templates WHERE id = ?`, [sourceId]);
        } catch {
          hasAddressCol = false;
          templateResult = sourceDb.exec(`SELECT cloud_id, name, inv_date, facility_name, inv_number, cost_file_name, job_ticket_file_name FROM templates WHERE id = ?`, [sourceId]);
        }
        if (templateResult.length === 0 || templateResult[0].values.length === 0) continue;

        const tRow = templateResult[0].values[0];
        const templateName = tRow[1] as string;
        const cloudId = tRow[0] as string | null;
        const addressVal = hasAddressCol ? (tRow[7] as string | null) : null;

        const existing = db.exec(`SELECT id FROM templates WHERE name = ?`, [templateName]);
        if (existing.length > 0 && existing[0].values.length > 0) continue;

        const newLocalId = generateId();
        db.run(`INSERT INTO templates (id, cloud_id, user_id, name, inv_date, facility_name, address, inv_number,
                 cost_file_name, job_ticket_file_name, status, created_at, updated_at, is_dirty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0)`,
          [newLocalId, cloudId, userId, templateName, tRow[2], tRow[3], addressVal, tRow[4], tRow[5], tRow[6],
           new Date().toISOString(), new Date().toISOString()]);

        const sectionsResult = sourceDb.exec(`SELECT sect, description, full_section, cost_sheet FROM sections WHERE template_id = ?`, [sourceId]);
        if (sectionsResult.length > 0) {
          for (const sRow of sectionsResult[0].values) {
            db.run(`INSERT INTO sections (id, template_id, sect, description, full_section, cost_sheet) VALUES (?, ?, ?, ?, ?, ?)`,
              [generateId(), newLocalId, sRow[0], sRow[1], sRow[2], sRow[3]]);
          }
        }

        const costResult = sourceDb.exec(`SELECT ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose FROM cost_items WHERE template_id = ?`, [sourceId]);
        if (costResult.length > 0) {
          for (const cRow of costResult[0].values) {
            db.run(`INSERT INTO cost_items (id, template_id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [generateId(), newLocalId, cRow[0], cRow[1], cRow[2], cRow[3], cRow[4], cRow[5], cRow[6] ?? null, cRow[7] ?? null, cRow[8] ?? null, cRow[9] ?? null, cRow[10] ?? null, cRow[11] ?? null]);
          }
        }

        lastImportedLocalId = newLocalId;
        imported++;
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }

      sourceDb.close();
      await _saveDatabase();
      _notify();

      // Update offline manifest after flash-drive import too
      try {
        const allTemplates = db.exec('SELECT id, name FROM templates');
        if (allTemplates.length > 0) {
          const manifest = {
            templateCount: allTemplates[0].values.length,
            templateIds: allTemplates[0].values.map(r => r[0]),
            lastTemplateId: imported > 0 ? lastImportedLocalId : null,
            lastSyncedAt: new Date().toISOString(),
            offlineReady: true,
          };
          localStorage.setItem('offline_manifest', JSON.stringify(manifest));
        }
      } catch {}

      return { success: true, imported };
    } catch (err: any) {
      console.error('Import from flash drive error:', err);
      return { success: false, error: err.message, imported: 0 };
    }
  }, [db, user]);

  // ── Section management ────────────────────────────────────────

  const addSection = useCallback(async (
    templateId: string, sect: string, description: string | null, fullSection: string | null, costSheet: string | null
  ): Promise<{ success: boolean; error?: string; id?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      const id = generateId();
      db.run(`INSERT INTO sections (id, template_id, sect, description, full_section, cost_sheet) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, templateId, sect, description, fullSection, costSheet]);
      await _saveDatabase();
      _notify();
      return { success: true, id };
    } catch (err: any) { return { success: false, error: err.message }; }
  }, [db]);

  const updateSection = useCallback(async (
    sectionId: string, updates: { description?: string; full_section?: string; cost_sheet?: string | null }
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
      await _saveDatabase();
      _notify();
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }, [db]);

  const deleteSection = useCallback(async (sectionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };
    try {
      db.run(`DELETE FROM sections WHERE id = ?`, [sectionId]);
      await _saveDatabase();
      _notify();
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }, [db]);

  // ── Return ────────────────────────────────────────────────────

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

    updateTemplateStatus,
    getSections,
    getCostItemByNDC,
    getAllCostItems,
    deleteLocalTemplate,
    getTemplateCostItemCount,

    addSection,
    updateSection,
    deleteSection,

    syncWithCloud,
    pullFromCloud,
    pushToCloud,
    syncSelectedTemplates,

    exportToFlashDrive,
    exportCloudTemplatesToFlashDrive,
    previewFlashDriveImport,
    importFromFlashDrive,

    // Cost data search for offline mode
    searchCostItems: useCallback(async (
      templateId: string, query: string, sheetName?: string
    ): Promise<Array<{
      id: string; ndc: string | null; material_description: string | null;
      unit_price: number | null; source: string | null; material: string | null;
      sheet_name: string | null; billing_date: string | null; manufacturer: string | null;
      generic: string | null; strength: string | null; size: string | null; dose: string | null;
    }>> => {
      if (!db) return [];
      try {
        const likeQuery = `%${query}%`;
        let sql = `SELECT rowid as id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose
                   FROM cost_items WHERE template_id = ?
                   AND (ndc LIKE ? OR material_description LIKE ? OR material LIKE ? OR manufacturer LIKE ? OR generic LIKE ?)`;
        const params: any[] = [templateId, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery];
        if (sheetName) {
          sql += ` AND sheet_name = ?`;
          params.push(sheetName);
        }
        sql += ` ORDER BY source ASC LIMIT 500`;
        const results = db.exec(sql, params);
        if (results.length === 0) return [];
        return results[0].values.map((row: any[]) => ({
          id: String(row[0]), ndc: row[1] as string | null,
          material_description: row[2] as string | null, unit_price: row[3] as number | null,
          source: row[4] as string | null, material: row[5] as string | null,
          sheet_name: row[6] as string | null, billing_date: row[7] as string | null,
          manufacturer: row[8] as string | null, generic: row[9] as string | null,
          strength: row[10] as string | null, size: row[11] as string | null,
          dose: row[12] as string | null,
        }));
      } catch (err) { console.error('[OfflineDB] searchCostItems error:', err); return []; }
    }, [db]),

    getCostSheetNames: useCallback((templateId: string): string[] => {
      if (!db) return [];
      try {
        const results = db.exec(
          `SELECT DISTINCT sheet_name FROM cost_items WHERE template_id = ? AND sheet_name IS NOT NULL AND sheet_name != '' ORDER BY sheet_name`,
          [templateId]
        );
        if (results.length === 0) return [];
        return results[0].values.map((row: any[]) => row[0] as string);
      } catch { return []; }
    }, [db]),

    getCostItemCount: useCallback((templateId: string, sheetName?: string): number => {
      if (!db) return 0;
      try {
        let sql = `SELECT COUNT(*) FROM cost_items WHERE template_id = ?`;
        const params: any[] = [templateId];
        if (sheetName) { sql += ` AND sheet_name = ?`; params.push(sheetName); }
        const result = db.exec(sql, params);
        return result.length > 0 ? (result[0].values[0][0] as number) : 0;
      } catch { return 0; }
    }, [db]),
  };
}
