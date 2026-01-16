import { useState, useEffect, useCallback, useRef } from 'react';
import initSqlJs, { Database } from 'sql.js';

const DB_NAME = 'fda_database';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'fda_db';
const META_KEY = 'fda_meta';

interface FDAMeta {
  lastUpdated: string;
  rowCount: number;
  fileName: string;
}

interface FDADrug {
  id: number;
  ndc: string;
  drug_name: string;
  manufacturer: string | null;
  package_description: string | null;
  fda_status: string | null;
  dea_schedule: string | null;
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

export function useLocalFDA() {
  const [db, setDb] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState<FDAMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sqlRef = useRef<any>(null);

  // Initialize sql.js and load existing database
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        
        // Initialize sql.js with WASM
        const SQL = await initSqlJs({
          locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
        });
        sqlRef.current = SQL;

        // Try to load existing database from IndexedDB
        const savedDb = await loadFromIndexedDB<Uint8Array>(DB_KEY);
        const savedMeta = await loadFromIndexedDB<FDAMeta>(META_KEY);

        if (savedDb && savedMeta) {
          const database = new SQL.Database(savedDb);
          setDb(database);
          setMeta(savedMeta);
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

  // Import data from parsed Excel rows
  const importData = useCallback(async (
    rows: any[],
    fileName: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ success: number; failed: number }> => {
    if (!sqlRef.current) {
      throw new Error('SQL.js not initialized');
    }

    // Close existing database
    db?.close();

    // Create new database
    const newDb = new sqlRef.current.Database();

    // Create table with indexes
    newDb.run(`
      CREATE TABLE drugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ndc TEXT UNIQUE NOT NULL,
        drug_name TEXT NOT NULL,
        manufacturer TEXT,
        package_description TEXT,
        fda_status TEXT,
        dea_schedule TEXT
      );
      CREATE INDEX idx_ndc ON drugs(ndc);
      CREATE INDEX idx_drug_name ON drugs(drug_name COLLATE NOCASE);
      CREATE INDEX idx_manufacturer ON drugs(manufacturer COLLATE NOCASE);
    `);

    let success = 0;
    let failed = 0;

    // Prepare insert statement
    const stmt = newDb.prepare(`
      INSERT OR REPLACE INTO drugs (ndc, drug_name, manufacturer, package_description, fda_status, dea_schedule)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Begin transaction for faster inserts
    newDb.run('BEGIN TRANSACTION');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const ndc = row['NDC'] || row.NDC || row.ndc;
        const drugName = row['TRADE'] || row['GENERIC'] || row['MERIDIAN DESC'] || row.TRADE || row.GENERIC;
        
        if (!ndc || !drugName) {
          failed++;
          continue;
        }

        const packageSize = row['PACKAGE SIZE'] || row['FDA SIZE'] || '';
        const sizeText = row['SIZE TXT'] || '';
        const doseForm = row['DOSE FORM'] || '';
        const packageDesc = [packageSize, sizeText, doseForm].filter(Boolean).join(' ').trim() || null;

        stmt.run([
          String(ndc).trim(),
          String(drugName).trim(),
          row['MANUFACTURER'] || row.MANUFACTURER || null,
          packageDesc,
          row['RX/OTC INDICATOR'] || null,
          row['DEA CLASS'] || null,
        ]);

        success++;
      } catch (err) {
        failed++;
      }

      if (onProgress && i % 1000 === 0) {
        onProgress(i, rows.length);
      }
    }

    stmt.free();
    newDb.run('COMMIT');

    // Save to IndexedDB
    const dbData = newDb.export();
    const dbArray = new Uint8Array(dbData);
    
    const newMeta: FDAMeta = {
      lastUpdated: new Date().toISOString(),
      rowCount: success,
      fileName,
    };

    await saveToIndexedDB(DB_KEY, dbArray);
    await saveToIndexedDB(META_KEY, newMeta);

    setDb(newDb);
    setMeta(newMeta);

    if (onProgress) {
      onProgress(rows.length, rows.length);
    }

    return { success, failed };
  }, [db]);

  // Search drugs
  const searchDrugs = useCallback((searchTerm: string, limit: number = 100): FDADrug[] => {
    if (!db) return [];

    try {
      const term = `%${searchTerm}%`;
      const results = db.exec(`
        SELECT id, ndc, drug_name, manufacturer, package_description, fda_status, dea_schedule
        FROM drugs
        WHERE ndc LIKE ? OR drug_name LIKE ? OR manufacturer LIKE ?
        ORDER BY drug_name
        LIMIT ?
      `, [term, term, term, limit]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        ndc: row[1] as string,
        drug_name: row[2] as string,
        manufacturer: row[3] as string | null,
        package_description: row[4] as string | null,
        fda_status: row[5] as string | null,
        dea_schedule: row[6] as string | null,
      }));
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  }, [db]);

  // Get all drugs (paginated)
  const getDrugs = useCallback((offset: number = 0, limit: number = 100): FDADrug[] => {
    if (!db) return [];

    try {
      const results = db.exec(`
        SELECT id, ndc, drug_name, manufacturer, package_description, fda_status, dea_schedule
        FROM drugs
        ORDER BY drug_name
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      if (results.length === 0) return [];

      return results[0].values.map((row: any[]) => ({
        id: row[0] as number,
        ndc: row[1] as string,
        drug_name: row[2] as string,
        manufacturer: row[3] as string | null,
        package_description: row[4] as string | null,
        fda_status: row[5] as string | null,
        dea_schedule: row[6] as string | null,
      }));
    } catch (err) {
      console.error('Get drugs error:', err);
      return [];
    }
  }, [db]);

  // Lookup by NDC
  const lookupNDC = useCallback((ndc: string): FDADrug | null => {
    if (!db) return null;

    try {
      const results = db.exec(`
        SELECT id, ndc, drug_name, manufacturer, package_description, fda_status, dea_schedule
        FROM drugs
        WHERE ndc = ?
        LIMIT 1
      `, [ndc.trim()]);

      if (results.length === 0 || results[0].values.length === 0) return null;

      const row = results[0].values[0];
      return {
        id: row[0] as number,
        ndc: row[1] as string,
        drug_name: row[2] as string,
        manufacturer: row[3] as string | null,
        package_description: row[4] as string | null,
        fda_status: row[5] as string | null,
        dea_schedule: row[6] as string | null,
      };
    } catch (err) {
      console.error('Lookup error:', err);
      return null;
    }
  }, [db]);

  // Get total count
  const getCount = useCallback((): number => {
    if (!db) return 0;

    try {
      const results = db.exec('SELECT COUNT(*) FROM drugs');
      if (results.length === 0) return 0;
      return results[0].values[0][0] as number;
    } catch (err) {
      return 0;
    }
  }, [db]);

  // Clear database
  const clearDatabase = useCallback(async () => {
    db?.close();
    setDb(null);
    setMeta(null);
    
    const idb = await openIndexedDB();
    const transaction = idb.transaction(DB_STORE, 'readwrite');
    const store = transaction.objectStore(DB_STORE);
    store.delete(DB_KEY);
    store.delete(META_KEY);
    idb.close();
  }, [db]);

  return {
    isLoading,
    isReady: !!db,
    meta,
    error,
    importData,
    searchDrugs,
    getDrugs,
    lookupNDC,
    getCount,
    clearDatabase,
  };
}
