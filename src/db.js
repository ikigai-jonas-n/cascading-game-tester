/**
 * IndexedDB storage layer for spin history.
 * Replaces localStorage to handle unlimited data without hitting the ~5MB cap.
 */

const DB_NAME = 'slot_studio';
const DB_VERSION = 1;
const STORE_NAME = 'spins';

/** @type {IDBDatabase|null} */
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'num' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('isWin', 'isWin', { unique: false });
        store.createIndex('totalWin', 'totalWin', { unique: false });
        store.createIndex('gameId', 'gameId', { unique: false });
        store.createIndex('bookmarked', 'bookmarked', { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Get the object store in a transaction */
function getStore(mode = 'readonly') {
  const tx = _db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

/** Save a single spin entry */
export async function saveSpin(entry) {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore('readwrite');
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Save many spins at once (for import) */
export async function saveAllSpins(entries) {
  await open();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    entries.forEach((entry) => store.put(entry));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/** Load all spins, newest first */
export async function loadAllSpins() {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore();
    const req = store.getAll();
    req.onsuccess = () => {
      const result = req.result || [];
      result.sort((a, b) => b.num - a.num);
      resolve(result);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Get the next spin number (max num + 1) */
export async function getNextSpinNum() {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore();
    const req = store.openCursor(null, 'prev'); // descending by key
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      resolve(cursor ? cursor.value.num + 1 : 1);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Delete all spins */
export async function clearAllSpins() {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore('readwrite');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Get total count */
export async function getSpinCount() {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore();
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Migrate existing localStorage history into IndexedDB (one-time).
 * Deletes the localStorage key after successful migration.
 */
export async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('slot_history');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;

    // Ensure every entry has the required fields
    const entries = arr.map((e, i) => ({
      ...e,
      num: e.num || i + 1,
      timestamp: e.timestamp || new Date().toISOString(),
      gameId: e.gameId || 'sexy-fruits',
    }));

    await saveAllSpins(entries);
    localStorage.removeItem('slot_history');
    console.log(`Migrated ${entries.length} spins from localStorage to IndexedDB`);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

/** Toggle bookmark state for a spin */
export async function toggleBookmark(num, state) {
  await open();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(num);
    req.onsuccess = () => {
      const entry = req.result;
      if (entry) {
        entry.bookmarked = state;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
