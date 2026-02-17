import { useState, useEffect, useCallback, useRef } from 'react';
import initSqlJs, { Database } from 'sql.js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DB_NAME = 'offline_issues_db';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'issues_db';
const SYNC_META_KEY = 'issues_sync_meta';

export type IssueType = 'office' | 'field';

export interface TemplateIssue {
  id: string;
  cloud_id: string | null;
  template_id: string;
  template_name?: string;
  issue_type: IssueType;
  notes: string | null;
  is_resolved: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
}

interface SyncMeta {
  lastSyncedAt: string | null;
  pendingChanges: number;
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

export function useOfflineIssues() {
  const { user } = useAuth();
  const [db, setDb] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({ lastSyncedAt: null, pendingChanges: 0 });
  const sqlRef = useRef<any>(null);
  const autoSyncRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when back online
      if (db && user) {
        syncWithCloud();
      }
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [db, user]);

  // Initialize database
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
            CREATE TABLE IF NOT EXISTS issues (
              id TEXT PRIMARY KEY,
              cloud_id TEXT,
              template_id TEXT NOT NULL,
              template_name TEXT,
              issue_type TEXT NOT NULL CHECK (issue_type IN ('office', 'field')),
              notes TEXT,
              is_resolved INTEGER DEFAULT 0,
              created_by TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              is_dirty INTEGER DEFAULT 0
            );
            
            CREATE INDEX IF NOT EXISTS idx_issues_template ON issues(template_id);
            CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(issue_type);
            CREATE INDEX IF NOT EXISTS idx_issues_cloud ON issues(cloud_id);
          `);
          
          setDb(database);
          await saveDatabase(database);
        }
      } catch (err: any) {
        console.error('Failed to initialize issues DB:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      db?.close();
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
    };
  }, []);

  // Auto-sync every 30 seconds when online
  useEffect(() => {
    if (isOnline && db && user) {
      autoSyncRef.current = setInterval(() => {
        syncWithCloud();
      }, 30000);
    }

    return () => {
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
    };
  }, [isOnline, db, user]);

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

  const getPendingChangesCount = useCallback((): number => {
    if (!db) return 0;
    try {
      const result = db.exec(`SELECT COUNT(*) FROM issues WHERE is_dirty = 1`);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch {
      return 0;
    }
  }, [db]);

  // Get all issues
  const getIssues = useCallback((type?: IssueType): TemplateIssue[] => {
    if (!db) return [];

    try {
      const query = type 
        ? `SELECT * FROM issues WHERE issue_type = ? ORDER BY created_at DESC`
        : `SELECT * FROM issues ORDER BY created_at DESC`;
      
      const results = type ? db.exec(query, [type]) : db.exec(query);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as string,
        cloud_id: row[1] as string | null,
        template_id: row[2] as string,
        template_name: row[3] as string | undefined,
        issue_type: row[4] as IssueType,
        notes: row[5] as string | null,
        is_resolved: Boolean(row[6]),
        created_by: row[7] as string | null,
        created_at: row[8] as string,
        updated_at: row[9] as string,
        is_dirty: Boolean(row[10]),
      }));
    } catch (err) {
      console.error('Get issues error:', err);
      return [];
    }
  }, [db]);

  // Create issue
  const createIssue = useCallback(async (
    templateId: string,
    templateName: string,
    issueType: IssueType,
    notes: string
  ): Promise<{ success: boolean; issue?: TemplateIssue; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      const id = generateId();
      const now = new Date().toISOString();

      db.run(`
        INSERT INTO issues (id, cloud_id, template_id, template_name, issue_type, notes, is_resolved, created_by, created_at, updated_at, is_dirty)
        VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?, ?, 1)
      `, [id, templateId, templateName, issueType, notes, user?.id || null, now, now]);

      await saveDatabase();
      await updateSyncMeta({ pendingChanges: getPendingChangesCount() });

      // Try to sync immediately if online
      if (isOnline && user) {
        syncWithCloud();
      }

      return {
        success: true,
        issue: {
          id,
          cloud_id: null,
          template_id: templateId,
          template_name: templateName,
          issue_type: issueType,
          notes,
          is_resolved: false,
          created_by: user?.id || null,
          created_at: now,
          updated_at: now,
          is_dirty: true,
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, user, isOnline, saveDatabase, updateSyncMeta, getPendingChangesCount]);

  // Update issue
  const updateIssue = useCallback(async (
    id: string,
    updates: { notes?: string; is_resolved?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?', 'is_dirty = 1'];
      const values: any[] = [now];

      if (updates.notes !== undefined) {
        sets.push('notes = ?');
        values.push(updates.notes);
      }
      if (updates.is_resolved !== undefined) {
        sets.push('is_resolved = ?');
        values.push(updates.is_resolved ? 1 : 0);
      }

      values.push(id);
      db.run(`UPDATE issues SET ${sets.join(', ')} WHERE id = ?`, values);

      await saveDatabase();
      await updateSyncMeta({ pendingChanges: getPendingChangesCount() });

      if (isOnline && user) {
        syncWithCloud();
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, isOnline, user, saveDatabase, updateSyncMeta, getPendingChangesCount]);

  // Delete issue
  const deleteIssue = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
      // Get cloud_id before deleting
      const result = db.exec(`SELECT cloud_id FROM issues WHERE id = ?`, [id]);
      const cloudId = result.length > 0 && result[0].values.length > 0 
        ? result[0].values[0][0] as string 
        : null;

      db.run(`DELETE FROM issues WHERE id = ?`, [id]);
      await saveDatabase();

      // Delete from cloud if exists
      if (cloudId && isOnline) {
        await supabase.from('template_issues').delete().eq('id', cloudId);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [db, isOnline, saveDatabase]);

  // Sync with cloud
  const syncWithCloud = useCallback(async (): Promise<{ success: boolean; synced: number; error?: string }> => {
    if (!db || !user || !isOnline || isSyncing) {
      return { success: false, synced: 0, error: 'Cannot sync' };
    }

    setIsSyncing(true);

    try {
      let synced = 0;

      // Step 1: Push dirty issues to cloud
      const dirtyResults = db.exec(`SELECT * FROM issues WHERE is_dirty = 1`);
      
      if (dirtyResults.length > 0) {
        for (const row of dirtyResults[0].values) {
          const issue = {
            id: row[0] as string,
            cloud_id: row[1] as string | null,
            template_id: row[2] as string,
            issue_type: row[4] as string,
            notes: row[5] as string | null,
            is_resolved: Boolean(row[6]),
            created_by: row[7] as string | null,
          };

          if (issue.cloud_id) {
            // Update existing cloud record
            const { error } = await supabase
              .from('template_issues')
              .update({
                notes: issue.notes,
                is_resolved: issue.is_resolved,
                updated_at: new Date().toISOString(),
              })
              .eq('id', issue.cloud_id);
            
            if (!error) {
              db.run(`UPDATE issues SET is_dirty = 0 WHERE id = ?`, [issue.id]);
              synced++;
            }
          } else {
            // Insert new record to cloud
            const { data, error } = await supabase
              .from('template_issues')
              .insert({
                template_id: issue.template_id,
                issue_type: issue.issue_type,
                notes: issue.notes,
                is_resolved: issue.is_resolved,
                created_by: issue.created_by,
              })
              .select()
              .single();

            if (!error && data) {
              db.run(`UPDATE issues SET cloud_id = ?, is_dirty = 0 WHERE id = ?`, [data.id, issue.id]);
              synced++;
            }
          }
        }
      }

      // Step 2: Pull ALL issues from cloud and merge
      const { data: cloudIssues, error: fetchError } = await supabase
        .from('template_issues')
        .select(`
          *,
          data_templates(name)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Failed to fetch cloud issues:', fetchError);
      } else if (cloudIssues) {
        for (const ci of cloudIssues) {
          const existing = db.exec(`SELECT id, is_dirty, updated_at FROM issues WHERE cloud_id = ?`, [ci.id]);
          
          if (existing.length === 0 || existing[0].values.length === 0) {
            // New issue from cloud - insert locally
            const localId = generateId();
            db.run(`
              INSERT INTO issues (id, cloud_id, template_id, template_name, issue_type, notes, is_resolved, created_by, created_at, updated_at, is_dirty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [
              localId, ci.id, ci.template_id, ci.data_templates?.name || null, ci.issue_type, 
              ci.notes, ci.is_resolved ? 1 : 0, ci.created_by, ci.created_at, ci.updated_at
            ]);
            synced++;
          } else {
            // Existing local issue - update if not dirty (cloud wins for non-dirty items)
            const localRow = existing[0].values[0];
            const localId = localRow[0] as string;
            const isDirty = Boolean(localRow[1]);
            const localUpdatedAt = localRow[2] as string;
            
            if (!isDirty) {
              // Local is not dirty - update with cloud data
              const cloudUpdatedAt = new Date(ci.updated_at).getTime();
              const localUpdatedTime = new Date(localUpdatedAt).getTime();
              
              // Only update if cloud is newer
              if (cloudUpdatedAt > localUpdatedTime) {
                db.run(`
                  UPDATE issues SET 
                    notes = ?, 
                    is_resolved = ?, 
                    template_name = ?,
                    updated_at = ?
                  WHERE id = ?
                `, [ci.notes, ci.is_resolved ? 1 : 0, ci.data_templates?.name || null, ci.updated_at, localId]);
                synced++;
              }
            }
            // If local is dirty, keep local changes (they will be pushed on next sync)
          }
        }

        // Step 3: Delete local issues that no longer exist in cloud
        const cloudIds = cloudIssues.map(ci => ci.id);
        const localWithCloudId = db.exec(`SELECT id, cloud_id FROM issues WHERE cloud_id IS NOT NULL`);
        
        if (localWithCloudId.length > 0) {
          for (const row of localWithCloudId[0].values) {
            const localId = row[0] as string;
            const cloudId = row[1] as string;
            
            if (!cloudIds.includes(cloudId)) {
              // Cloud issue was deleted - delete local copy
              db.run(`DELETE FROM issues WHERE id = ?`, [localId]);
            }
          }
        }
      }

      await saveDatabase();
      await updateSyncMeta({ 
        lastSyncedAt: new Date().toISOString(), 
        pendingChanges: getPendingChangesCount()
      });

      return { success: true, synced };
    } catch (err: any) {
      console.error('Sync error:', err);
      return { success: false, synced: 0, error: err.message };
    } finally {
      setIsSyncing(false);
    }
  }, [db, user, isOnline, isSyncing, saveDatabase, updateSyncMeta, getPendingChangesCount]);

  return {
    isLoading,
    isSyncing,
    isOnline,
    syncMeta,
    getIssues,
    createIssue,
    updateIssue,
    deleteIssue,
    syncWithCloud,
    pendingChanges: syncMeta.pendingChanges,
  };
}
