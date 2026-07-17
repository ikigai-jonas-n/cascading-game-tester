/**
 * UntilFilter correctness suite — the match/stop decision itself, not scale.
 *
 * Deliberately NOT about bulk scanning perf/index behavior (db-scale.test.js
 * covers that). This pins two things that actually broke this session:
 *  1. The match predicate's exact semantics (disabled/unknown/throwing filters).
 *  2. The worker-overrun bug: workers used to keep firing real spins after a
 *     match because spin-worker.js had no way to learn "stop now" mid-batch.
 */
import { describe, test, expect, mock } from 'bun:test';

// spinService.js transitively imports db.js (browser-only: window.addEventListener,
// localStorage, indexedDB at module scope) and the store modules (localStorage at
// module scope for persisted signals, plus game-registry.js's `import.meta.glob` —
// a Vite build-time construct with no meaning under plain `bun test`). None of that
// runs under bun's Node-like test environment by default. Stub the minimum surface
// touched at import time, purely so the module graph loads — nothing here is
// exercised by matchesUntilFilter/findUntilFilterMatch, which touch neither.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener: () => {} };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}
if (typeof globalThis.indexedDB === 'undefined') {
  globalThis.indexedDB = { deleteDatabase: () => {} };
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { hardwareConcurrency: 4 };
}

mock.module('../src/game-registry.js', () => ({
  register: () => {},
  listGames: () => [],
  getGame: () => undefined,
  getActiveGame: () => ({ id: 'sexy-fruits', winCategories: {} }),
  setActiveGame: () => {},
}));

const { matchesUntilFilter, findUntilFilterMatch } = await import('../src/services/spinService.js');

const GAME_CONFIG = { id: 'sexy-fruits', winCategories: { BIG_WIN: 10, MEGA_WIN: 50 } };

function entry(overrides = {}) {
  return { num: 1, isWin: true, totalWin: 100, betAmount: 1, ...overrides };
}

describe('matchesUntilFilter', () => {
  test('single filter, match', () => {
    expect(
      matchesUntilFilter(entry({ isWin: true }), [{ id: 'result', value: 'win' }], GAME_CONFIG),
    ).toBe(true);
  });

  test('single filter, no match', () => {
    expect(
      matchesUntilFilter(entry({ isWin: false }), [{ id: 'result', value: 'win' }], GAME_CONFIG),
    ).toBe(false);
  });

  test('multiple filters AND together — all must match', () => {
    const filters = [
      { id: 'result', value: 'win' },
      { id: 'minTumbles', value: '3' },
    ];
    expect(matchesUntilFilter(entry({ isWin: true, tumbleCount: 5 }), filters, GAME_CONFIG)).toBe(
      true,
    );
    expect(matchesUntilFilter(entry({ isWin: true, tumbleCount: 1 }), filters, GAME_CONFIG)).toBe(
      false,
    );
  });

  test('disabled filter is ignored entirely', () => {
    const filters = [{ id: 'result', value: 'win', disabled: true }];
    expect(matchesUntilFilter(entry({ isWin: false }), filters, GAME_CONFIG)).toBe(true);
  });

  test('unknown filter id passes through (never blocks a match)', () => {
    const filters = [{ id: 'madeUpFilter', value: 'x' }];
    expect(matchesUntilFilter(entry(), filters, GAME_CONFIG)).toBe(true);
  });

  test('a filter whose apply() throws is treated as no-match, not a crash', () => {
    const originalMap = matchesUntilFilterThrowsSetup();
    try {
      const filters = [{ id: '__throwing_test_filter__', value: 'x' }];
      expect(() => matchesUntilFilter(entry(), filters, GAME_CONFIG)).not.toThrow();
      expect(matchesUntilFilter(entry(), filters, GAME_CONFIG)).toBe(false);
    } finally {
      originalMap.restore();
    }
  });
});

// Injects a throwing filter def into the real FILTER_DEFS_MAP for one test,
// then restores it — avoids depending on FILTER_DEFS having a throwing entry
// by coincidence, and avoids mocking the whole filters module.
function matchesUntilFilterThrowsSetup() {
  // Lazily require here so the import only happens for this one test.
  const { FILTER_DEFS_MAP } = require('../src/filters.js');
  const had = FILTER_DEFS_MAP.has('__throwing_test_filter__');
  FILTER_DEFS_MAP.set('__throwing_test_filter__', {
    id: '__throwing_test_filter__',
    apply: () => {
      throw new Error('boom');
    },
  });
  return {
    restore: () => {
      if (!had) FILTER_DEFS_MAP.delete('__throwing_test_filter__');
    },
  };
}

describe('findUntilFilterMatch', () => {
  test('stops at the FIRST matching entry in batch order, not the last', () => {
    const filters = [{ id: 'result', value: 'win' }];
    const results = [
      entry({ num: 1, isWin: false }),
      entry({ num: 2, isWin: true }),
      entry({ num: 3, isWin: true }),
    ];
    const match = findUntilFilterMatch(results, filters, GAME_CONFIG);
    expect(match.num).toBe(2);
  });

  test('returns null when no active (non-disabled) filters exist', () => {
    const results = [entry({ num: 1, isWin: true })];
    expect(findUntilFilterMatch(results, [], GAME_CONFIG)).toBeNull();
    expect(
      findUntilFilterMatch(results, [{ id: 'result', value: 'win', disabled: true }], GAME_CONFIG),
    ).toBeNull();
  });

  test('returns null when nothing in the batch matches', () => {
    const filters = [{ id: 'result', value: 'win' }];
    const results = [entry({ num: 1, isWin: false }), entry({ num: 2, isWin: false })];
    expect(findUntilFilterMatch(results, filters, GAME_CONFIG)).toBeNull();
  });
});

describe('spin-worker.js overrun fix — stop signal actually halts mid-batch', () => {
  test('a stop message sent mid-batch yields fewer results than the requested batchSize', async () => {
    const listeners = [];
    const originalSelf = globalThis.self;
    const originalFetch = globalThis.fetch;
    const originalPostMessage = globalThis.postMessage;

    let resolveFirstFetch;
    const firstFetchStarted = new Promise((r) => (resolveFirstFetch = r));

    globalThis.self = {
      set onmessage(fn) {
        listeners.push(fn);
      },
      get onmessage() {
        return listeners[listeners.length - 1];
      },
      postMessage: (msg) => globalThis.postMessage(msg),
    };

    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      resolveFirstFetch();
      // Slow enough that the test can inject the stop message before this
      // (or the next) spin's request resolves.
      await new Promise((r) => setTimeout(r, 30));
      return {
        json: async () => ({
          data: { finished: true, choices: [], step: { gamePhases: [], summary: { coins: 0 } } },
        }),
      };
    };

    const posted = [];
    globalThis.postMessage = (msg) => posted.push(msg);

    try {
      // Fresh module instance per test run isn't possible without cache-busting
      // (bun caches ES module imports), so bust via a query param — this file
      // is a Worker script with no other side effects on import besides
      // registering `self.onmessage`.
      const mod = await import(`../src/spin-worker.js?t=${Date.now()}-${Math.random()}`);
      const onmessage = globalThis.self.onmessage;
      expect(typeof onmessage).toBe('function');

      const batchSize = 10;
      const messagePromise = onmessage({
        data: {
          apiUrl: 'http://test.local',
          config: {},
          gameCode: 'sexy-fruits',
          playerId: 'p1',
          gameId: 'sexy-fruits',
          wildSymbolId: null,
          startNum: 1,
          batchSize,
        },
      });

      await firstFetchStarted;
      onmessage({ data: { stop: true } });

      await messagePromise;

      expect(posted.length).toBe(1);
      expect(posted[0].results.length).toBeLessThan(batchSize);
      expect(fetchCount).toBeLessThan(batchSize);
    } finally {
      globalThis.self = originalSelf;
      globalThis.fetch = originalFetch;
      globalThis.postMessage = originalPostMessage;
    }
  });
});
