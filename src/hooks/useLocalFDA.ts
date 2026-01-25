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
  mapping?: {
    agCount: number; // rows with innerpack_outer_left9 ("Left 9" / AG)
    aeCount: number; // rows with outerpack_ndc ("Outerpack NDC" / AE)
    pairCount: number; // rows with both AG+AE present
  };
}

export interface FDADrug {
  id: number;
  ndc: string;
  meridian_desc: string | null;
  trade: string | null;
  generic: string | null;
  strength: string | null;
  package_size: string | null;
  fda_size: string | null;
  size_txt: string | null;
  dose_form: string | null;
  manufacturer: string | null;
  generic_code: string | null;
  dea_class: string | null;
  ahfs: string | null;
  source: string | null;
  meridian_divisor: string | null;
  count_method: string | null;
  verify_count_method: string | null;
  rx_otc: string | null;
  cardinal_cin: string | null;
  mckesson_item: string | null;
  abc_number: string | null;
  gcn: string | null;
  divisor_ml_each: string | null;
  io: string | null;
  ndc_inv_since_2020: string | null;
  ndc_cost_since_2020: string | null;
  entry_updated_fda: string | null;
  cardinal_upc: string | null;
  ndc9_outer: string | null;
  outerpack_ndc: string | null;
  innerpack_outer_left9: string | null;
  mckesson_upc: string | null;
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
          
          // Calculate mapping counts if missing (for databases imported before this feature)
          if (!savedMeta.mapping) {
            try {
              const getScalar = (sql: string): number => {
                const r = database.exec(sql);
                const v = r?.[0]?.values?.[0]?.[0];
                const n = typeof v === 'number' ? v : Number(v ?? 0);
                return Number.isFinite(n) ? n : 0;
              };

              const agCount = getScalar(
                "SELECT COUNT(*) FROM drugs WHERE innerpack_outer_left9 IS NOT NULL AND TRIM(innerpack_outer_left9) != ''"
              );
              const aeCount = getScalar(
                "SELECT COUNT(*) FROM drugs WHERE outerpack_ndc IS NOT NULL AND TRIM(outerpack_ndc) != ''"
              );
              const pairCount = getScalar(
                "SELECT COUNT(*) FROM drugs WHERE innerpack_outer_left9 IS NOT NULL AND TRIM(innerpack_outer_left9) != '' AND outerpack_ndc IS NOT NULL AND TRIM(outerpack_ndc) != ''"
              );

              const updatedMeta = { ...savedMeta, mapping: { agCount, aeCount, pairCount } };
              await saveToIndexedDB(META_KEY, updatedMeta);
              setMeta(updatedMeta);
            } catch (e) {
              console.error('Failed to calculate mapping counts:', e);
              setMeta(savedMeta);
            }
          } else {
            setMeta(savedMeta);
          }
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

    // Create table with ALL columns
    newDb.run(`
      CREATE TABLE drugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ndc TEXT UNIQUE NOT NULL,
        meridian_desc TEXT,
        trade TEXT,
        generic TEXT,
        strength TEXT,
        package_size TEXT,
        fda_size TEXT,
        size_txt TEXT,
        dose_form TEXT,
        manufacturer TEXT,
        generic_code TEXT,
        dea_class TEXT,
        ahfs TEXT,
        source TEXT,
        meridian_divisor TEXT,
        count_method TEXT,
        verify_count_method TEXT,
        rx_otc TEXT,
        cardinal_cin TEXT,
        mckesson_item TEXT,
        abc_number TEXT,
        gcn TEXT,
        divisor_ml_each TEXT,
        io TEXT,
        ndc_inv_since_2020 TEXT,
        ndc_cost_since_2020 TEXT,
        entry_updated_fda TEXT,
        cardinal_upc TEXT,
        ndc9_outer TEXT,
        outerpack_ndc TEXT,
        innerpack_outer_left9 TEXT,
        mckesson_upc TEXT
      );
      CREATE INDEX idx_ndc ON drugs(ndc);
      CREATE INDEX idx_trade ON drugs(trade COLLATE NOCASE);
      CREATE INDEX idx_generic ON drugs(generic COLLATE NOCASE);
      CREATE INDEX idx_manufacturer ON drugs(manufacturer COLLATE NOCASE);
      CREATE INDEX idx_cardinal_cin ON drugs(cardinal_cin);
      CREATE INDEX idx_mckesson_item ON drugs(mckesson_item);
      CREATE INDEX idx_gcn ON drugs(gcn);
      CREATE INDEX idx_innerpack_outer_left9 ON drugs(innerpack_outer_left9);
      CREATE INDEX idx_outerpack_ndc ON drugs(outerpack_ndc);
    `);

    let success = 0;
    let failed = 0;

    // Prepare insert statement
    const stmt = newDb.prepare(`
      INSERT OR REPLACE INTO drugs (
        ndc, meridian_desc, trade, generic, strength, package_size, fda_size,
        size_txt, dose_form, manufacturer, generic_code, dea_class, ahfs, source,
        meridian_divisor, count_method, verify_count_method, rx_otc, cardinal_cin,
        mckesson_item, abc_number, gcn, divisor_ml_each, io, ndc_inv_since_2020,
        ndc_cost_since_2020, entry_updated_fda, cardinal_upc, ndc9_outer,
        outerpack_ndc, innerpack_outer_left9, mckesson_upc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Begin transaction for faster inserts
    newDb.run('BEGIN TRANSACTION');

    const normalizeKey = (k: string) =>
      String(k)
        .replace(/\u00A0/g, ' ')
        .toLowerCase()
        // Make header matching resilient to punctuation differences like "-", "/", "#", etc.
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const getVal = (row: any, ...keys: string[]): string | null => {
      const rowKeys = Object.keys(row ?? {});

      for (const key of keys) {
        if (!key) continue;

        // 1) Exact match
        if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
          return String(row[key]).trim();
        }

        // 2) Case/whitespace-insensitive match (handles headers like "Left 9", trailing spaces, NBSP)
        const wanted = normalizeKey(key);
        const actual = rowKeys.find((rk) => normalizeKey(rk) === wanted);
        if (actual && row?.[actual] !== undefined && row?.[actual] !== null && row?.[actual] !== '') {
          return String(row[actual]).trim();
        }
      }
      return null;
    };

    // Log sample row keys to help debug header detection
    if (rows.length > 0) {
      const sampleRow = rows[0];
      const keys = Object.keys(sampleRow);
      console.log('[FDA Import] Sample row keys:', keys);
      console.log('[FDA Import] AE value:', sampleRow['AE']);
      console.log('[FDA Import] AG value:', sampleRow['AG']);
      // Log all two-letter column values for debugging
      const twoLetterCols = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ'];
      twoLetterCols.forEach(col => {
        if (sampleRow[col] !== undefined && sampleRow[col] !== '') {
          console.log(`[FDA Import] Column ${col}:`, sampleRow[col]);
        }
      });
      // Also check for "Left 9" header variations
      keys.filter(k => k.toLowerCase().includes('left') || k.toLowerCase().includes('inner') || k.toLowerCase().includes('outer'))
        .forEach(k => console.log(`[FDA Import] Potential mapping column "${k}":`, sampleRow[k]));
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const ndc = getVal(row, 'NDC', 'ndc', 'A');
        
        if (!ndc) {
          failed++;
          continue;
        }

        stmt.run([
          ndc,
          getVal(row, 'MERIDIAN DESC', 'Meridian Desc', 'meridian_desc'),
          getVal(row, 'TRADE', 'Trade', 'trade'),
          getVal(row, 'GENERIC', 'Generic', 'generic'),
          getVal(row, 'STRENGTH', 'Strength', 'strength'),
          getVal(row, 'PACKAGE SIZE', 'Package Size', 'package_size'),
          getVal(row, 'FDA SIZE', 'FDA Size', 'fda_size'),
          getVal(row, 'SIZE TXT', 'Size Txt', 'size_txt'),
          getVal(row, 'DOSE FORM', 'Dose Form', 'dose_form'),
          getVal(row, 'MANUFACTURER', 'Manufacturer', 'manufacturer'),
          getVal(row, 'GENERIC CODE', 'Generic Code', 'generic_code'),
          getVal(row, 'DEA CLASS', 'DEA Class', 'dea_class'),
          getVal(row, 'AHFS', 'Ahfs', 'ahfs'),
          getVal(row, 'SOURCE', 'Source', 'source'),
          getVal(row, 'MERIDIAN DIVISOR (PACK TO EACH)', 'Meridian Divisor', 'meridian_divisor'),
          getVal(row, 'COUNT METHOD', 'Count Method', 'count_method'),
          getVal(row, 'Verify Count  Method indicator', 'Verify Count Method', 'verify_count_method'),
          getVal(row, 'RX/OTC INDICATOR', 'RX/OTC', 'rx_otc'),
          getVal(row, 'Cardinal CIN', 'Cardinal Cin', 'cardinal_cin'),
          getVal(row, 'McKesson item no', 'McKesson Item', 'mckesson_item'),
          getVal(row, 'ABC #', 'ABC', 'abc_number'),
          getVal(row, 'GCN', 'Gcn', 'gcn'),
          getVal(row, 'DIVISOR (ML or EACH)', 'Divisor', 'divisor_ml_each'),
          getVal(row, 'I/O', 'IO', 'io'),
          getVal(row, 'NDC in Inv since 2020', 'ndc_inv_since_2020'),
          getVal(row, 'NDC in cost data since 2020', 'ndc_cost_since_2020'),
          getVal(row, 'ENTRY UPDATED FROM FDA', 'entry_updated_fda'),
          getVal(row, 'Cardinal UPC pulled from FDA site since 2022', 'cardinal_upc'),
          getVal(row, 'NDC9Outer', 'ndc9_outer'),
          // Column AE - Outer Pack NDC
          getVal(row, 'AE', 'Outerpack NDC', 'Outer Pack NDC', 'OUTERPACK NDC', 'outerpack_ndc', 'OuterPack NDC'),
          // Column AG - Left 9 / Innerpack-Outer Left 9
          getVal(row, 'AG', 'Innerpack - Outer Left 9', 'Innerpack-Outer Left 9', 'Left 9', 'LEFT 9', 'innerpack_outer_left9', 'Innerpack Outer Left 9', 'InnerPack-Outer Left 9', 'L9', 'Left9'),
          getVal(row, 'AH', 'McKesson UPC', 'mckesson_upc'),
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
    
    const getScalar = (sql: string, params: any[] = []): number => {
      const r = newDb.exec(sql, params);
      const v = r?.[0]?.values?.[0]?.[0];
      const n = typeof v === 'number' ? v : Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    const agCount = getScalar(
      "SELECT COUNT(*) FROM drugs WHERE innerpack_outer_left9 IS NOT NULL AND TRIM(innerpack_outer_left9) != ''"
    );
    const aeCount = getScalar(
      "SELECT COUNT(*) FROM drugs WHERE outerpack_ndc IS NOT NULL AND TRIM(outerpack_ndc) != ''"
    );
    const pairCount = getScalar(
      "SELECT COUNT(*) FROM drugs WHERE innerpack_outer_left9 IS NOT NULL AND TRIM(innerpack_outer_left9) != '' AND outerpack_ndc IS NOT NULL AND TRIM(outerpack_ndc) != ''"
    );

    const newMeta: FDAMeta = {
      lastUpdated: new Date().toISOString(),
      rowCount: success,
      fileName,
      mapping: { agCount, aeCount, pairCount },
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

  // Lookup by NDC
  const lookupNDC = useCallback((ndc: string): FDADrug | null => {
    if (!db) return null;

    try {
      const results = db.exec(`SELECT * FROM drugs WHERE ndc = ? LIMIT 1`, [ndc.trim()]);

      if (results.length === 0 || results[0].values.length === 0) return null;

      const columns = results[0].columns;
      const row = results[0].values[0];
      
      const drug: any = {};
      columns.forEach((col, idx) => {
        drug[col] = row[idx];
      });

      return drug as FDADrug;
    } catch (err) {
      console.error('Lookup error:', err);
      return null;
    }
  }, [db]);

  // Search drugs
  const searchDrugs = useCallback((searchTerm: string, limit: number = 100): FDADrug[] => {
    if (!db) return [];

    try {
      const term = `%${searchTerm}%`;
      const results = db.exec(`
        SELECT * FROM drugs
        WHERE ndc LIKE ? OR trade LIKE ? OR generic LIKE ? OR manufacturer LIKE ? OR cardinal_cin LIKE ? OR mckesson_item LIKE ?
        ORDER BY trade
        LIMIT ?
      `, [term, term, term, term, term, term, limit]);

      if (results.length === 0) return [];

      const columns = results[0].columns;
      return results[0].values.map((row: any[]) => {
        const drug: any = {};
        columns.forEach((col, idx) => {
          drug[col] = row[idx];
        });
        return drug as FDADrug;
      });
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  }, [db]);

  // Check if an NDC is an Inner pack by looking at column X (io)
  // Returns: { isInner: boolean, drug: FDADrug | null }
  const checkIsInnerPack = useCallback((ndc: string): { isInner: boolean; drug: FDADrug | null } => {
    if (!db) return { isInner: false, drug: null };

    try {
      const digits = (ndc ?? '').replace(/\D/g, '');
      const ndc11 = digits.length >= 11 ? digits.slice(0, 11) : digits.padStart(11, '0');
      const ndc11Trim = ndc11.replace(/^0+/, '') || ndc11;

      const results = db.exec(
        `
        SELECT * FROM drugs
        WHERE REPLACE(REPLACE(ndc, '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(ndc, '-', ''), ' ', '') = ?
        LIMIT 1
        `,
        [ndc11, ndc11Trim]
      );

      if (results.length === 0 || results[0].values.length === 0) {
        return { isInner: false, drug: null };
      }

      const columns = results[0].columns;
      const row = results[0].values[0];

      const drug: any = {};
      columns.forEach((col, idx) => {
        drug[col] = row[idx];
      });

      // Check IO column (column X) - "I" means Inner pack
      const io = drug.io?.toString().toUpperCase().trim();
      return { isInner: io === 'I', drug: drug as FDADrug };
    } catch (err) {
      console.error('checkIsInnerPack error:', err);
      return { isInner: false, drug: null };
    }
  }, [db]);

  // Find outer NDC candidates using the new workflow:
  // Step B: outerKey = left9 + "O", search AD column (ndc9_outer), get AE column (outerpack_ndc)
  // Returns candidates with their full drug info for display (AF = ndc column for outer, B = meridian_desc, G = fda_size)
  const findOuterCandidates = useCallback((ndc: string): { candidates: FDADrug[]; outerNDCs: string[] } => {
    if (!db) return { candidates: [], outerNDCs: [] };

    try {
      const digits = (ndc ?? '').replace(/\D/g, '');
      const ndc11 = digits.length >= 11 ? digits.slice(0, 11) : digits.padStart(11, '0');
      
      // Extract Left 9 (first 9 digits) and append "O" for outerKey
      const left9 = ndc11.slice(0, 9);
      const outerKey = left9 + 'O';
      const outerKeyTrim = outerKey.replace(/^0+/, '') || outerKey;

      console.log('[findOuterCandidates] left9:', left9, 'outerKey:', outerKey);

      // Search AD column (ndc9_outer) for outerKey
      const results = db.exec(
        `
        SELECT * FROM drugs
        WHERE REPLACE(REPLACE(ndc9_outer, '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(ndc9_outer, '-', ''), ' ', '') = ?
        LIMIT 200
        `,
        [outerKey, outerKeyTrim]
      );

      if (results.length === 0 || results[0].values.length === 0) {
        console.log('[findOuterCandidates] No matches found for outerKey:', outerKey);
        return { candidates: [], outerNDCs: [] };
      }

      const columns = results[0].columns;
      const candidates: FDADrug[] = results[0].values.map((row: any[]) => {
        const drug: any = {};
        columns.forEach((col, idx) => {
          drug[col] = row[idx];
        });
        return drug as FDADrug;
      });

      // Extract unique outerpack_ndc values (column AE)
      const outerNDCSet = new Set<string>();
      candidates.forEach((drug) => {
        const raw = drug.outerpack_ndc;
        if (!raw) return;

        const outerDigits = String(raw).replace(/\D/g, '');
        if (!outerDigits) return;

        const normalized = outerDigits.length >= 11 ? outerDigits.slice(0, 11) : outerDigits.padStart(11, '0');
        outerNDCSet.add(normalized);
      });

      console.log('[findOuterCandidates] Found', outerNDCSet.size, 'unique outer NDCs');

      return {
        candidates,
        outerNDCs: Array.from(outerNDCSet),
      };
    } catch (err) {
      console.error('findOuterCandidates error:', err);
      return { candidates: [], outerNDCs: [] };
    }
  }, [db]);

  // Legacy function for backward compatibility - now uses the new workflow internally
  const findOuterNDCsByNDC9 = useCallback((ndc: string): { outerNDCs: string[]; drugs: FDADrug[] } => {
    const { candidates, outerNDCs } = findOuterCandidates(ndc);
    return { outerNDCs, drugs: candidates };
  }, [findOuterCandidates]);

  // Get drug info for a specific outer NDC
  const getDrugByOuterNDC = useCallback((outerNDC: string): FDADrug | null => {
    if (!db) return null;

    try {
      const outerDigits = String(outerNDC ?? '').replace(/\D/g, '');
      const normalized = outerDigits.length >= 11 ? outerDigits.slice(0, 11) : outerDigits.padStart(11, '0');
      const normalizedTrim = normalized.replace(/^0+/, '');

      const results = db.exec(
        `
        SELECT * FROM drugs
        WHERE REPLACE(REPLACE(outerpack_ndc, '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(outerpack_ndc, '-', ''), ' ', '') = ?
        LIMIT 1
        `,
        [normalized, normalizedTrim]
      );

      if (results.length === 0 || results[0].values.length === 0) return null;

      const columns = results[0].columns;
      const row = results[0].values[0];

      const drug: any = {};
      columns.forEach((col, idx) => {
        drug[col] = row[idx];
      });

      return drug as FDADrug;
    } catch (err) {
      console.error('getDrugByOuterNDC error:', err);
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

  // Export database to file (for flash drive transfer)
  const exportToFile = useCallback(async (): Promise<Blob | null> => {
    if (!db || !meta) return null;

    try {
      const dbData = db.export();
      const dbArray = new Uint8Array(dbData);
      
      // Create a package with both the database and metadata
      const metaJson = JSON.stringify(meta);
      const metaBytes = new TextEncoder().encode(metaJson);
      
      // Format: [4 bytes meta length][meta JSON][SQLite binary]
      const metaLengthBytes = new Uint8Array(4);
      new DataView(metaLengthBytes.buffer).setUint32(0, metaBytes.length, true);
      
      const combined = new Uint8Array(4 + metaBytes.length + dbArray.length);
      combined.set(metaLengthBytes, 0);
      combined.set(metaBytes, 4);
      combined.set(dbArray, 4 + metaBytes.length);
      
      return new Blob([combined], { type: 'application/octet-stream' });
    } catch (err) {
      console.error('Export error:', err);
      return null;
    }
  }, [db, meta]);

  // Import database from file (from flash drive)
  const importFromFile = useCallback(async (
    file: File,
    onProgress?: (status: string) => void
  ): Promise<boolean> => {
    if (!sqlRef.current) {
      throw new Error('SQL.js not initialized');
    }

    try {
      onProgress?.('Reading file...');
      
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      // Parse format: [4 bytes meta length][meta JSON][SQLite binary]
      const metaLength = new DataView(data.buffer).getUint32(0, true);
      const metaBytes = data.slice(4, 4 + metaLength);
      const dbBytes = data.slice(4 + metaLength);
      
      onProgress?.('Loading metadata...');
      const metaJson = new TextDecoder().decode(metaBytes);
      const loadedMeta: FDAMeta = JSON.parse(metaJson);
      
      onProgress?.('Loading database...');
      
      // Close existing database
      db?.close();
      
      // Load the SQLite database
      const newDb = new sqlRef.current.Database(dbBytes);
      
      // Verify it has the drugs table
      const tables = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='drugs'");
      if (tables.length === 0 || tables[0].values.length === 0) {
        newDb.close();
        throw new Error('Invalid FDA database file - drugs table not found');
      }
      
      onProgress?.('Saving to local storage...');
      
      // Save to IndexedDB
      await saveToIndexedDB(DB_KEY, dbBytes);
      await saveToIndexedDB(META_KEY, loadedMeta);
      
      setDb(newDb);
      setMeta(loadedMeta);
      
      onProgress?.('Complete!');
      return true;
    } catch (err: any) {
      console.error('Import from file error:', err);
      throw err;
    }
  }, [db]);

  return {
    isLoading,
    isReady: !!db,
    meta,
    error,
    importData,
    searchDrugs,
    lookupNDC,
    checkIsInnerPack,
    findOuterCandidates,
    findOuterNDCsByNDC9,
    getDrugByOuterNDC,
    getCount,
    clearDatabase,
    exportToFile,
    importFromFile,
  };
}
