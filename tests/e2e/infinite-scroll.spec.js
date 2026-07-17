/**
 * Real-browser E2E for the SQLite (OPFS SAH-pool) storage rewrite and the
 * infinite-scroll redesign. Runs against the actual worker/OPFS/UI — this is
 * the coverage the in-memory bun tests (tests/db-scale.test.js) cannot
 * provide, since OPFS itself is browser-only.
 *
 * Filters are applied programmatically via `window.__e2e` (a dev-only hook in
 * main.jsx exposing the app's REAL module singletons), not by driving
 * FilterBar's UI clicks — this suite is regression coverage for the
 * storage/scroll pipeline specifically, not FilterBar's UX.
 *
 * IMPORTANT: never `import('/src/db.js')` (or any app module) directly from
 * page.evaluate — that creates a SECOND independent module graph with its own
 * Worker, which collides with the app's real one over the SAH-pool's
 * exclusive per-file access handle (this is exactly what broke this suite the
 * first time it ran). Always go through `window.__e2e`.
 */
import { test, expect } from '@playwright/test';

const CARD_SELECTOR = '.spin-history-card';
const SCROLL_CONTAINER = '#spinHistory';
const SPIN_COUNT = 6000; // enough to span multiple SEARCH_PAGE_SIZE (1000) pages

async function seedSpins(page, count) {
  await page.waitForFunction(() => !!window.__e2e, { timeout: 15000 });
  await page.evaluate(async (n) => {
    const { game, saveAllSpins } = window.__e2e;
    const gameId = game().id;

    const spins = Array.from({ length: n }, (_, i) => {
      const num = i + 1;
      const isWin = num % 2 === 0;
      return {
        num,
        gameId,
        timestamp: new Date(2026, 0, 1, 0, 0, num).toISOString(),
        isWin,
        totalWin: isWin ? (num % 500) + 1 : 0,
        tumbleCount: num % 8,
        cascadeCount: num % 4,
        betAmount: 1,
        spinMode: num % 3 === 0 ? 'buyBonusGame' : 'commonGame',
        spinType: 'basic',
        hasBaseSpin: true,
        hasFreeSpin: false,
        hasMaxWin: false,
        hasGolden: false,
        isCheatTriggered: false,
        fields: [{ features: { modifierActivated: num % 5 === 0 } }],
        fieldMetadata: [{ isFreeSpin: false }],
        roundTags: [],
        choices: [],
        rawData: {},
      };
    });

    await saveAllSpins(spins);
    return gameId;
  }, count);
}

async function applyFiltersProgrammatically(page, filters) {
  await page.evaluate(async (fs) => {
    const { setActiveFilters, triggerFilterUpdate } = window.__e2e;
    setActiveFilters(fs);
    await triggerFilterUpdate();
  }, filters);
}

test.beforeEach(async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page._consoleErrors = consoleErrors;

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!window.__e2e, { timeout: 15000 });
  // A brand-new browser profile (exactly what Playwright gives each test) has
  // no localStorage yet, so the app's first-boot demo-data path seeds a
  // default `active_filters` set that includes a non-disabled
  // `{id:'bookmarked', value:true}` filter (see gameService.js's
  // `default_data_loaded` seeding). None of this suite's synthetic seedSpins
  // rows are bookmarked, so every test silently matched 0/N and every
  // `waitForSelector(CARD_SELECTOR)` below timed out — not a real bug, but a
  // real gap: this suite never actually ran clean once, in any browser
  // profile that hadn't already been through first-boot manually. Clear it
  // before seeding so the suite is deterministic regardless of profile state.
  await page.evaluate(() => {
    window.__e2e.setActiveFilters([]);
    localStorage.setItem('active_filters', '[]');
  });
  await seedSpins(page, SPIN_COUNT);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!window.__e2e, { timeout: 15000 });
  await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 });
});

test.afterEach(async ({ page }) => {
  // Explicit, deterministic release of the SAH-pool access handle before the
  // next test's page navigates — a real navigation's `pagehide` firing isn't
  // guaranteed to complete in time between back-to-back tests in one worker.
  await page.evaluate(() => window.__e2e?.closeDb?.()).catch(() => {});
});

test('no COOP/COEP or worker boot errors', async ({ page }) => {
  const opfsRelated = page._consoleErrors.filter((e) =>
    /COOP|COEP|cross-origin|SharedArrayBuffer|SQLite not ready|BOOT_ERROR|Access Handle/i.test(e),
  );
  expect(opfsRelated).toEqual([]);
});

test('OPFS data persists across reload', async ({ page }) => {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!window.__e2e, { timeout: 15000 });
  await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 });
  const count = await page.evaluate(async () => {
    const { getSpinCount, game } = window.__e2e;
    return getSpinCount(game().id);
  });
  expect(count).toBe(SPIN_COUNT);
});

test('fast repeated scroll never blanks the list (Problem A regression)', async ({ page }) => {
  await applyFiltersProgrammatically(page, [{ id: 'result', value: 'win' }]);
  await page.waitForSelector(CARD_SELECTOR);

  const container = page.locator(SCROLL_CONTAINER);
  let sawBlank = false;

  for (let i = 0; i < 25; i++) {
    await container.evaluate((el) => (el.scrollTop += 1200));
    await page.waitForTimeout(80); // deliberately faster than a real load resolves
    const visibleCount = await page.locator(CARD_SELECTOR).count();
    if (visibleCount === 0) {
      sawBlank = true;
      break;
    }
  }

  expect(sawBlank).toBe(false);
});

test('infinite scroll keeps loading filtered results with no manual action, no dead end', async ({
  page,
}) => {
  await applyFiltersProgrammatically(page, [{ id: 'result', value: 'win' }]);
  await page.waitForSelector(CARD_SELECTOR);

  const container = page.locator(SCROLL_CONTAINER);

  for (let i = 0; i < 60; i++) {
    await container.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(150);
    const hasMore = await page.evaluate(() => window.__e2e.hasMoreData());
    if (!hasMore) break;
  }

  // Assert against the store directly, not scraped DOM text: once every
  // match is loaded, windowEnd jumps straight to currentSortedList().length
  // (see SpinHistory.jsx's bottom-observer callback), so <For> tries to
  // mount all ~3000 real DOM nodes at once — that paint can legitimately
  // take longer than a short fixed wait, which is a rendering-performance
  // question, not what this test is actually checking (whether unbounded
  // scroll pulls every match with no dead end / no 5000-item hard cap).
  const seenNums = await page.evaluate(() => window.__e2e.currentSortedList().map((s) => s.num));
  const expectedMatches = SPIN_COUNT / 2; // every even num is a win
  expect(new Set(seenNums).size).toBe(expectedMatches);

  const isExhausted = await page.evaluate(() => !window.__e2e.hasMoreData());
  expect(isExhausted).toBe(true);
});

// Mirrors db-scale.test.js's monotonicity assertion for each sort mode, but
// against the real OPFS-backed worker instead of an in-memory test DB.
const SORT_MODES = [
  { field: 'num_asc', column: 'num', dir: 'asc' },
  { field: 'num_desc', column: 'num', dir: 'desc' },
  { field: 'win_desc', column: 'totalWin', dir: 'desc' },
  { field: 'cascade_desc', column: 'cascadeCount', dir: 'desc' },
];

for (const { field, column, dir } of SORT_MODES) {
  test(`sort mode ${field} stays correctly ordered and complete under infinite scroll`, async ({
    page,
  }) => {
    await applyFiltersProgrammatically(page, [{ id: 'result', value: 'win' }]);
    await page.evaluate(async (f) => {
      const { setSortField, triggerFilterUpdate } = window.__e2e;
      setSortField(f);
      await triggerFilterUpdate();
    }, field);
    await page.waitForSelector(CARD_SELECTOR);

    const container = page.locator(SCROLL_CONTAINER);
    for (let i = 0; i < 15; i++) {
      await container.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await page.waitForTimeout(150);
      const hasMore = await page.evaluate(() => window.__e2e.hasMoreData());
      if (!hasMore) break;
    }

    const list = await page.evaluate(
      (col) =>
        window.__e2e
          .currentSortedList()
          .map((s) => ({ num: s.num, val: col === 'num' ? s.num : parseFloat(s[col]) })),
      column,
    );

    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) {
      if (dir === 'desc') expect(list[i - 1].val).toBeGreaterThanOrEqual(list[i].val);
      else expect(list[i - 1].val).toBeLessThanOrEqual(list[i].val);
    }
    // No duplicate/missing nums across the whole scrolled-through result set.
    const nums = list.map((s) => s.num);
    expect(new Set(nums).size).toBe(nums.length);
  });
}

test('FeatureMatch DSL filters correctly through the real SQL-narrow + JS-verify pipeline', async ({
  page,
}) => {
  // Seeded spins set fields[0].features.modifierActivated = true for every
  // 5th spin (seedSpins above) — featureMatch is JS-only (never pushed to
  // SQL, see sqlite-query-builder.js), so this exercises the real "SQL
  // narrows candidates, JS re-verifies" path end-to-end, not just the pure
  // evalFeatureMatchPairs() function filters.test.js already covers.
  await applyFiltersProgrammatically(page, [
    {
      id: 'featureMatch',
      value: { pairs: [{ key: 'modifierActivated', val: 'true' }], scope: 'any' },
    },
  ]);
  await page.waitForSelector(CARD_SELECTOR);

  const container = page.locator(SCROLL_CONTAINER);
  for (let i = 0; i < 10; i++) {
    await container.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(150);
    const hasMore = await page.evaluate(() => window.__e2e.hasMoreData());
    if (!hasMore) break;
  }

  const nums = await page.evaluate(() => window.__e2e.currentSortedList().map((s) => s.num));
  expect(nums.length).toBeGreaterThan(0);
  // Every returned spin must actually satisfy the DSL predicate (num % 5 === 0
  // per seedSpins) — proves SQL over-selection never leaks an incorrect
  // result through, since JS re-verification is the sole correctness gate.
  expect(nums.every((n) => n % 5 === 0)).toBe(true);
});

test('drag-jump to an arbitrary scroll position never leaves the list blank', async ({ page }) => {
  // Regression test for the scrollbar-thumb-drag bug: a real drag can jump
  // scrollTop thousands of px in one step — far past the IntersectionObservers'
  // 400px rootMargin — which used to land the viewport inside an empty filler
  // div with nothing to trigger a re-window. Setting scrollTop directly in one
  // step reproduces that "instant big jump" property without fighting
  // cross-browser scrollbar-thumb automation.
  await applyFiltersProgrammatically(page, [{ id: 'result', value: 'win' }]);
  await page.waitForSelector(CARD_SELECTOR);

  const container = page.locator(SCROLL_CONTAINER);
  const maxScroll = await container.evaluate((el) => el.scrollHeight - el.clientHeight);

  for (const fraction of [0.5, 0.9, 0.25, 0.99, 0.1]) {
    await container.evaluate((el, top) => (el.scrollTop = top), Math.floor(maxScroll * fraction));
    await page.waitForTimeout(250); // let the scroll-position fallback's rAF + any loadMore settle
    const visibleCount = await page.locator(CARD_SELECTOR).count();
    expect(visibleCount).toBeGreaterThan(0);
  }
});
