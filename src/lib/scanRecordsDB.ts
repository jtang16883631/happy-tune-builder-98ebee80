/**
 * IndexedDB-backed storage for scan records.
 * Replaces localStorage to handle massive datasets without crashing.
 *
 * Each record is keyed by "scan_records_{templateId}_{sectionId}".
 */

const DB_NAME = 'scan_records_db';
const DB_VERSION = 1;
const STORE_NAME = 'scan_records';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function makeKey(templateId: string, sectionId: string): string {
  return `scan_records_${templateId}_${sectionId}`;
}

/**
 * Save scan records for a template+section into IndexedDB.
 */
export async function saveScanRecords(templateId: string, sectionId: string, records: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(records, makeKey(templateId, sectionId));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Load scan records for a template+section from IndexedDB.
 */
export async function loadScanRecords<T = any>(templateId: string, sectionId: string): Promise<T[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(makeKey(templateId, sectionId));
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Delete scan records for a template+section from IndexedDB.
 */
export async function deleteScanRecords(templateId: string, sectionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(makeKey(templateId, sectionId));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Load scan records for multiple sections at once (batch read).
 */
export async function loadManyScanRecords<T = any>(
  templateId: string,
  sectionIds: string[]
): Promise<Record<string, T[]>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result: Record<string, T[]> = {};
    let pending = sectionIds.length;

    if (pending === 0) { db.close(); resolve(result); return; }

    for (const sid of sectionIds) {
      const req = store.get(makeKey(templateId, sid));
      req.onsuccess = () => {
        if (req.result) result[sid] = req.result;
        pending--;
        if (pending === 0) { db.close(); resolve(result); }
      };
      req.onerror = () => {
        pending--;
        if (pending === 0) { db.close(); resolve(result); }
      };
    }
  });
}
