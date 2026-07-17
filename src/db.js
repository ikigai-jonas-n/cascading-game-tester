/**
 * SQLite (OPFS) storage layer for spin history — replaces the earlier
 * IndexedDB implementation. Every export below preserves its old name and
 * signature so callers (gameService.js, exportService.js, spinService.js,
 * FilterBar.jsx, SpinCard.jsx, MongoRoundImportModal.jsx) needed no changes.
 *
 * Storage lives in a dedicated Worker (src/sqlite-worker.js) via the OPFS Sync
 * Access Handle Pool VFS — no COOP/COEP headers required. Filter correctness
 * (including the FeatureMatch DSL) stays in JS via filters.js; SQL is only
 * ever a narrowing pre-filter for the whitelisted scalar fields in
 * sqlite-query-builder.js — never a reimplementation of the full filter set.
 */
import { unwrap } from 'solid-js/store';
import { buildWhitelistedWhere } from './sqlite-query-builder.js';
import { paginateFilteredSearch } from './search-pagination.js';

// One-time: drop the old IndexedDB store now that SQLite is the engine.
// No migration — existing data is resyncable, per explicit user confirmation.
try {
  indexedDB.deleteDatabase('slot_studio');
} catch {}

let worker = null;
let readyPromise = null;
let msgId = 0;
const pending = new Map();

// The SAH-pool VFS allows exactly one open connection to the db file at a
// time. This exact browser error means a second tab/window (or a
// not-yet-released connection from one that just closed) is holding it —
// surface something the user can actually act on instead of the raw
// DOMException text.
function toFriendlyDbError(rawMessage) {
  if (/Access Handle/i.test(rawMessage || '')) {
    return 'Another tab/window of this app is open — close it and reload here. Only one tab can use the database at a time.';
  }
  return rawMessage;
}

function initWorker() {
  if (readyPromise) return readyPromise;
  worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: 'module' });
  readyPromise = new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const { id, type, error, result } = e.data;
      if (type === 'READY') {
        resolve();
        return;
      }
      if (type === 'BOOT_ERROR') {
        reject(new Error(toFriendlyDbError(error)));
        return;
      }
      if (id != null && pending.has(id)) {
        const { resolve: res, reject: rej } = pending.get(id);
        pending.delete(id);
        if (error) rej(new Error(error));
        else res(result);
      }
    };
    worker.onerror = (e) => reject(e.error || new Error(e.message));
  });
  return readyPromise;
}

async function dispatch(action, payload) {
  await initWorker();
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, payload });
  });
}

// The OPFS SAH-pool VFS holds an exclusive access handle per file — release it
// proactively on unload so a reload (or the next tab of this origin) doesn't
// have to race the browser's own worker-teardown timing to reopen it. This is
// best-effort (no reply is awaited); sqlite-worker.js also retries with
// backoff on boot as a backstop for whatever race window this can't close.
window.addEventListener('pagehide', () => {
  worker?.postMessage({ action: 'CLOSE' });
});

export async function open() {
  await initWorker();
}

/**
 * Explicitly release the SAH-pool access handle and wait for confirmation —
 * unlike the pagehide listener above (fire-and-forget, for real navigation),
 * this is for callers that need a deterministic release before doing
 * anything else with the same origin's storage (e.g. E2E test teardown
 * between back-to-back tests in one browser instance).
 */
export async function closeDb() {
  if (!worker) return;
  await dispatch('CLOSE');
  worker = null;
  readyPromise = null;
}

/** Save a single spin entry */
export async function saveSpin(entry) {
  await dispatch('BULK_INSERT', [unwrap(entry)]);
}

/** Bulk save (no compression — same rationale as the prior IndexedDB implementation) */
export async function saveAllSpins(entries) {
  // NOT entries.map(unwrap) — Array.map forwards (value, index, array), and
  // unwrap's 2nd param is an internal Set — the index would clobber it.
  await dispatch(
    'BULK_INSERT',
    entries.map((e) => unwrap(e)),
  );
}

// ── Compression utilities — pure data transforms, unrelated to storage engine ──

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

/** Returns exact disk usage and quota available to the app in MBs. */
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

export async function loadAllSpins(gameId, limit = 5000) {
  const { entries } = await dispatch('SEARCH_CHUNK', {
    whereSql: 'gameId = ?',
    params: [gameId],
    cursor: null,
    chunkSize: limit,
    orderBy: { column: 'num', dir: 'DESC' },
  });
  return entries;
}

/**
 * Load next page of spins using key-range cursor (no skip/offset).
 * Pass afterKey = last seen spin's `num` to get the next page.
 * Returns newest-first within the active game.
 */
export async function loadSpinsCursor(gameId, afterKey = null, limit = 5000) {
  const { entries } = await dispatch('SEARCH_CHUNK', {
    whereSql: 'gameId = ?',
    params: [gameId],
    cursor: afterKey != null ? { afterVal: afterKey, afterNum: afterKey } : null,
    chunkSize: limit,
    orderBy: { column: 'num', dir: 'DESC' },
  });
  return entries;
}

/** Get the next spin number (max num + 1) */
export async function getNextSpinNum() {
  return dispatch('GET_NEXT_NUM');
}

/** Delete all spins */
export async function clearAllSpins() {
  await dispatch('CLEAR_ALL');
}

export async function clearSpinsForGame(gameId) {
  await dispatch('CLEAR_GAME', { gameId });
}

/** Delete a batch of spins by their numbers */
export async function deleteSpinsBatch(nums) {
  await dispatch('DELETE_BATCH', nums);
}

/** Delete a single spin by number */
export async function deleteSpin(num) {
  await dispatch('DELETE_BATCH', [num]);
}

/** Get total count (optionally for a specific game) */
export async function getSpinCount(gameId = null) {
  return dispatch('COUNT', { gameId });
}

/**
 * Build the set of dedup fingerprints across EVERY game in the store.
 * Fingerprint matches the one used on import/export:
 *   `${timestamp}_${summary.coins}_${fields.length}`.
 */
export async function getAllFingerprints() {
  const list = await dispatch('FINGERPRINTS');
  return new Set(list);
}

/**
 * Migrate existing localStorage history into SQLite (one-time, legacy path —
 * kept for users who never made it past the original localStorage-only build).
 */
export async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('slot_history');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;

    const entries = arr.map((e, i) => ({
      ...e,
      num: e.num || i + 1,
      timestamp: e.timestamp || new Date().toISOString(),
      gameId: e.gameId || 'sexy-fruits',
    }));

    await saveAllSpins(entries);
    localStorage.removeItem('slot_history');
    console.log(`Migrated ${entries.length} spins from localStorage to SQLite`);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

/** Toggle bookmark state for a spin */
export async function toggleBookmark(num, state) {
  await dispatch('TOGGLE_BOOKMARK', { num, state });
}

/**
 * Fetch ONE resumable page of filtered results for the active game, ordered
 * per `sortField`. Filters with a whitelisted scalar field (see
 * sqlite-query-builder.js) are pushed down as a SQL WHERE clause narrowing
 * candidate rows via native indexes (including for win_desc/cascade_desc —
 * both are real indexed columns, so pagination stays indexed for every sort
 * mode, never a full-scan-then-sort in JS); every active filter is then still
 * re-checked with its real FILTER_DEFS[].apply() in JS — SQL only narrows, JS
 * is always the correctness authority, so SQL can never cause a false match.
 *
 * `cursor` is `null` for the first page, otherwise the `nextCursor` returned
 * by the previous call — this makes filtered results truly resumable (no
 * hard cap, no silent truncation): keep calling with the returned cursor for
 * "infinite scroll" over filtered results, exactly like the unfiltered
 * `loadSpinsCursor` path.
 *
 * Pass an AbortSignal to cancel early — returns whatever was collected so far
 * with `exhausted: false`, so a subsequent call with the same `cursor` you
 * already had will safely re-attempt without gaps or duplicates.
 *
 * @returns {Promise<{entries: Array, nextCursor: object|null, exhausted: boolean}>}
 */
export async function searchFilteredPage(
  filters,
  gameConfig,
  sortField,
  cursor = null,
  pageSize = 1000,
  signal = null,
) {
  const { FILTER_DEFS } = await import('./filters.js');
  const { whereSql, params } = buildWhitelistedWhere(filters, gameConfig.id);

  return paginateFilteredSearch(
    (orderBy, cur, chunkSize) =>
      dispatch('SEARCH_CHUNK', { whereSql, params, cursor: cur, chunkSize, orderBy }),
    {
      filters,
      gameConfig,
      sortField,
      cursor,
      pageSize,
      signal,
      applyFilter: (spin, fs, gc) =>
        fs.every((af) => {
          if (af.disabled) return true;
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        }),
    },
  );
}

/** Iterate DB for streaming. Supports 'filtered' (active game) or 'all' (entire DB) */
export async function iterateDb(exportMode, filters, gameConfig, callback) {
  const { FILTER_DEFS } = await import('./filters.js');
  let whereSql = '1=1';
  let params = [];
  if (exportMode === 'filtered') {
    ({ whereSql, params } = buildWhitelistedWhere(filters, gameConfig.id));
  }
  // exportMode === 'all': no gameId restriction, isMatch stays true for every game

  const orderBy = { column: 'num', dir: 'DESC' };
  let cur = null;
  while (true) {
    const chunk = await dispatch('SEARCH_CHUNK', {
      whereSql,
      params,
      cursor: cur,
      chunkSize: 500,
      orderBy,
    });

    let matched = chunk.entries;
    if (exportMode === 'filtered' && filters && filters.length > 0) {
      matched = chunk.entries.filter((spin) =>
        filters.every((af) => {
          if (af.disabled) return true;
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gameConfig) : true;
        }),
      );
    }

    if (matched.length > 0) await callback(matched);
    cur = chunk.nextCursor;
    if (chunk.exhausted) return;
    await new Promise((r) => setTimeout(r, 0)); // yield to the UI thread between chunks
  }
}
