/**
 * SQLite OPFS worker — replaces IndexedDB as the spin history storage engine.
 *
 * Uses the OPFS Sync Access Handle Pool VFS (installOpfsSAHPoolVfs), NOT the
 * Asyncify/SharedArrayBuffer OpfsDb variant — the SAH pool VFS runs fully
 * synchronously inside this single dedicated worker and does NOT require
 * COOP/COEP headers (cross-origin isolation), unlike OpfsDb. This app only
 * ever needs one connection from one worker, which is exactly the SAH pool's
 * supported shape.
 *
 * All actual SQL logic lives in sqlite-schema.js (db-agnostic, shared with the
 * test suite) — this file is just the worker glue: boot + message dispatch.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import * as schema from './sqlite-schema.js';

let db = null;

const ACTIONS = {
  BULK_INSERT: (payload) => schema.bulkInsert(db, payload),
  SEARCH_CHUNK: (payload) => schema.searchChunk(db, payload),
  COUNT: (payload) => schema.count(db, payload),
  GET_NEXT_NUM: () => schema.getNextSpinNum(db),
  TOGGLE_BOOKMARK: (payload) => schema.toggleBookmark(db, payload),
  DELETE_BATCH: (payload) => schema.deleteBatch(db, payload),
  CLEAR_GAME: (payload) => schema.clearGame(db, payload),
  CLEAR_ALL: () => schema.clearAll(db),
  FINGERPRINTS: () => schema.fingerprints(db),
  CLOSE: () => {
    db?.close();
    db = null;
  },
};

self.onmessage = (e) => {
  const { id, action, payload } = e.data;
  if (action === 'CLOSE' && id == null) {
    // Fire-and-forget path (pagehide) — no reply expected/possible in time.
    try {
      ACTIONS.CLOSE();
    } catch {}
    return;
  }
  if (!db) {
    postMessage({ id, error: 'SQLite not ready' });
    return;
  }
  try {
    const result = ACTIONS[action] ? ACTIONS[action](payload) : undefined;
    postMessage({ id, result });
  } catch (err) {
    postMessage({ id, error: err?.message || String(err) });
  }
};

/**
 * The SAH-pool VFS holds an exclusive access handle per file. Reloading the
 * page (or opening a second tab of the same origin) can race the previous
 * worker's handle release against this one's open, throwing
 * "Access Handles cannot be created if there is another open Access Handle"
 * — almost always a transient release race, not a real permanent conflict.
 * Retry with backoff before giving up.
 */
async function openWithRetry(sqlite3, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'cascading-game-tester' });
      return new poolUtil.OpfsSAHPoolDb('/spins.sqlite3');
    } catch (err) {
      const isHandleConflict = /Access Handle/i.test(err?.message || '');
      if (!isHandleConflict || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}

sqlite3InitModule()
  .then(async (sqlite3) => {
    db = await openWithRetry(sqlite3);
    // NOT WAL: WAL needs a second `-wal` sidecar file opened as its own access
    // handle mid-transaction — the SAH-pool VFS's exclusive single-handle-per
    // -file model doesn't support that, and it throws exactly the same
    // "Access Handle already open" error on the first write, not a real
    // multi-tab/reload conflict. Default rollback journal is what SAH-pool
    // actually supports.
    // OFF, not NORMAL: every COMMIT under rollback-journal mode does an
    // OPFS-flush-equivalent fsync; at NORMAL that fsync fires per commit and
    // dominates autoplay throughput (dozens of commits/sec, each paying the
    // fixed flush cost regardless of batch size). User has explicitly said
    // this data is disposable (re-generated from replay, never migrated) —
    // durability-on-crash isn't a requirement here, so trade it for speed.
    db.exec('PRAGMA synchronous=OFF;');
    db.exec(schema.SCHEMA_SQL);
    postMessage({ type: 'READY' });
    runBackfillLoop();
  })
  .catch((err) => {
    postMessage({ type: 'BOOT_ERROR', error: err?.message || String(err) });
  });

/**
 * Populates featureValues for spins saved before that table existed (older
 * OPFS databases from earlier app versions). Runs in the background, chunked
 * via setTimeout so it never blocks a SEARCH_CHUNK/BULK_INSERT message from
 * being handled promptly — this worker is single-threaded, so a giant
 * one-shot backfill would stall autoplay/search for its entire duration.
 * Becomes a permanent no-op (single metadata read, no rows touched) once
 * caught up, since bulkInsert populates featureValues for every new spin
 * going forward.
 */
function runBackfillLoop() {
  try {
    const { done } = schema.backfillFeatureValuesChunk(db, { batchSize: 500 });
    if (!done) setTimeout(runBackfillLoop, 0);
  } catch (err) {
    console.error('featureValues backfill chunk failed:', err);
  }
}
