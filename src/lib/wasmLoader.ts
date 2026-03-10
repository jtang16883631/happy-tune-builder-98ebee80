/**
 * Shared WASM loader with IndexedDB caching for offline resilience.
 * Ensures sql-wasm.wasm is always available even without network or service worker.
 *
 * 3-tier fallback:
 *   1. Local WASM file (bundled in public/ → dist/)
 *   2. IndexedDB cached WASM binary (survives cold start offline)
 *   3. CDN fallback (online only)
 *
 * IMPORTANT: For Electron (file:// protocol), WebAssembly.instantiateStreaming
 * does not work. We always fetch the binary first and pass it via `wasmBinary`.
 */
import initSqlJs from 'sql.js';

const WASM_CACHE_DB = 'sql_wasm_cache';
const WASM_CACHE_STORE = 'wasm_cache';
const WASM_CACHE_KEY = 'sql_wasm_binary';
const CDN_WASM_URL = 'https://sql.js.org/dist/sql-wasm.wasm';

// ── IndexedDB helpers ──────────────────────────────────────────────

const openWasmCacheDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WASM_CACHE_DB, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WASM_CACHE_STORE)) {
        db.createObjectStore(WASM_CACHE_STORE);
      }
    };
  });
};

const saveWasmToCache = async (binary: ArrayBuffer): Promise<void> => {
  try {
    const db = await openWasmCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WASM_CACHE_STORE, 'readwrite');
      tx.objectStore(WASM_CACHE_STORE).put(binary, WASM_CACHE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.warn('[WASM Cache] Failed to save:', err);
  }
};

const loadWasmFromCache = async (): Promise<ArrayBuffer | null> => {
  try {
    const db = await openWasmCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WASM_CACHE_STORE, 'readonly');
      const req = tx.objectStore(WASM_CACHE_STORE).get(WASM_CACHE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
};

// ── Fetch binary helper (works with file:// and http://) ───────────

async function fetchWasmBinary(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.arrayBuffer();
}

// ── Main entry point ───────────────────────────────────────────────

export async function initSqlWithCache(tag = 'sql.js') {
  const localPath = `${import.meta.env.BASE_URL}sql-wasm.wasm`;

  // 1. Try local file — fetch as ArrayBuffer first, then pass via wasmBinary.
  //    This avoids WebAssembly.instantiateStreaming which fails on file:// (Electron).
  try {
    console.log(`[${tag}] Trying local WASM: ${localPath}`);
    const buf = await fetchWasmBinary(localPath);
    const SQL = await initSqlJs({ wasmBinary: new Uint8Array(buf) });
    console.log(`[${tag}] Local WASM loaded successfully`);
    // Cache for future offline cold starts (non-blocking)
    saveWasmToCache(buf).then(() => {
      console.log(`[${tag}] WASM cached to IndexedDB`);
    }).catch(() => { /* non-critical */ });
    return SQL;
  } catch (localErr) {
    console.warn(`[${tag}] Local WASM failed:`, localErr);
  }

  // 2. Try IndexedDB cached binary — works fully offline on cold start
  try {
    const cached = await loadWasmFromCache();
    if (cached) {
      console.log(`[${tag}] Loading WASM from IndexedDB cache (${(cached.byteLength / 1024).toFixed(0)} KB)`);
      const SQL = await initSqlJs({ wasmBinary: new Uint8Array(cached) });
      console.log(`[${tag}] IndexedDB WASM loaded successfully`);
      return SQL;
    } else {
      console.warn(`[${tag}] No WASM binary found in IndexedDB cache`);
    }
  } catch (cacheErr) {
    console.warn(`[${tag}] IndexedDB WASM cache failed:`, cacheErr);
  }

  // 3. CDN fallback — only works online
  try {
    console.log(`[${tag}] Trying CDN WASM: ${CDN_WASM_URL}`);
    const buf = await fetchWasmBinary(CDN_WASM_URL);
    const SQL = await initSqlJs({ wasmBinary: new Uint8Array(buf) });
    console.log(`[${tag}] CDN WASM loaded successfully`);
    // Cache for future offline use
    saveWasmToCache(buf).then(() => {
      console.log(`[${tag}] CDN WASM cached to IndexedDB`);
    }).catch(() => { /* non-critical */ });
    return SQL;
  } catch (cdnErr) {
    console.error(`[${tag}] All WASM sources failed. Local: file exists in public/sql-wasm.wasm? IndexedDB: was app ever opened online? CDN: requires internet.`);
    throw new Error(`WASM loading failed (offline cold start requires at least one prior online session to cache the WASM binary)`);
  }
}
