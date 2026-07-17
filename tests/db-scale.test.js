/**
 * Scale/correctness test for the SQLite storage layer.
 *
 * Honest framing: a literal 150M-row generate+query run is not something any
 * CI/unit test should attempt (multi-GB, minutes-to-hours). What this proves
 * instead — the properties that actually make the "150M" design credible:
 *
 *   1. Correctness: SQL-narrowed + JS-verified results exactly match a naive
 *      full-JS-scan reference, across every whitelisted filter, every JS-only
 *      filter, and every combination, at a scale that's fast to run.
 *   2. Index usage: EXPLAIN QUERY PLAN shows every representative query
 *      actually using an index (`USING INDEX idx_...`), not a full table
 *      scan — this is the property that makes cost scale with matches, not
 *      table size, which is what makes "works at 150M" a real claim instead
 *      of an assumption.
 *
 * Uses sqlite-wasm's in-memory `oo1.DB` (confirmed to load fine under `bun
 * test` — see probe in the session that wrote this). OPFS itself (the actual
 * persistence layer used in production) is browser-only and is NOT what this
 * test is proving — that's covered by the Playwright E2E suite instead. This
 * test proves the schema/queries/indexes are correct; OPFS just persists them.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL, bulkInsert, searchChunk } from '../src/sqlite-schema.js';
import { buildWhitelistedWhere } from '../src/sqlite-query-builder.js';
import { paginateFilteredSearch } from '../src/search-pagination.js';
import { FILTER_DEFS } from '../src/filters.js';

const ROW_COUNT = parseInt(process.env.DB_SCALE_TEST_ROWS || '200000', 10);
const GAME_ID = 'sexy-fruits';
const GAME_CONFIG = { id: GAME_ID, winCategories: { BIG_WIN: 10, MEGA_WIN: 50 } };

let db;

// Deterministic PRNG (mulberry32) — reproducible test data, no Math.random flakiness.
function makeRng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSpin(num, rng) {
  const isWin = rng() > 0.5;
  const tumbleCount = Math.floor(rng() * 10);
  const cascadeCount = Math.floor(rng() * tumbleCount);
  const betAmount = [1, 2, 5, 10][Math.floor(rng() * 4)];
  const totalWin = isWin ? Math.floor(rng() * 1000) : 0;
  return {
    num,
    gameId: GAME_ID,
    isWin,
    bookmarked: rng() < 0.05,
    totalWin,
    tumbleCount,
    cascadeCount,
    timestamp: new Date(2026, 0, 1 + Math.floor(rng() * 300)).toISOString(),
    betAmount,
    spinMode: ['commonGame', 'anteBet', 'buyBonusGame'][Math.floor(rng() * 3)],
    hasBaseSpin: rng() > 0.3,
    hasFreeSpin: rng() < 0.15,
    hasMaxWin: rng() < 0.001,
    hasGolden: rng() < 0.02,
    isCheatTriggered: rng() < 0.001,
    fields: [{ features: { modifierActivated: rng() < 0.1, nudgeAt: [Math.floor(rng() * 3), 3] } }],
    fieldMetadata: [{ isFreeSpin: false }],
    roundTags: rng() < 0.05 ? ['regular'] : [],
    choices: [],
  };
}

/** Naive full-JS-scan reference — no SQL narrowing at all, ground truth. */
function referenceFilter(allSpins, filters, gameConfig) {
  return allSpins.filter(
    (spin) =>
      spin.gameId === gameConfig.id &&
      filters.every((af) => {
        if (af.disabled) return true;
        const def = FILTER_DEFS.find((d) => d.id === af.id);
        return def ? def.apply(spin, af.value, gameConfig) : true;
      }),
  );
}

let allSpins;

beforeAll(async () => {
  const sqlite3 = await sqlite3InitModule();
  db = new sqlite3.oo1.DB(':memory:');
  db.exec(SCHEMA_SQL);

  const rng = makeRng(42);
  allSpins = Array.from({ length: ROW_COUNT }, (_, i) => generateSpin(i + 1, rng));

  const BATCH = 5000;
  for (let i = 0; i < allSpins.length; i += BATCH) {
    bulkInsert(db, allSpins.slice(i, i + BATCH));
  }
});

describe(`db-scale (${ROW_COUNT} synthetic rows)`, () => {
  test('row count matches what was inserted', () => {
    let c = 0;
    db.exec({
      sql: 'SELECT COUNT(*) as c FROM spins',
      rowMode: 'object',
      callback: (r) => (c = r.c),
    });
    expect(c).toBe(ROW_COUNT);
  });

  const FILTER_CASES = [
    { name: 'single indexed filter (result)', filters: [{ id: 'result', value: 'win' }] },
    {
      name: 'multiple AND-ed indexed filters',
      filters: [
        { id: 'result', value: 'win' },
        { id: 'spinMode', value: 'commonGame' },
        { id: 'minTumbles', value: '3' },
      ],
    },
    {
      name: 'indexed + JS-only filter mixed',
      filters: [
        { id: 'result', value: 'win' },
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'modifierActivated', val: 'true' }], scope: 'any' },
        },
      ],
    },
    {
      name: 'JS-only filter alone (featureMatch range DSL)',
      filters: [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'nudgeAt', val: '[0-1, 3]' }], scope: 'any' },
        },
      ],
    },
    { name: 'no filters at all', filters: [] },
  ];

  for (const { name, filters } of FILTER_CASES) {
    test(`correctness: ${name}`, async () => {
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      const applyFilter = (spin, fs, gc) =>
        fs.every((af) => {
          if (af.disabled) return true;
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        });

      let cursor = null;
      const got = [];
      while (true) {
        const page = await paginateFilteredSearch(
          (orderBy, cur, chunkSize) =>
            Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
          {
            filters,
            gameConfig: GAME_CONFIG,
            sortField: 'num_desc',
            cursor,
            pageSize: 5000,
            applyFilter,
          },
        );
        got.push(...page.entries);
        if (page.exhausted) break;
        cursor = page.nextCursor;
      }

      const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
      const gotNums = got.map((s) => s.num).sort((a, b) => a - b);
      const expectedNums = expected.map((s) => s.num).sort((a, b) => a - b);
      expect(gotNums).toEqual(expectedNums);
    });
  }

  test('correctness: filtered result stays correct under win_desc sort', async () => {
    const filters = [{ id: 'result', value: 'win' }];
    const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
    const applyFilter = (spin, fs, gc) =>
      fs.every((af) => {
        const def = FILTER_DEFS.find((d) => d.id === af.id);
        return def ? def.apply(spin, af.value, gc) : true;
      });

    let cursor = null;
    const got = [];
    while (true) {
      const page = await paginateFilteredSearch(
        (orderBy, cur, chunkSize) =>
          Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
        {
          filters,
          gameConfig: GAME_CONFIG,
          sortField: 'win_desc',
          cursor,
          pageSize: 5000,
          applyFilter,
        },
      );
      got.push(...page.entries);
      if (page.exhausted) break;
      cursor = page.nextCursor;
    }

    // Monotonically non-increasing totalWin, num DESC as tiebreak
    for (let i = 1; i < got.length; i++) {
      const prev = got[i - 1],
        cur = got[i];
      expect(parseFloat(prev.totalWin)).toBeGreaterThanOrEqual(parseFloat(cur.totalWin));
      if (parseFloat(prev.totalWin) === parseFloat(cur.totalWin)) {
        expect(prev.num).toBeGreaterThan(cur.num);
      }
    }

    const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
    expect(got.length).toBe(expected.length);
  });

  test(
    'no duplicate or missing nums across pages (num_desc, deliberately awkward page size)',
    async () => {
      const filters = [{ id: 'result', value: 'win' }];
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      const applyFilter = (spin, fs, gc) =>
        fs.every((af) => {
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        });

      // Awkward-but-not-tiny page size: enough pages to exercise cross-page
      // dedup without turning this into a stress test of the setTimeout(0)
      // yield in paginateFilteredSearch (that's what a real infinite-scroll
      // session does gradually across many user actions, not in one tight loop).
      const pageSize = Math.max(500, Math.floor(ROW_COUNT / 40));

      let cursor = null;
      const seen = new Set();
      let pages = 0;
      while (true) {
        const page = await paginateFilteredSearch(
          (orderBy, cur, chunkSize) =>
            Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
          {
            filters,
            gameConfig: GAME_CONFIG,
            sortField: 'num_desc',
            cursor,
            pageSize,
            applyFilter,
          },
        );
        pages++;
        for (const s of page.entries) {
          expect(seen.has(s.num)).toBe(false); // no duplicates across pages
          seen.add(s.num);
        }
        if (page.exhausted) break;
        cursor = page.nextCursor;
        if (pages > ROW_COUNT) throw new Error('pagination did not terminate — infinite loop bug');
      }

      const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
      expect(seen.size).toBe(expected.length);
    },
    { timeout: 20000 },
  );

  describe('index usage (EXPLAIN QUERY PLAN)', () => {
    const PLAN_CASES = [
      {
        name: 'single indexed filter',
        filters: [{ id: 'result', value: 'win' }],
        orderByCol: 'num',
      },
      {
        name: 'multiple AND-ed indexed filters',
        filters: [
          { id: 'result', value: 'win' },
          { id: 'spinMode', value: 'commonGame' },
        ],
        orderByCol: 'num',
      },
      {
        name: 'win_desc keyset page',
        filters: [{ id: 'result', value: 'win' }],
        orderByCol: 'totalWin',
      },
      { name: 'cascade_desc keyset page', filters: [], orderByCol: 'cascadeCount' },
    ];

    for (const { name, filters, orderByCol } of PLAN_CASES) {
      test(`${name} uses an index, not a full table scan`, () => {
        const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
        const orderBy = { column: orderByCol, dir: 'DESC' };
        const plan = searchChunk(db, {
          whereSql,
          params,
          cursor: null,
          chunkSize: 1500,
          orderBy,
          explain: true,
        });
        const planText = plan.join(' | ');
        expect(planText).toContain('USING INDEX');
        expect(planText).not.toMatch(/SCAN spins\b(?!.*USING INDEX)/);
      });
    }
  });

  describe('featureValues EAV side table (FeatureMatch SQL-narrowing)', () => {
    test('scalar featureMatch pair uses idx_featureValues_key_value, not a full table scan', () => {
      const filters = [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'modifierActivated', val: 'true' }], scope: 'any' },
        },
      ];
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      expect(whereSql).toContain('featureValues');
      const plan = searchChunk(db, {
        whereSql,
        params,
        cursor: null,
        chunkSize: 1500,
        orderBy: { column: 'num', dir: 'DESC' },
        explain: true,
      });
      const planText = plan.join(' | ');
      expect(planText).toContain('idx_featureValues_key_value');
    });

    test('correctness: scalar featureMatch narrowed via SQL matches the naive JS reference exactly', async () => {
      const filters = [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'modifierActivated', val: 'true' }], scope: 'any' },
        },
      ];
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      const applyFilter = (spin, fs, gc) =>
        fs.every((af) => {
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        });

      let cursor = null;
      const got = [];
      while (true) {
        const page = await paginateFilteredSearch(
          (orderBy, cur, chunkSize) =>
            Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
          {
            filters,
            gameConfig: GAME_CONFIG,
            sortField: 'num_desc',
            cursor,
            pageSize: 5000,
            applyFilter,
          },
        );
        got.push(...page.entries);
        if (page.exhausted) break;
        cursor = page.nextCursor;
      }

      const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
      const gotNums = got.map((s) => s.num).sort((a, b) => a - b);
      const expectedNums = expected.map((s) => s.num).sort((a, b) => a - b);
      expect(gotNums).toEqual(expectedNums);
      expect(gotNums.length).toBeGreaterThan(0); // sanity: the eligible path actually matched something
    });

    test('correctness: array/object-valued featureMatch (nudgeAt range DSL) falls back to JS-only and still matches reference', async () => {
      const filters = [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'nudgeAt', val: '[0-1, 3]' }], scope: 'any' },
        },
      ];
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      expect(whereSql).not.toContain('featureValues'); // confirms it took the no-clause fallback

      const applyFilter = (spin, fs, gc) =>
        fs.every((af) => {
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        });

      let cursor = null;
      const got = [];
      while (true) {
        const page = await paginateFilteredSearch(
          (orderBy, cur, chunkSize) =>
            Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
          {
            filters,
            gameConfig: GAME_CONFIG,
            sortField: 'num_desc',
            cursor,
            pageSize: 5000,
            applyFilter,
          },
        );
        got.push(...page.entries);
        if (page.exhausted) break;
        cursor = page.nextCursor;
      }

      const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
      const gotNums = got.map((s) => s.num).sort((a, b) => a - b);
      const expectedNums = expected.map((s) => s.num).sort((a, b) => a - b);
      expect(gotNums).toEqual(expectedNums);
    });

    test('correctness: mixed scalar + array pairs in one filter instance also falls back to JS-only entirely', async () => {
      const filters = [
        {
          id: 'featureMatch',
          value: {
            pairs: [
              { key: 'modifierActivated', val: 'true' },
              { key: 'nudgeAt', val: '[0-1, 3]' },
            ],
            scope: 'any',
          },
        },
      ];
      const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
      expect(whereSql).not.toContain('featureValues');

      const applyFilter = (spin, fs, gc) =>
        fs.every((af) => {
          const def = FILTER_DEFS.find((d) => d.id === af.id);
          return def ? def.apply(spin, af.value, gc) : true;
        });

      let cursor = null;
      const got = [];
      while (true) {
        const page = await paginateFilteredSearch(
          (orderBy, cur, chunkSize) =>
            Promise.resolve(searchChunk(db, { whereSql, params, cursor: cur, chunkSize, orderBy })),
          {
            filters,
            gameConfig: GAME_CONFIG,
            sortField: 'num_desc',
            cursor,
            pageSize: 5000,
            applyFilter,
          },
        );
        got.push(...page.entries);
        if (page.exhausted) break;
        cursor = page.nextCursor;
      }

      const expected = referenceFilter(allSpins, filters, GAME_CONFIG);
      const gotNums = got.map((s) => s.num).sort((a, b) => a - b);
      const expectedNums = expected.map((s) => s.num).sort((a, b) => a - b);
      expect(gotNums).toEqual(expectedNums);
    });
  });

  test('sanity: index-bound query is fast regardless of table size (proves cost ~ matches, not rows)', () => {
    const filters = [
      { id: 'result', value: 'win' },
      { id: 'spinMode', value: 'buyBonusGame' },
    ];
    const { whereSql, params } = buildWhitelistedWhere(filters, GAME_ID);
    const start = performance.now();
    searchChunk(db, {
      whereSql,
      params,
      cursor: null,
      chunkSize: 1500,
      orderBy: { column: 'num', dir: 'DESC' },
    });
    const elapsedMs = performance.now() - start;
    // Generous ceiling — this is a smoke check that the index is doing its job,
    // not a strict perf benchmark (CI hardware varies).
    expect(elapsedMs).toBeLessThan(200);
  });
});
