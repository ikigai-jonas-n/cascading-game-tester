/**
 * Export / Import Service
 *
 * Handles all data transport: streaming DB exports to disk,
 * JSON file imports, and the cheat-config send/clear API.
 */
import { clearAllSpins, getNextSpinNum, saveAllSpins, iterateDb } from '../db.js';
import { game } from '../store/gameStore.js';
import { globalHistory, activeFilters } from '../store/historyStore.js';
import { showLoading, hideLoading, apiUrl, playerId } from '../store/uiStore.js';
import { currentSpinIndex } from '../store/sessionStore.js';
import { getSpinStats, isSettleField, loadSpin } from './spinService.js';
import { restoreSettingsFromImport, triggerFilterUpdate } from './gameService.js';
import { convertMongoRoundToSpins } from './mongoRoundConverter.js';

function getOptimizedEntry(entry) {
  return {
    n: entry.num,
    t: entry.timestamp,
    g: entry.gameId,
    r: entry.rawData,
    w: entry.isWin,
    v: entry.totalWin,
    b: entry.bookmarked || false,
    desc: entry.description || null,
    hg: entry.hasGolden || false,
    hbs: entry.hasBaseSpin || false,
    hfs: entry.hasFreeSpin || false,
  };
}

export async function exportDataDirectFromDb(defaultFileName, exportMode, isMapped = false) {
  showLoading('Preparing Export...', 0);
  try {
    const { decompressData } = await import('../db.js');
    let processedCount = 0;

    let header, footer;
    if (isMapped) {
      header = '[';
      footer = ']';
    } else {
      const settingsExport = {
        playMode: localStorage.getItem('play_mode') || 'single',
        playCount: localStorage.getItem('play_count') || '10',
        requestBody: localStorage.getItem('request_body') || '',
        activeGame: game().id,
        leftPanelFontSize: localStorage.getItem('left_panel_font_size') || '14',
        rightPanelFontSize: localStorage.getItem('right_panel_font_size') || '12',
        floatingStatsWidth: localStorage.getItem('floating_stats_width') || '200',
        floatingStatsHeight: localStorage.getItem('floating_stats_height') || '200',
      };
      const v2 = {
        v: 2,
        f: activeFilters,
        o: localStorage.getItem('sort_field') || 'num_desc',
        s: settingsExport,
        h: [],
      };
      header = JSON.stringify(v2).split('"h":[]')[0] + '"h":[';
      footer = ']}';
    }

    let writable = null;
    let blobParts = [];
    let useFileSystem = !!window.showSaveFilePicker;

    try {
      if (useFileSystem) {
        const handle = await window.showSaveFilePicker({ suggestedName: defaultFileName });
        writable = await handle.createWritable();
        await writable.write(header);
      } else {
        blobParts.push(header);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        hideLoading();
        return;
      }
      useFileSystem = false;
      blobParts.push(header);
    }

    let hasData = false;
    await iterateDb(exportMode, activeFilters, game(), async (chunkData) => {
      processedCount += chunkData.length;
      showLoading(`Exporting ${processedCount} records...`, 50);

      const decompressed = await Promise.all(
        chunkData.map(async (spin) => {
          if (spin._isCompressed && spin.rawData instanceof ArrayBuffer) {
            return { ...spin, rawData: await decompressData(spin.rawData), _isCompressed: false };
          }
          return spin;
        }),
      );

      let chunkStr = '';
      if (isMapped) {
        const mapped = decompressed.map((s) => ({
          request: s.requestBody || {},
          response: s.rawData || {},
        }));
        chunkStr = JSON.stringify(mapped).slice(1, -1);
      } else {
        chunkStr = JSON.stringify(decompressed.map(getOptimizedEntry)).slice(1, -1);
      }

      if (chunkStr.length > 0) {
        if (hasData) {
          if (useFileSystem) await writable.write(',');
          else blobParts.push(',');
        }
        if (useFileSystem) await writable.write(chunkStr);
        else blobParts.push(chunkStr);
        hasData = true;
      }
    });

    if (useFileSystem) {
      await writable.write(footer);
      await writable.close();
    } else {
      blobParts.push(footer);
      const blob = new Blob(blobParts, { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFileName;
      a.click();
      URL.revokeObjectURL(url);
    }

    showLoading('Export Complete! ✅', 100);
    setTimeout(hideLoading, 1500);
  } catch (e) {
    console.error('Export failed', e);
    alert('Export failed: ' + e.message);
    hideLoading();
  }
}

export function triggerImport(mode) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rawImport = JSON.parse(text);
      let importedRaw = [];

      if (Array.isArray(rawImport)) {
        importedRaw = rawImport;
      } else if (rawImport.v === 2 && Array.isArray(rawImport.h)) {
        importedRaw = rawImport.h;
        if (mode === 'replace') {
          restoreSettingsFromImport(rawImport.s, rawImport.f);
          if (rawImport.o) localStorage.setItem('sort_field', rawImport.o);
        }
      } else {
        alert('Invalid file format');
        return;
      }

      showLoading('Parsing File...');
      const restored = [];
      const chunkSize = 1000;
      for (let i = 0; i < importedRaw.length; i += chunkSize) {
        const percent = Math.round((i / importedRaw.length) * 100);
        showLoading(
          `Processing ${Math.min(i + chunkSize, importedRaw.length)} / ${importedRaw.length}...`,
          percent,
        );
        const chunk = importedRaw
          .slice(i, i + chunkSize)
          .map((item) => {
            const r = item.response || item.rawData || item.r || item;
            if (!r) return null;

            // Handle Mongo imported rounds (rawData has roundEvents instead of step)
            if (r.roundEvents) {
              const targetGameId = item.gameId || item.g || null;
              const { entries } = convertMongoRoundToSpins(
                r,
                item.num || item.n || 0,
                targetGameId,
              );
              if (entries && entries.length > 0) {
                const e = entries[0];
                return {
                  finger: `${e.timestamp}_${e.summary.coins}_${e.fields.length}`,
                  data: {
                    ...e,
                    bookmarked: item.b || item.bookmarked || false,
                    description: item.desc || item.description || null,
                    hasGolden: item.hg || item.hasGolden || false,
                  },
                };
              }
              return null;
            }

            if (!r.step) return null;
            let spinType = 'basic';
            const fields = [],
              fieldMetadata = [],
              playgroundStats = [];
            let playgroundCounter = 0;

            (r.step?.gamePhases || []).forEach((phase) => {
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
                  if (parseFloat(f.coins || 0) > 0) pgCascades++;
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
            const ts = item.timestamp || item.t || new Date().toISOString();
            const metaPublic = r.meta?.public || r.step?.meta?.public || {};
            const stats = getSpinStats(fields, game().wildSymbolId);

            return {
              finger: `${ts}_${summary.coins}_${fields.length}`,
              data: {
                num: item.num || item.n || undefined,
                timestamp: ts,
                gameId: item.gameId || item.g || game().id,
                rawData: r,
                isCheatTriggered: r.meta?.private?.isCheatTriggered === true,
                fields,
                summary,
                fieldMetadata,
                playgroundStats,
                isWin: item.isWin !== undefined ? item.isWin : parseInt(summary.coins || 0) > 0,
                totalWin: item.totalWin !== undefined ? item.totalWin : summary.coins || 0,
                tumbleCount: fields.length,
                cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
                betAmount: metaPublic.betAmount || 0,
                spinMode: metaPublic.spinMode || 'std',
                spinType,
                playgroundCount: playgroundCounter,
                roundTags: r.roundTags || r.step?.roundTags || [],
                choices: r.choices || r.step?.choices || [],
                hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
                goldenTransformed: stats.goldenTransformed,
                maxMultiplier: stats.maxMultiplier,
                bookmarked: item.b || item.bookmarked || false,
                description: item.desc || item.description || null,
                hasGolden: item.hg || item.hasGolden || false,
                hasBaseSpin: item.hbs || item.hasBaseSpin || false,
                hasFreeSpin: item.hfs || item.hasFreeSpin || false,
              },
            };
          })
          .filter(Boolean);
        restored.push(...chunk);
        await new Promise((r) => setTimeout(r, 0));
      }

      showLoading('Saving...', 100);
      let finalEntries = [];

      if (mode === 'replace') {
        await clearAllSpins();
        finalEntries = restored.map((r, i) => ({ ...r.data, num: i + 1 }));
      } else {
        const existingFingers = new Set(
          globalHistory.map((s) => `${s.timestamp}_${s.summary.coins}_${s.fields.length}`),
        );
        const filtered = restored.filter((r) => !existingFingers.has(r.finger));
        const baseNum = await getNextSpinNum();
        finalEntries = filtered.map((r, i) => ({ ...r.data, num: baseNum + i }));
      }

      if (finalEntries.length > 0) await saveAllSpins(finalEntries);

      await triggerFilterUpdate();
      if (globalHistory.length > 0 && currentSpinIndex() === -1) await loadSpin(0);
      hideLoading();

      const skipped = restored.length - finalEntries.length;
      alert(
        mode === 'replace'
          ? `Replaced session with ${finalEntries.length} spins.`
          : `Merged ${finalEntries.length} new spins${skipped > 0 ? ` (skipped ${skipped} duplicates)` : ''}.`,
      );
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  input.click();
}
