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

// Add these native GZIP utilities
export async function compressData(dataObj) {
  const stream = new Blob([JSON.stringify(dataObj)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

export async function decompressData(buffer) {
  if (!buffer) return null;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/** * Returns exact disk usage and quota available to the app in MBs.
 */
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return {
      usageMb: (usage / 1024 / 1024).toFixed(2),
      quotaMb: (quota / 1024 / 1024).toFixed(2),
      percent: ((usage / quota) * 100).toFixed(2),
    };
  }
  return null;
}

/** Highly Optimized Bulk Save (Compression Bypassed for Speed) */
export async function saveAllSpins(entries) {
  await open();

  // FIX: Removed the massive CompressionStream loop.
  // Zipping 400 files in the main thread was killing the CPU and making auto-play "slow af".
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (let i = 0; i < entries.length; i++) {
      store.put(entries[i]);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/** Load initial batch of spins ONLY for the active game */
export async function loadAllSpins(gameId, limit = 5000) {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore();
    const req = store.openCursor(null, 'prev');
    const results = [];

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }

      // STRICT ISOLATION: Only load into RAM if it belongs to the current game
      if (cursor.value.gameId === gameId) {
        results.push(cursor.value);
      }

      if (results.length < limit) {
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Load next page of spins using key-range cursor (no skip/offset).
 * Pass afterKey = last seen spin's `num` to get the next page.
 * Returns newest-first within the active game.
 */
export async function loadSpinsCursor(gameId, afterKey = null, limit = 5000) {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore();
    const range = afterKey != null ? IDBKeyRange.upperBound(afterKey, true) : null;
    const req = store.openCursor(range, 'prev');
    const results = [];

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      if (cursor.value.gameId === gameId) results.push(cursor.value);
      if (results.length < limit) cursor.continue();
      else resolve(results);
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

/** Delete a batch of spins by their numbers (Fast Transaction) */
export async function deleteSpinsBatch(nums) {
  await open();
  return new Promise((resolve, reject) => {
    // Open a single transaction for maximum speed
    const tx = _db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (let i = 0; i < nums.length; i++) {
      store.delete(nums[i]);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/** Delete a single spin by number */
export async function deleteSpin(num) {
  await open();
  return new Promise((resolve, reject) => {
    const store = getStore('readwrite');
    const req = store.delete(num);
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

/** Search the database ONLY for the active game */
export async function searchEntireDb(filters, gameConfig, limit = 1000) {
  await open();
  const { FILTER_DEFS } = await import('./filters.js');

  return new Promise((resolve, reject) => {
    const store = getStore();
    const req = store.openCursor(null, 'prev');
    const results = [];

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(results);

      const spin = cursor.value;

      // STRICT ISOLATION
      if (spin.gameId === gameConfig.id) {
        const isMatch = filters.every((af) => {
          if (af.disabled) return true;
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          if (!def) return true;
          return def.apply(spin, af.value, gameConfig);
        });

        if (isMatch) results.push(spin);
      }

      if (results.length < limit) cursor.continue();
      else resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Iterate DB for streaming. Supports 'filtered' (active game) or 'all' (entire DB) */
export async function iterateDb(exportMode, filters, gameConfig, callback) {
  await open();
  const { FILTER_DEFS } = await import('./filters.js');

  return new Promise((resolve, reject) => {
    const store = getStore('readonly');
    const req = store.openCursor(null, 'prev');
    const chunk = [];

    req.onsuccess = async (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        if (chunk.length > 0) await callback(chunk);
        return resolve();
      }

      const spin = cursor.value;
      let isMatch = true;

      if (exportMode === 'filtered') {
        // Enforce Game Isolation for filtered exports
        if (spin.gameId !== gameConfig.id) {
          isMatch = false;
        } else if (filters && filters.length > 0) {
          isMatch = filters.every((af) => {
            if (af.disabled) return true;
            const def = FILTER_DEFS.find((d) => d.id === af.id);
            return def ? def.apply(spin, af.value, gameConfig) : true;
          });
        }
      } // If exportMode === 'all', isMatch remains true for EVERY game!

      if (isMatch) chunk.push(spin);

      if (chunk.length >= 500) {
        await callback([...chunk]);
        chunk.length = 0;
      }

      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}
