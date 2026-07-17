/**
 * Pure SQLite logic for the spins table — schema + all query/mutation
 * functions, each taking `db` as an explicit first argument instead of
 * closing over a module-level instance.
 *
 * This is the single source of truth for both:
 *  - src/sqlite-worker.js (real usage — OPFS SAH-pool `db` instance)
 *  - tests/db-scale.test.js (in-memory `db` instance, for correctness/index-
 *    usage/perf testing without needing a browser/OPFS)
 *
 * Keeping this db-agnostic is what makes the test meaningfully prove the real
 * schema/queries work, rather than a hand-rolled re-implementation that could
 * silently drift from what actually ships.
 */

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS spins (
    num INTEGER PRIMARY KEY,
    gameId TEXT,
    isWin INTEGER,
    bookmarked INTEGER,
    totalWin REAL,
    tumbleCount INTEGER,
    cascadeCount INTEGER,
    timestamp INTEGER,
    betAmount REAL,
    winTB REAL GENERATED ALWAYS AS (totalWin / NULLIF(betAmount, 0)) VIRTUAL,
    spinMode TEXT,
    hasBaseSpin INTEGER,
    hasFreeSpin INTEGER,
    hasMaxWin INTEGER,
    hasGolden INTEGER,
    isCheatTriggered INTEGER,
    entry JSON
  );
  CREATE INDEX IF NOT EXISTS idx_gameId_num ON spins(gameId, num DESC);
  CREATE INDEX IF NOT EXISTS idx_isWin ON spins(gameId, isWin);
  CREATE INDEX IF NOT EXISTS idx_bookmarked ON spins(gameId, bookmarked);
  CREATE INDEX IF NOT EXISTS idx_totalWin ON spins(gameId, totalWin);
  CREATE INDEX IF NOT EXISTS idx_tumbleCount ON spins(gameId, tumbleCount);
  CREATE INDEX IF NOT EXISTS idx_cascadeCount ON spins(gameId, cascadeCount);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON spins(gameId, timestamp);
  CREATE INDEX IF NOT EXISTS idx_betAmount ON spins(gameId, betAmount);
  CREATE INDEX IF NOT EXISTS idx_winTB ON spins(gameId, winTB);
  CREATE INDEX IF NOT EXISTS idx_spinMode ON spins(gameId, spinMode);
  CREATE INDEX IF NOT EXISTS idx_hasBaseSpin ON spins(gameId, hasBaseSpin);
  CREATE INDEX IF NOT EXISTS idx_hasFreeSpin ON spins(gameId, hasFreeSpin);
  CREATE INDEX IF NOT EXISTS idx_hasMaxWin ON spins(gameId, hasMaxWin);
  CREATE INDEX IF NOT EXISTS idx_hasGolden ON spins(gameId, hasGolden);
  CREATE INDEX IF NOT EXISTS idx_isCheatTriggered ON spins(gameId, isCheatTriggered);

  -- EAV side table for FeatureMatch: spin.fields[].features is a freeform
  -- per-game object whose keys grow over time (new games, refactors) — a
  -- fixed column/index per property isn't viable. Flattening scalar leaves
  -- into rows here means a brand new property never needs a schema change;
  -- it's just new rows under the same (key, value) index. Arrays/objects
  -- (coinValues, golden, modifier itself) are NOT flattened — those stay
  -- JS-only via the entry JSON blob, same as today.
  CREATE TABLE IF NOT EXISTS featureValues (
    spinNum INTEGER,
    fieldIndex INTEGER,
    key TEXT,
    value TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_featureValues_key_value ON featureValues(key, value);
  CREATE INDEX IF NOT EXISTS idx_featureValues_spinNum ON featureValues(spinNum);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

export function extractRow(e) {
  return {
    num: e.num,
    gameId: e.gameId,
    isWin: e.isWin ? 1 : 0,
    bookmarked: e.bookmarked ? 1 : 0,
    totalWin: parseFloat(e.totalWin) || 0,
    tumbleCount: e.tumbleCount || 0,
    cascadeCount: e.cascadeCount || 0,
    timestamp: new Date(e.timestamp).getTime() || 0,
    betAmount: parseFloat(e.betAmount) || 0,
    spinMode: e.spinMode || null,
    hasBaseSpin: e.hasBaseSpin ? 1 : 0,
    hasFreeSpin: e.hasFreeSpin ? 1 : 0,
    hasMaxWin: e.hasMaxWin ? 1 : 0,
    hasGolden: e.hasGolden ? 1 : 0,
    isCheatTriggered: e.isCheatTriggered ? 1 : 0,
    entry: JSON.stringify(e),
  };
}

/**
 * Recursively walk a field's `features` object, emitting one {key, value}
 * per scalar leaf (bool/number/string) with `key` as the full dot-path (e.g.
 * "modifier.kind"). Arrays and the objects that contain them are skipped
 * entirely — those can't be flattened into a single indexable scalar value,
 * they stay JS-only via the entry JSON blob (evalFeatureMatchPairs/
 * matchArrayPattern in filters.js already handle them correctly).
 */
export function flattenFeatureLeaves(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) continue;
    if (typeof v === 'object') {
      out.push(...flattenFeatureLeaves(v, path));
    } else {
      out.push({ key: path, value: String(v) });
    }
  }
  return out;
}

function insertFeatureValues(stmt, spinNum, fields) {
  (fields || []).forEach((field, fieldIndex) => {
    if (!field?.features) return;
    for (const { key, value } of flattenFeatureLeaves(field.features)) {
      stmt.bind([spinNum, fieldIndex, key, value]);
      stmt.step();
      stmt.reset();
    }
  });
}

export function bulkInsert(db, entries) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO spins
        (num, gameId, isWin, bookmarked, totalWin, tumbleCount, cascadeCount, timestamp,
         betAmount, spinMode, hasBaseSpin, hasFreeSpin, hasMaxWin, hasGolden, isCheatTriggered, entry)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const e of entries) {
      const r = extractRow(e);
      stmt.bind([
        r.num,
        r.gameId,
        r.isWin,
        r.bookmarked,
        r.totalWin,
        r.tumbleCount,
        r.cascadeCount,
        r.timestamp,
        r.betAmount,
        r.spinMode,
        r.hasBaseSpin,
        r.hasFreeSpin,
        r.hasMaxWin,
        r.hasGolden,
        r.isCheatTriggered,
        r.entry,
      ]);
      stmt.step();
      stmt.reset();
    }
    stmt.finalize();

    // INSERT OR REPLACE can re-save an existing spinNum (e.g. re-import,
    // re-generation) — clear its old featureValues rows first so they don't
    // accumulate stale duplicates alongside the fresh ones below.
    const delFv = db.prepare('DELETE FROM featureValues WHERE spinNum = ?');
    const insFv = db.prepare(
      'INSERT INTO featureValues (spinNum, fieldIndex, key, value) VALUES (?,?,?,?)',
    );
    for (const e of entries) {
      delFv.bind([e.num]);
      delFv.step();
      delFv.reset();
      insertFeatureValues(insFv, e.num, e.fields);
    }
    delFv.finalize();
    insFv.finalize();

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getMetadata(db, key) {
  let value = null;
  db.exec({
    sql: 'SELECT value FROM metadata WHERE key = ?',
    bind: [key],
    rowMode: 'object',
    callback: (row) => (value = row.value),
  });
  return value;
}

function setMetadata(db, key, value) {
  db.exec({
    sql: 'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
    bind: [key, value],
  });
}

/**
 * One-time, chunked backfill of `featureValues` for spins saved before this
 * table existed. Safe to call on every boot: it resumes from
 * `features_backfilled_up_to` and becomes a no-op once that reaches the
 * current max `num` — new spins never need backfilling since bulkInsert
 * populates featureValues at insert time already.
 *
 * Chunked (not one giant transaction) so it never blocks the UI thread for
 * long, and yields between chunks (caller drives the yield via setTimeout).
 * Returns { done, processedUpTo } so the caller knows whether to schedule
 * another chunk.
 */
export function backfillFeatureValuesChunk(db, { batchSize = 500 } = {}) {
  const afterNum = parseInt(getMetadata(db, 'features_backfilled_up_to') || '0', 10);

  const rows = [];
  db.exec({
    sql: 'SELECT num, entry FROM spins WHERE num > ? ORDER BY num ASC LIMIT ?',
    bind: [afterNum, batchSize],
    rowMode: 'object',
    callback: (row) => rows.push(row),
  });

  if (rows.length === 0) {
    setMetadata(db, 'features_backfilled_up_to', String(afterNum));
    return { done: true, processedUpTo: afterNum };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const delFv = db.prepare('DELETE FROM featureValues WHERE spinNum = ?');
    const insFv = db.prepare(
      'INSERT INTO featureValues (spinNum, fieldIndex, key, value) VALUES (?,?,?,?)',
    );
    let lastNum = afterNum;
    for (const row of rows) {
      const entry = JSON.parse(row.entry);
      delFv.bind([row.num]);
      delFv.step();
      delFv.reset();
      insertFeatureValues(insFv, row.num, entry.fields);
      lastNum = row.num;
    }
    delFv.finalize();
    insFv.finalize();
    setMetadata(db, 'features_backfilled_up_to', String(lastNum));
    db.exec('COMMIT;');
    return { done: rows.length < batchSize, processedUpTo: lastNum };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export const ORDER_COLUMNS = new Set(['num', 'totalWin', 'cascadeCount']);

/**
 * Fetch one page of rows matching whereSql+params, keyset-paginated on the
 * requested indexed column (num/totalWin/cascadeCount) with `num` as a stable
 * tiebreaker. `totalWin`/`cascadeCount` use SQLite's row-value comparison
 * (`(col, num) < (?, ?)`) so pagination stays correct even with duplicate
 * values — this is what makes win_desc/cascade_desc real resumable indexed
 * pagination instead of a full-scan-then-sort.
 *
 * cursor: null (first page) or { afterVal, afterNum } from the previous page's
 * nextCursor. For column === 'num', afterVal is unused (num is its own key).
 *
 * `explain: true` returns the EXPLAIN QUERY PLAN text instead of running the
 * real query — used by tests to prove indexes are actually used.
 */
export function searchChunk(db, { whereSql, params, cursor, chunkSize, orderBy, explain = false }) {
  const { column, dir } = orderBy || { column: 'num', dir: 'DESC' };
  if (!ORDER_COLUMNS.has(column)) throw new Error(`Invalid orderBy column: ${column}`);
  const dirSql = dir === 'ASC' ? 'ASC' : 'DESC';
  const cmp = dirSql === 'DESC' ? '<' : '>';

  let sql, bind;
  if (column === 'num') {
    const afterNum = cursor ? cursor.afterNum : null;
    sql =
      `SELECT entry, num FROM spins WHERE ${whereSql} AND (? IS NULL OR num ${cmp} ?) ` +
      `ORDER BY num ${dirSql} LIMIT ?`;
    bind = [...params, afterNum, afterNum, chunkSize];
  } else {
    const afterVal = cursor ? cursor.afterVal : null;
    const afterNum = cursor ? cursor.afterNum : null;
    sql =
      `SELECT entry, num, ${column} as _val FROM spins WHERE ${whereSql} ` +
      `AND (? IS NULL OR (${column}, num) ${cmp} (?, ?)) ` +
      `ORDER BY ${column} ${dirSql}, num ${dirSql} LIMIT ?`;
    bind = [...params, afterVal, afterVal, afterNum, chunkSize];
  }

  if (explain) {
    const plan = [];
    db.exec({
      sql: `EXPLAIN QUERY PLAN ${sql}`,
      bind,
      rowMode: 'object',
      callback: (row) => plan.push(row.detail),
    });
    return plan;
  }

  const entries = [];
  let lastNum = null;
  let lastVal = null;
  db.exec({
    sql,
    bind,
    rowMode: 'object',
    callback: (row) => {
      entries.push(JSON.parse(row.entry));
      lastNum = row.num;
      lastVal = column === 'num' ? row.num : row._val;
    },
  });

  return {
    entries,
    nextCursor: lastNum == null ? null : { afterVal: lastVal, afterNum: lastNum },
    exhausted: entries.length < chunkSize,
  };
}

export function count(db, { gameId }) {
  let c = 0;
  if (gameId) {
    db.exec({
      sql: 'SELECT COUNT(*) as c FROM spins WHERE gameId = ?',
      bind: [gameId],
      rowMode: 'object',
      callback: (row) => (c = row.c),
    });
  } else {
    db.exec({
      sql: 'SELECT COUNT(*) as c FROM spins',
      rowMode: 'object',
      callback: (row) => (c = row.c),
    });
  }
  return c;
}

export function getNextSpinNum(db) {
  let next = 1;
  db.exec({
    sql: 'SELECT MAX(num) as m FROM spins',
    rowMode: 'object',
    callback: (row) => (next = (row.m || 0) + 1),
  });
  return next;
}

export function toggleBookmark(db, { num, state }) {
  let entry = null;
  db.exec({
    sql: 'SELECT entry FROM spins WHERE num = ?',
    bind: [num],
    rowMode: 'object',
    callback: (row) => (entry = row.entry),
  });
  if (!entry) return;
  const parsed = JSON.parse(entry);
  parsed.bookmarked = !!state;
  db.exec({
    sql: 'UPDATE spins SET entry = ?, bookmarked = ? WHERE num = ?',
    bind: [JSON.stringify(parsed), state ? 1 : 0, num],
  });
}

export function deleteBatch(db, nums) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const stmt = db.prepare('DELETE FROM spins WHERE num = ?');
    const fvStmt = db.prepare('DELETE FROM featureValues WHERE spinNum = ?');
    for (const num of nums) {
      stmt.bind([num]);
      stmt.step();
      stmt.reset();
      fvStmt.bind([num]);
      fvStmt.step();
      fvStmt.reset();
    }
    stmt.finalize();
    fvStmt.finalize();
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function clearGame(db, { gameId }) {
  db.exec({
    sql: 'DELETE FROM featureValues WHERE spinNum IN (SELECT num FROM spins WHERE gameId = ?)',
    bind: [gameId],
  });
  db.exec({ sql: 'DELETE FROM spins WHERE gameId = ?', bind: [gameId] });
}

export function clearAll(db) {
  db.exec('DELETE FROM featureValues');
  db.exec('DELETE FROM spins');
}

/** Fingerprints for dedup-on-import: `${timestamp}_${summary.coins}_${fields.length}` across every game. */
export function fingerprints(db) {
  const out = [];
  db.exec({
    sql: `SELECT
            json_extract(entry, '$.timestamp') as t,
            json_extract(entry, '$.summary.coins') as c,
            json_array_length(entry, '$.fields') as l
          FROM spins`,
    rowMode: 'object',
    callback: (row) => out.push(`${row.t}_${row.c}_${row.l}`),
  });
  return out;
}
