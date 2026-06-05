/**
 * Spin Service
 *
 * All spin-execution logic: single spins, batch workers, playback control.
 * Reads from stores for config; writes back results via store setters.
 * Zero DOM access — pure data + side-effect coordination.
 */
import { saveSpin, saveAllSpins, getNextSpinNum } from '../db.js';
import { game } from '../store/gameStore.js';
import {
  gameState,
  setGameState,
  currentSpinIndex,
  setCurrentSpinIndex,
  setAutoPlayRunning,
  autoPlayRunning,
  playbackInterval,
  setPlaybackInterval,
  playbackSpeed,
  isAutoReplay,
  isAutoplayOnSelect,
  showDoubleGrid,
  singleViewMode,
} from '../store/sessionStore.js';
import {
  globalHistory,
  setGlobalHistory,
  prependSpins,
  rebuildSortedList,
  MAX_RAM_HISTORY,
  currentSortedList,
  activeFilters,
} from '../store/historyStore.js';
import {
  apiUrl,
  playerId,
  showLoading,
  hideLoading,
  setAutoStatus,
  pushToast,
  setChoicePromptOpen,
  setChoicePromptChoices,
} from '../store/uiStore.js';
import { FILTER_DEFS } from '../filters.js';
import { openRawDrawer, updatePlaybackLabels, syncPlaybackUI } from './drawerService.js';

// ── Auto-play abort handles ───────────────────────────────────────────────────
let _autoPlayController = null;
let _currentWorkers = [];
let _resolveAutoPlay = null;

export function stopAutoPlay() {
  setAutoPlayRunning(false);
  if (_autoPlayController) {
    _autoPlayController.abort();
    _autoPlayController = null;
  }
  _currentWorkers.forEach((w) => w.terminate());
  _currentWorkers = [];
  if (_resolveAutoPlay) {
    _resolveAutoPlay();
    _resolveAutoPlay = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function parseSmartNumber(val) {
  if (!val) return 0;
  const match = String(val)
    .toLowerCase()
    .trim()
    .match(/^(\d+\.?\d*)([km]?)$/);
  if (!match) return parseInt(val) || 0;
  const num = parseFloat(match[1]);
  if (match[2] === 'k') return Math.floor(num * 1000);
  if (match[2] === 'm') return Math.floor(num * 1000000);
  return Math.floor(num);
}

export function getWinCategory(win, bet) {
  const g = game();
  if (bet <= 0 || !g.winCategories) return 'NONE';
  const tb = win / bet;
  const sorted = Object.entries(g.winCategories).sort((a, b) => b[1] - a[1]);
  for (const [catName, threshold] of sorted) {
    if (tb >= threshold) return catName;
  }
  return 'NONE';
}

export function isSettleField(field) {
  if (field.features && 'isSettle' in field.features) return field.features.isSettle === true;
  return true;
}

export function getFieldEffectiveWin(field) {
  const raw = parseFloat(field.coins || 0);
  if (!raw) return 0;
  const val = isSettleField(field) ? raw * (field.features?.cumulativeMultiplier || 1) : raw;
  return parseFloat(val.toFixed(2));
}

export function getSpinStats(fields, wildSymbolId) {
  if (!fields || !wildSymbolId) return { totalGolden: 0, maxMultiplier: 1 };
  let totalGolden = 0;
  let maxMultiplier = 1;
  fields.forEach((f) => {
    const payoutPositions = new Set();
    (f.symbols.payouts || []).forEach((p) => {
      if (Array.isArray(p.positions)) p.positions.forEach((pos) => payoutPositions.add(pos));
    });
    const goldenArray = f.features?.golden || [];
    goldenArray.forEach((pos) => {
      if (payoutPositions.has(pos)) totalGolden++;
    });
    const m = f.features?.cumulativeMultiplier || 1;
    if (m > maxMultiplier) maxMultiplier = m;
  });
  return { goldenTransformed: totalGolden, maxMultiplier };
}

function extractFields(data) {
  const fields = [];
  const fieldMetadata = [];
  const playgroundStats = [];
  let hasBaseSpin = false;
  let hasFreeSpin = false;
  let playgroundCounter = 0;

  (data.step?.gamePhases || []).forEach((phase) => {
    if (phase.type === 'baseSpin') hasBaseSpin = true;
    if (phase.type === 'freeSpin') hasFreeSpin = true;
    let roundCounter = 0;
    (phase.playgrounds || []).forEach((pg) => {
      let pgTumbles = 0;
      let pgCascades = 0;
      (pg.fields || []).forEach((f) => {
        fields.push(f);
        fieldMetadata.push({
          playgroundIndex: playgroundCounter,
          isFreeSpin: phase.type === 'freeSpin',
          roundIndex: roundCounter,
        });
        pgTumbles++;
        if (parseFloat(f.coins || 0) > 0 && isSettleField(f)) pgCascades++;
      });
      playgroundStats.push({
        tumbleCount: pgTumbles,
        cascadeCount: pgCascades,
        headerText: phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
      });
      playgroundCounter++;
      roundCounter++;
    });
  });

  return {
    fields,
    fieldMetadata,
    playgroundStats,
    hasBaseSpin,
    hasFreeSpin,
    playgroundCount: playgroundCounter,
  };
}

function getMappedRequest(config) {
  const cheatRaw = localStorage.getItem('test_config');
  let testConfig = null;
  if (cheatRaw) {
    try {
      testConfig = JSON.parse(cheatRaw);
    } catch (e) {}
  }
  return {
    play: { ...config, gameCode: game().gameCode, id: playerId() },
    testConfig,
  };
}

// ── Spin Execution ────────────────────────────────────────────────────────────

let _choiceResolve = null;

/** Called by ChoicePromptModal when user picks a choice */
export function resolveChoice(choiceId) {
  if (_choiceResolve) {
    _choiceResolve(choiceId);
    _choiceResolve = null;
  }
}

async function promptUserForChoice(availableChoices) {
  setChoicePromptChoices(availableChoices);
  setChoicePromptOpen(true);
  return new Promise((resolve) => {
    _choiceResolve = resolve;
  });
}

export async function fireSpinRequest(config, isInteractive = false) {
  const reqBody = { ...config, gameCode: game().gameCode, id: playerId() };

  const makeRequest = async (body) => {
    const response = await fetch(`${apiUrl()}/v1/service/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await response.json();
    if (!response.ok || json.error) {
      const msg =
        json.error?.message || json.message || response.statusText || 'Unknown Server Error';
      pushToast({ type: 'error', title: 'API Error', message: `[${response.status}]: ${msg}` });
      throw new Error(`API Error: ${msg}`);
    }
    if (!json.data) throw new Error('Invalid API Response: Missing data object');
    return json.data;
  };

  let data = await makeRequest(reqBody);

  if (data.finished === false && data.choices && data.choices.length > 0) {
    let allPhases = [...(data.step?.gamePhases || [])];
    const baseSpinPhases =
      data.step?.gamePhases ?? data.roundEvents?.playResult?.step?.gamePhases ?? [];
    const hasTriggerFreeSpin = baseSpinPhases.some((phase) =>
      (phase.playgrounds ?? []).some((pg) =>
        (pg.fields ?? []).some((field) => field.features?.triggerFreeSpin === true),
      ),
    );
    const baseGameWin = hasTriggerFreeSpin
      ? (data.step?.summary?.coins ?? data.roundEvents?.playResult?.step?.summary?.coins ?? 0)
      : null;

    let isFirstChain = true;
    while (data.finished === false && data.choices && data.choices.length > 0) {
      let nextChoice;
      if (data.choices.length === 1) {
        nextChoice = data.choices[0];
      } else {
        nextChoice = isInteractive ? await promptUserForChoice(data.choices) : data.choices[0];
      }

      let nextBody = { ...reqBody, choice: nextChoice };
      if (isFirstChain && baseGameWin !== null) {
        nextBody = {
          ...nextBody,
          meta: { ...nextBody.meta, private: { ...nextBody.meta?.private, baseGameWin } },
        };
      }
      isFirstChain = false;

      const nextData = await makeRequest(nextBody);
      if (nextData.step?.gamePhases) allPhases = allPhases.concat(nextData.step.gamePhases);
      data = nextData;
    }
    if (data.step) data.step.gamePhases = allPhases;
  }

  return data;
}

function buildSpinEntry(data, num, description = null) {
  const { fields, fieldMetadata, playgroundStats, hasBaseSpin, hasFreeSpin, playgroundCount } =
    extractFields(data);
  const summary = data.step.summary;
  const metaPublic = data.meta?.public || data.step?.meta?.public || {};
  const config = JSON.parse(localStorage.getItem('request_body') || '{}');
  const stats = getSpinStats(fields, game().wildSymbolId);

  return {
    num,
    timestamp: new Date().toISOString(),
    gameId: game().id,
    rawData: data,
    isCheatTriggered: data.meta?.private?.isCheatTriggered === true,
    fields,
    summary,
    isWin: parseInt(summary.coins || 0) > 0,
    totalWin: summary.coins || 0,
    tumbleCount: fields.length,
    cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0 && isSettleField(f)).length,
    betAmount: metaPublic.betAmount || 0,
    spinMode: metaPublic.spinMode || 'unknown',
    spinType: hasFreeSpin ? 'freeSpin' : 'baseSpin',
    hasBaseSpin,
    hasFreeSpin,
    playgroundCount,
    roundTags: data.roundTags || data.step?.roundTags || [],
    choices: data.choices || data.step?.choices || [],
    hasMaxWin: !!(summary.hasMaxWin || data.hasMaxWin),
    goldenTransformed: stats.goldenTransformed,
    maxMultiplier: stats.maxMultiplier,
    fieldMetadata,
    playgroundStats,
    description: description || null,
    requestBody: getMappedRequest(config),
  };
}

export async function playSingleSpin(overrideConfig = null, description = null) {
  const config = overrideConfig || JSON.parse(localStorage.getItem('request_body') || '{}');
  const data = await fireSpinRequest(config, true);
  const nextNum = await getNextSpinNum();
  const entry = buildSpinEntry(data, nextNum, description);
  await saveSpin(entry);
  prependSpins([entry]);
  return entry;
}

// ── Load Spin ─────────────────────────────────────────────────────────────────

export async function loadSpin(historyIndex) {
  const spin = globalHistory[historyIndex];
  if (!spin) return;

  if (spin._isCompressed && spin.rawData instanceof ArrayBuffer) {
    const { decompressData } = await import('../db.js');
    spin.rawData = await decompressData(spin.rawData);
    spin._isCompressed = false;
  }

  const lastHistoryIndex = parseInt(localStorage.getItem('last_spin_index') || '-1', 10);
  let tumbleIdx = 0;
  if (historyIndex === lastHistoryIndex) {
    const savedTumbleStr = localStorage.getItem('last_tumble_index');
    tumbleIdx = savedTumbleStr ? parseInt(savedTumbleStr, 10) : 0;
    tumbleIdx = Math.min(Math.max(0, tumbleIdx), spin.fields.length - 1);
  }

  setCurrentSpinIndex(historyIndex);
  localStorage.setItem('last_spin_index', historyIndex);

  setGameState({
    fields: spin.fields,
    summary: spin.summary,
    currentIndex: tumbleIdx,
    isAnimating: false,
  });

  let acc = 0;
  setGameState(
    'accumulatedWins',
    spin.fields.map((f) => {
      acc += isSettleField(f) ? getFieldEffectiveWin(f) : 0;
      return acc;
    }),
  );

  const persistentGolden = spin.fields.map((f) => new Set(f.features?.golden || []));
  setGameState('goldenCandidates', persistentGolden);
  spin.hasGolden = persistentGolden.some((set) => set.size > 0);

  if (isAutoplayOnSelect()) {
    startSpinPlayback();
  } else {
    // If not autoplaying, select the restored tumbleIdx (or 0 if none restored)
    selectTumble(tumbleIdx, 'initial');
    updatePlaybackLabels();
    syncPlaybackUI();
  }

  rebuildSortedList();
  openSpinRaw(historyIndex);
  updatePlaybackLabels();
}

// ── Tumble Navigation ─────────────────────────────────────────────────────────

export function selectTumble(tIdx, phase) {
  showTumble(tIdx, phase);
  const spin = globalHistory[currentSpinIndex()];
  if (!spin) return;
  const field = spin.fields[tIdx];

  const initialArr = field.symbols.initial || field.symbols.final || [];
  const finalArr = field.symbols.final || [];

  const diff = initialArr.map((val, i) => {
    const finalVal = finalArr[i];
    const r = i % game().grid.rows;
    const c = Math.floor(i / game().grid.rows);
    const coord = `(c${c}, r${r})`;
    if (val !== finalVal) return `${val} -> ${finalVal}, ${coord}`;
    return `${val}`;
  });

  const tabs = [{ label: `TUMBLE_${tIdx + 1}_FIELD`, data: field }];
  if (spin.isCheatTriggered === true)
    tabs.push({ label: 'TESTCONFIG', data: spin.requestBody?.testConfig || {} });
  tabs.push(
    { label: 'FULL_JSON', data: spin.rawData },
    { label: 'FEATURES', data: field.features || {} },
    { label: 'PAYOUTS', data: field.symbols.payouts || [] },
    { label: 'INIT-FINAL DIFF', data: diff },
    { label: 'INITIAL[]', data: initialArr },
    { label: 'FINAL[]', data: finalArr },
  );

  openRawDrawer(tabs);
  updatePlaybackLabels();
}

export function showTumble(index, phase) {
  setGameState('currentIndex', index);
  localStorage.setItem('last_tumble_index', index);

  const resolvedPhase = showDoubleGrid()
    ? 'final'
    : (phase ?? (singleViewMode() === 'initial' ? 'initial' : 'final'));
  setGameState('currentFramePhase', resolvedPhase);
}

// ── Frame / Round Navigation ──────────────────────────────────────────────────

export function navigateFrame(direction) {
  const maxTumble = (gameState.fields?.length || 1) - 1;
  const tIdx = gameState.currentIndex;
  const phase = gameState.currentFramePhase;

  if (showDoubleGrid()) {
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) selectTumble(next);
    return;
  }
  if (singleViewMode() === 'final') {
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) selectTumble(next, 'final');
    return;
  }
  if (singleViewMode() === 'initial') {
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) selectTumble(next, 'initial');
    return;
  }
  if (direction === 1) {
    if (phase === 'initial') selectTumble(tIdx, 'final');
    else if (tIdx < maxTumble) selectTumble(tIdx + 1, 'initial');
  } else {
    if (phase === 'final') selectTumble(tIdx, 'initial');
    else if (tIdx > 0) selectTumble(tIdx - 1, 'final');
  }
}

export function navigateRound(direction) {
  const spin = globalHistory[currentSpinIndex()];
  if (!spin || spin.fields.length === 0) return;

  const meta = spin.fieldMetadata?.[gameState.currentIndex];
  const currentRound = meta ? meta.playgroundIndex : 0;
  const playgroundCount = spin.playgroundStats ? spin.playgroundStats.length : 1;

  let targetRound = Math.max(0, Math.min(playgroundCount - 1, currentRound + direction));
  if (targetRound === currentRound) return;

  const firstTumbleIdx = (spin.fieldMetadata || []).findIndex(
    (m) => m.playgroundIndex === targetRound,
  );
  if (firstTumbleIdx !== -1) selectTumble(firstTumbleIdx);
}

export function navigateSpinFiltered(direction) {
  const sorted = currentSortedList();
  if (!sorted.length) return;

  const currentIdxInFiltered = sorted.findIndex(
    (spin) => globalHistory.indexOf(spin) === currentSpinIndex(),
  );
  let nextIndex = currentIdxInFiltered === -1 ? 0 : currentIdxInFiltered + direction;
  if (nextIndex < 0 || nextIndex >= sorted.length) return;

  const nextSpin = sorted[nextIndex];
  const originalIdx = globalHistory.indexOf(nextSpin);
  loadSpin(originalIdx);
}

// ── Playback ──────────────────────────────────────────────────────────────────

export function startSpinPlayback() {
  stopPlayback();
  setGameState({ currentIndex: 0, currentFramePhase: 'initial' });
  selectTumble(0, 'initial');

  const delay = 800 / playbackSpeed();
  const id = setInterval(() => stepPlayback(1), delay);
  setPlaybackInterval(id);
  syncPlaybackUI();
}

export function stopPlayback() {
  const id = playbackInterval();
  if (id) {
    clearInterval(id);
    setPlaybackInterval(null);
  }
  syncPlaybackUI();
}

export function togglePlayback() {
  if (playbackInterval()) {
    stopPlayback();
  } else {
    const isAtEnd =
      gameState.currentIndex >= (gameState.fields?.length || 0) - 1 &&
      gameState.currentFramePhase === 'final';
    if (isAtEnd) {
      startSpinPlayback();
    } else {
      const id = setInterval(() => stepPlayback(1), 800 / playbackSpeed());
      setPlaybackInterval(id);
    }
  }
  syncPlaybackUI();
}

export function stepPlayback(direction = 1) {
  if (direction === 1) {
    if (gameState.currentFramePhase === 'initial') {
      setGameState('currentFramePhase', 'final');
    } else if (gameState.currentIndex < (gameState.fields?.length || 0) - 1) {
      setGameState({ currentIndex: gameState.currentIndex + 1, currentFramePhase: 'initial' });
    } else {
      stopPlayback();
      if (isAutoReplay()) setTimeout(startSpinPlayback, 1200);
      return;
    }
  } else {
    if (gameState.currentFramePhase === 'final') {
      setGameState('currentFramePhase', 'initial');
    } else if (gameState.currentIndex > 0) {
      setGameState({ currentIndex: gameState.currentIndex - 1, currentFramePhase: 'final' });
    }
  }
  selectTumble(gameState.currentIndex, gameState.currentFramePhase);
  updatePlaybackLabels();
  syncPlaybackUI();
}

// ── openSpinRaw ───────────────────────────────────────────────────────────────

export async function openSpinRaw(historyIndex) {
  const spin = globalHistory[historyIndex];
  if (!spin) return;

  let displayRawData = spin.rawData;
  if (spin._isCompressed && displayRawData instanceof ArrayBuffer) {
    const { decompressData } = await import('../db.js');
    displayRawData = await decompressData(displayRawData);
  }

  openRawDrawer([
    { label: 'FULL_RESPONSE', data: displayRawData },
    { label: 'SUMMARY', data: spin.summary },
    { label: 'TESTCONFIG', data: spin.requestBody?.testConfig || {} },
  ]);
}

// ── Multi-spin play mode ──────────────────────────────────────────────────────

export async function playSpin({
  config,
  mode,
  playCount,
  targetConditions,
  targetConditionLogic,
  targetCountLimit,
  cheatTemplates,
}) {
  if (gameState.isAnimating || autoPlayRunning()) return;

  if (mode === 'single') {
    const entry = await playSingleSpin(config);
    rebuildSortedList();
    await loadSpin(0);
    return;
  }

  if (mode === 'allCheatTemplates') {
    if (!cheatTemplates?.length) {
      pushToast({ type: 'error', title: 'No templates', message: 'Cheat templates not loaded.' });
      return;
    }
    const originalTestConfig = localStorage.getItem('test_config');
    _autoPlayController = new AbortController();
    setAutoPlayRunning(true);
    try {
      for (let i = 0; i < cheatTemplates.length; i++) {
        if (!autoPlayRunning()) break;
        const t = cheatTemplates[i];
        setAutoStatus(`Running cheat ${i + 1}/${cheatTemplates.length}: ${t.title}`);

        let parsed;
        try {
          parsed = JSON.parse(t.json);
        } catch {
          continue;
        }
        parsed.configId = playerId();
        parsed.gameCode = game().gameCode;

        const cheatRes = await fetch(`${apiUrl()}/v1/test/test-config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-signature': 'rgs-local-signature',
            accept: '*/*',
          },
          body: JSON.stringify(parsed),
          signal: _autoPlayController.signal,
        });
        if (!cheatRes.ok) {
          console.error(`Skipping ${t.title}`);
          continue;
        }

        localStorage.setItem('test_config', JSON.stringify(parsed));
        await playSingleSpin(config, t.title);
      }
      setAutoStatus(`Done: ${cheatTemplates.length} cheat templates`);
    } catch (err) {
      pushToast({ type: 'error', title: 'Template Error', message: err.message });
    } finally {
      setAutoPlayRunning(false);
      const params = new URLSearchParams({
        gameCode: game().gameCode,
        configId: playerId(),
        playerId: playerId(),
      });
      fetch(`${apiUrl()}/v1/test/test-config?${params}`, {
        method: 'DELETE',
        headers: { 'x-signature': 'rgs-local-signature' },
      }).catch(() => {});
      if (originalTestConfig) localStorage.setItem('test_config', originalTestConfig);
      else localStorage.removeItem('test_config');
      rebuildSortedList();
      await loadSpin(0);
    }
    return;
  }

  // ── Worker pipeline ──────────────────────────────────────────────────────
  setAutoPlayRunning(true);
  const maxSpins = mode === 'count' ? parseSmartNumber(playCount) : 100000000;
  let count = 0;
  const startTime = performance.now();
  let targetHitCount = 0;
  let targetHitMap = {};
  targetConditions?.forEach((c) => (targetHitMap[c] = 0));

  try {
    const { getNextSpinNum, saveAllSpins } = await import('../db.js');
    let baseNum = await getNextSpinNum();

    const coreCount = navigator.hardwareConcurrency || 4;
    const workers = Array.from(
      { length: coreCount },
      () => new Worker(new URL('../spin-worker.js', import.meta.url), { type: 'module' }),
    );
    _currentWorkers = workers;

    let activeWorkers = 0;
    let lastRenderTime = performance.now();
    let limitReached = false;

    await new Promise((resolve) => {
      _resolveAutoPlay = resolve;
      const dispatchWork = () => {
        if (!autoPlayRunning() || count >= maxSpins || limitReached) {
          if (activeWorkers === 0) resolve();
          return;
        }
        while (
          activeWorkers < coreCount &&
          count < maxSpins &&
          autoPlayRunning() &&
          !limitReached
        ) {
          const worker = workers[activeWorkers % coreCount];
          const batchSize = Math.min(maxSpins - count, 50);
          worker.postMessage({
            apiUrl: apiUrl(),
            config,
            gameCode: game().gameCode,
            playerId: playerId(),
            gameId: game().id,
            wildSymbolId: game().wildSymbolId,
            startNum: baseNum,
            batchSize,
          });
          baseNum += batchSize;
          count += batchSize;
          activeWorkers++;
        }
      };

      workers.forEach((worker) => {
        worker.onmessage = async (e) => {
          activeWorkers--;
          const { results } = e.data;

          // Stop was pressed — drain without processing, resolve when all in-flight done
          if (!autoPlayRunning()) {
            if (activeWorkers === 0) resolve();
            return;
          }

            if (results?.length > 0) {
              await saveAllSpins(results);

              // If stopped while saving to DB, abort before overwriting status
              if (!autoPlayRunning()) return;

              if (mode === 'untilConditionN' && targetConditions?.length > 0) {
                for (const entry of results) {
                  const category = getWinCategory(entry.totalWin, entry.betAmount);
                  if (targetConditions.includes(category)) {
                    if (targetConditionLogic === 'OR') {
                      targetHitCount++;
                      if (targetHitCount >= targetCountLimit) {
                        limitReached = true;
                        setAutoPlayRunning(false);
                        break;
                      }
                    } else {
                      targetHitMap[category]++;
                      if (targetConditions.every((c) => targetHitMap[c] >= targetCountLimit)) {
                        limitReached = true;
                        setAutoPlayRunning(false);
                        break;
                      }
                    }
                  }
                }
              }

              if (mode === 'untilFilter' && activeFilters.some((f) => !f.disabled)) {
                for (const entry of results) {
                  const isMatch = activeFilters.every((af) => {
                    if (af.disabled) return true;
                    const def = FILTER_DEFS.find((d) => d.id === af.id);
                    return def ? def.apply(entry, af.value, game()) : true;
                  });
                  if (isMatch) {
                    limitReached = true;
                    setAutoPlayRunning(false);
                    break;
                  }
                }
              }

              if (mode === 'untilWin' && results.some((e) => e.isWin)) {
                limitReached = true;
                setAutoPlayRunning(false);
              }
              if (mode === 'untilLoss' && results.some((e) => !e.isWin)) {
                limitReached = true;
                setAutoPlayRunning(false);
              }

              // Update RAM history with OOM protection
              setGlobalHistory((prev) => {
                const next = [...results.reverse(), ...prev];
                if (next.length > MAX_RAM_HISTORY) next.length = MAX_RAM_HISTORY;
                return next;
              });
            }

            if (!autoPlayRunning()) return;

            const now = performance.now();
            const rps = (count / ((now - startTime) / 1000)).toFixed(1);
            setAutoStatus(`Processing: ${count} / ${maxSpins} (${rps} spins/sec)`);

            if (now - lastRenderTime > 1500) {
              rebuildSortedList();
              lastRenderTime = now;
            }

            dispatchWork();
        };
      });

      dispatchWork();
    });

    workers.forEach((w) => w.terminate());
    _currentWorkers = [];
    _resolveAutoPlay = null;
  } catch (err) {
    console.error(err);
    pushToast({ type: 'error', title: 'Auto-play Error', message: err.message });
  } finally {
    setAutoPlayRunning(false);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    setAutoStatus(`Done: ${count} in ${elapsed}s`);
    rebuildSortedList();
    if (globalHistory.length > 0) await loadSpin(0);
  }
}
