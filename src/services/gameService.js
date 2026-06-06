/**
 * Game Service
 *
 * Handles cross-cutting game concerns: version checks, storage stats,
 * backend health, and app boot orchestration.
 */
import {
  loadAllSpins,
  loadSpinsCursor,
  saveAllSpins,
  migrateFromLocalStorage,
  getSpinCount,
  clearAllSpins,
  getNextSpinNum,
} from '../db.js';
import { game, switchGame } from '../store/gameStore.js';
import {
  globalHistory,
  setGlobalHistory,
  activeFilters,
  setActiveFilters,
  rebuildSortedList,
  replaceHistory,
  MAX_RAM_HISTORY,
  setSortField,
  lastLoadedKey,
  setLastLoadedKey,
  setTotalDbCount,
} from '../store/historyStore.js';
import { currentSpinIndex, setCurrentSpinIndex } from '../store/sessionStore.js';
import { showLoading, hideLoading, apiUrl, setApiUrl, pushToast } from '../store/uiStore.js';
import { loadSpin, isSettleField, getSpinStats } from './spinService.js';
import { FILTER_DEFS } from '../filters.js';
import { convertMongoRoundToSpins } from './mongoRoundConverter.js';

// ── Filter Update (DB Search) ─────────────────────────────────────────────────

/** Abort controller for the in-flight search — cancelled if filters change */
let _searchAbort = null;

export async function triggerFilterUpdate() {
  // Cancel any running search immediately
  if (_searchAbort) {
    _searchAbort.abort();
  }
  _searchAbort = new AbortController();
  const { signal } = _searchAbort;

  showLoading('Searching database...', -1);
  try {
    localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    const { loadAllSpins: loadAll, searchEntireDb, getSpinCount } = await import('../db.js');

    const count = await getSpinCount(game().id);
    setTotalDbCount(count);

    const hasActive = activeFilters.some((f) => !f.disabled);
    const spins = hasActive
      ? await searchEntireDb(activeFilters, game(), 5000, signal)
      : await loadAll(game().id, MAX_RAM_HISTORY);

    if (signal.aborted) return; // a newer search took over — discard these results

    replaceHistory(spins);
    rebuildSortedList();
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error('Filter search error:', err);
    pushToast({ type: 'error', title: 'Search Failed', message: err.message });
  } finally {
    if (!signal.aborted) {
      hideLoading();
      _searchAbort = null;
    }
  }
}

// ── Backend Health ────────────────────────────────────────────────────────────

export async function checkBackendHealth(url) {
  if (!url) return { status: 'idle', text: '' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/service/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
      body: JSON.stringify({
        gameCode: game()?.gameCode || 'LGS-008',
        id: 'cascading-game-tester',
        cashBet: '80',
        currencyDec: 2,
        stakes: [{ type: 'commonGame' }],
        rtpOption: 'RTP_97',
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { status: 'ok', text: '✓ Reachable' }
      : { status: 'error', text: `✗ Error ${res.status}` };
  } catch {
    return { status: 'error', text: '✗ Unreachable' };
  }
}

// ── Version Check ─────────────────────────────────────────────────────────────

async function getDeployVersion() {
  try {
    const res = await fetch('/?t=' + Date.now(), { method: 'HEAD' });
    return res.headers.get('X-Worker-Version-Id');
  } catch {
    return null;
  }
}

export async function checkVersionOnLoad() {
  const serverVersion = await getDeployVersion();
  if (!serverVersion) return;

  const stored = localStorage.getItem('app_version');
  if (!stored) {
    localStorage.setItem('app_version', serverVersion);
    return;
  }
  if (stored !== serverVersion) {
    if (localStorage.getItem('skip_update') !== serverVersion) {
      pushToast({
        type: 'update',
        title: 'New Version Available',
        message: 'Update deployed',
        serverVersion,
        autoDismiss: false,
      });
    }
  }
}

export async function checkVersionPeriodic() {
  const serverVersion = await getDeployVersion();
  if (!serverVersion) return;
  const stored = localStorage.getItem('app_version');
  if (stored && serverVersion !== stored && localStorage.getItem('skip_update') !== serverVersion) {
    pushToast({
      type: 'update',
      title: 'Update Available',
      message: 'Update deployed',
      serverVersion,
      autoDismiss: false,
    });
  }
}

// ── Auto-detect Backend ───────────────────────────────────────────────────────

export async function autoDetectBackend() {
  if (window.location.hostname === 'localhost' && !localStorage.getItem('api_url')) {
    try {
      const resp = await fetch('/api/ip');
      const { ip } = await resp.json();
      if (ip && ip !== '127.0.0.1') {
        const url = `http://${ip}:9000`;
        setApiUrl(url);
        console.log('Auto-detected local Backend URL:', url);
      }
    } catch (e) {
      console.warn('Auto-detection failed:', e);
    }
  }
}

// ── Settings Restore (from Import) ───────────────────────────────────────────

export function restoreSettingsFromImport(settings, filters) {
  if (Array.isArray(filters)) {
    setActiveFilters(filters);
    localStorage.setItem('active_filters', JSON.stringify(filters));
  }

  if (!settings) return;

  const importGameId = settings.activeGame || localStorage.getItem('active_game_id');
  if (importGameId) switchGame(importGameId);

  if (settings.requestBody) {
    localStorage.setItem('request_body', settings.requestBody);
  }
  if (settings.playMode) localStorage.setItem('play_mode', settings.playMode);
  if (settings.playCount) localStorage.setItem('play_count', settings.playCount);
}

// ── Default Data Load ─────────────────────────────────────────────────────────

export async function loadDefaultData(manual = false) {
  const isLoaded = localStorage.getItem('default_data_loaded');
  if (isLoaded && !manual) return;

  if (!manual) {
    const count = await getSpinCount();
    if (count > 0) {
      localStorage.setItem('default_data_loaded', 'true');
      return;
    }
  }

  showLoading('Loading default history...', 0);
  try {
    const resp = await fetch('/json_files/default_data.json');
    if (!resp.ok) {
      hideLoading();
      return;
    }

    const firstData = await resp.json();
    const allHistory = firstData.h || [];

    if (firstData.f && (activeFilters.length === 0 || manual)) {
      setActiveFilters(firstData.f);
      localStorage.setItem('active_filters', JSON.stringify(firstData.f));
    }
    if (firstData.o) {
      localStorage.setItem('sort_field', firstData.o);
      setSortField(firstData.o);
    }

    if (allHistory.length > 0) {
      showLoading(`Importing ${allHistory.length} spins...`, 80);
      const mapped = allHistory
        .map((entry, idx) => {
          const r = entry.rawData || entry.r || entry;
          if (!r) return null;

          // Mongo round: has roundEvents instead of step — use the converter
          if (r.roundEvents) {
            const targetGameId = entry.gameId || entry.g || null;
            const { entries } = convertMongoRoundToSpins(
              r,
              entry.num || entry.n || idx + 1,
              targetGameId,
            );
            if (!entries || entries.length === 0) return null;
            const e = entries[0];
            return {
              ...e,
              gameId: targetGameId || e.gameId,
              bookmarked: entry.b || entry.bookmarked || false,
              description: entry.desc || entry.description || null,
              hasGolden: entry.hg || entry.hasGolden || false,
            };
          }

          if (!r.step) return null;

          let spinType = 'basic';
          const fields = [];
          const fieldMetadata = [];
          const playgroundStats = [];
          let playgroundCounter = 0;

          (r.step.gamePhases || []).forEach((phase) => {
            if (phase.type === 'freeSpin') spinType = 'freeSpin';
            let roundCounter = 0;
            (phase.playgrounds || []).forEach((pg) => {
              let pgTumbles = 0,
                pgCascades = 0;
              (pg.fields || []).forEach((f) => {
                fields.push(f);
                fieldMetadata.push({
                  playgroundIndex: playgroundCounter,
                  isFreeSpin: phase.type === 'freeSpin',
                  roundIndex: roundCounter,
                });
                pgTumbles++;
                if (parseInt(f.coins || 0) > 0) pgCascades++;
              });
              playgroundStats.push({
                tumbleCount: pgTumbles,
                cascadeCount: pgCascades,
                headerText:
                  phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
              });
              playgroundCounter++;
              roundCounter++;
            });
          });

          const summary = r.step.summary;
          const metaPublic = r.meta?.public || r.step?.meta?.public || {};
          const stats = getSpinStats(fields, game().wildSymbolId);

          return {
            num: entry.num || entry.n || idx + 1,
            timestamp: entry.timestamp || entry.t || new Date().toISOString(),
            gameId: entry.gameId || entry.g || game().id,
            rawData: r,
            isCheatTriggered: r.meta?.private?.isCheatTriggered === true,
            fields,
            summary,
            fieldMetadata,
            playgroundStats,
            isWin: parseInt(summary.coins || 0) > 0,
            totalWin: summary.coins || 0,
            tumbleCount: fields.length,
            cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
            betAmount: metaPublic.betAmount || 0,
            spinMode: metaPublic.spinMode || 'std',
            spinType,
            playgroundCount: playgroundCounter,
            roundTags: r.roundTags || r.step?.roundTags || [],
            choices: r.choices || r.step?.choices || [],
            bookmarked: entry.b || entry.bookmarked || false,
            description: entry.desc || entry.description || null,
            hasGolden: entry.hg || entry.hasGolden || false,
            hasBaseSpin: entry.hbs || entry.hasBaseSpin || false,
            hasFreeSpin: entry.hfs || entry.hasFreeSpin || false,
            hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
            goldenTransformed: stats.goldenTransformed,
            maxMultiplier: stats.maxMultiplier,
          };
        })
        .filter(Boolean);

      await saveAllSpins(mapped);
    }

    const s = firstData.s || {};
    if (!s.activeGame)
      s.activeGame = firstData.s?.activeGame || localStorage.getItem('active_game_id');
    restoreSettingsFromImport(s, firstData.f);
    if (firstData.o) {
      localStorage.setItem('sort_field', firstData.o);
      setSortField(firstData.o);
    }

    localStorage.setItem('default_data_loaded', 'true');
    showLoading('Default history loaded!', 100);

    setTimeout(() => {
      hideLoading();
      if (manual) location.reload();
    }, 800);
  } catch (err) {
    console.error('Failed to load default data:', err);
    hideLoading();
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export async function boot() {
  await migrateFromLocalStorage();
  await loadDefaultData();

  // Ensure request body defaults to active game's default if not set
  if (!localStorage.getItem('request_body')) {
    const g = game();
    if (g.defaultRequestBody) {
      localStorage.setItem('request_body', JSON.stringify(g.defaultRequestBody, null, 2));
    }
  }

  const { getSpinCount } = await import('../db.js');
  const count = await getSpinCount(game().id);
  setTotalDbCount(count);

  const spins = await loadSpinsCursor(game().id, null, MAX_RAM_HISTORY);
  replaceHistory(spins);
  rebuildSortedList();
  if (spins.length > 0) setLastLoadedKey(spins[spins.length - 1].num);

  console.log(`Boot: Loaded ${spins.length} spins from IndexedDB for game "${game().id}".`);

  if (globalHistory.length > 0) {
    const lastIdx = localStorage.getItem('last_spin_index');
    const startIdx = lastIdx !== null && globalHistory[parseInt(lastIdx)] ? parseInt(lastIdx) : 0;
    await loadSpin(startIdx);
  }

  checkVersionOnLoad();
  setInterval(checkVersionPeriodic, 10 * 60 * 1000);
  autoDetectBackend();
}

// ── Load More (cursor pagination) ────────────────────────────────────────────

export async function loadMoreSpins() {
  const key = lastLoadedKey();
  if (key == null) return;

  showLoading('Loading more spins...', 0);
  try {
    const spins = await loadSpinsCursor(game().id, key, MAX_RAM_HISTORY);
    if (spins.length === 0) return;

    setGlobalHistory((prev) => [...prev, ...spins]);
    rebuildSortedList();
    setLastLoadedKey(spins[spins.length - 1].num);
  } finally {
    hideLoading();
  }
}

// ── Clear History ─────────────────────────────────────────────────────────────

export async function clearCurrentGame() {
  showLoading(`Clearing ${game().name}...`, 50);
  try {
    const { clearSpinsForGame } = await import('../db.js');
    await clearSpinsForGame(game().id);
    setGlobalHistory((prev) => prev.filter((s) => s.gameId !== game().id));
    setCurrentSpinIndex(-1);
    rebuildSortedList();
  } finally {
    hideLoading();
  }
}

export async function clearAllHistory() {
  showLoading('Nuking entire database...', 50);
  try {
    await clearAllSpins();
    setGlobalHistory([]);
    setCurrentSpinIndex(-1);
    rebuildSortedList();
  } finally {
    hideLoading();
  }
}

export async function clearFilteredHistory(filtered) {
  if (!filtered.length) return;
  showLoading(`Deleting ${filtered.length} spins...`, 50);
  try {
    const { deleteSpinsBatch } = await import('../db.js');
    const numsSet = new Set(filtered.map((s) => s.num));
    await deleteSpinsBatch([...numsSet]);
    setGlobalHistory((prev) => prev.filter((s) => !numsSet.has(s.num)));
    rebuildSortedList();
  } finally {
    hideLoading();
  }
}

export async function clearAllDataAndReload(skipConfirm = false) {
  if (!skipConfirm && !confirm('Are you sure you want to clear ALL data? This cannot be undone.'))
    return;
  showLoading('Clearing data and updating...');
  try {
    localStorage.clear();
    await clearAllSpins();
    location.reload(true);
  } catch (err) {
    console.error('Failed to clear data:', err);
    alert('An error occurred while clearing data.');
    hideLoading();
  }
}
