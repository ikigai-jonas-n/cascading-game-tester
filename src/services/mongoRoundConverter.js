/**
 * Converts a raw MongoDB Round document into a single SpinHistory card entry.
 * All roundEvents (BaseSpin + FreeSpin phases) are merged into one card.
 */

import { EJSON } from 'bson';
import { getWinCategory, getSpinStats, isSettleField } from './spinService.js';
import { game } from '../store/gameStore.js';

/**
 * Normalizes MongoDB Extended JSON (Compass clipboard) to plain JS primitives.
 * Delegates to the official bson EJSON deserializer which handles all BSON types.
 * Returns plain objects with JS Date → ISO string, ObjectId → string, Decimal128 → number, etc.
 */
function normalizeBson(rawDoc) {
  const deserialized = EJSON.deserialize(rawDoc, { relaxed: true });
  return JSON.parse(
    JSON.stringify(deserialized, (_key, val) => {
      if (val && typeof val === 'object' && typeof val.toHexString === 'function')
        return val.toHexString();
      if (val instanceof Date) return val.toISOString();
      return val;
    }),
  );
}

function extractFieldsFromPlayResult(playResult) {
  const fields = [];
  const fieldMetadata = [];
  const playgroundStats = [];
  let hasFreeSpin = false;
  let playgroundCounter = 0;

  (playResult.step?.gamePhases || []).forEach((phase) => {
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
    hasFreeSpin,
    playgroundCount: playgroundCounter,
  };
}

/**
 * Merges all roundEvents from one MongoDB round into a single SpinHistory card.
 * BaseSpin + all FreeSpin phases combined — playgroundStats retains per-phase labels.
 *
 * @param {object} rawDoc    Raw MongoDB round document
 * @param {number} startNum  Spin number for the card
 * @returns {{ entries: object[], errors: string[] }}
 */
export function convertMongoRoundToSpins(rawDoc, startNum) {
  const roundDoc = normalizeBson(rawDoc);
  const errors = [];

  if (!roundDoc || !Array.isArray(roundDoc.roundEvents)) {
    return { entries: [], errors: ['Invalid round document: missing roundEvents array'] };
  }

  const g = game();

  // Aggregate all phases across all roundEvents into one combined result
  const allFields = [];
  const allFieldMetadata = [];
  const allPlaygroundStats = [];
  let hasFreeSpin = false;
  let hasMaxWin = false;
  let firstMetaPublic = {};
  let allChoices = [];

  roundDoc.roundEvents.forEach((event) => {
    const pr = event.playResult;
    if (!pr || !pr.step) return;

    const {
      fields,
      fieldMetadata,
      playgroundStats,
      hasFreeSpin: phaseHasFS,
    } = extractFieldsFromPlayResult(pr);

    allFields.push(...fields);
    allFieldMetadata.push(...fieldMetadata);
    allPlaygroundStats.push(...playgroundStats);
    if (phaseHasFS) hasFreeSpin = true;
    if (pr.step.summary?.hasMaxWin) hasMaxWin = true;
    if (!firstMetaPublic.betAmount && pr.meta?.public) firstMetaPublic = pr.meta.public;
    if (pr.choices?.length) allChoices.push(...pr.choices);
  });

  if (allFields.length === 0) {
    return {
      entries: [],
      errors: ['No roundEvents with playResult found in this round document.'],
    };
  }

  const stats = getSpinStats(allFields, g.wildSymbolId);
  const totalWin = roundDoc.win ?? '0';
  const betAmount = firstMetaPublic.betAmount || roundDoc.bet || 0;
  const spinMode = firstMetaPublic.spinMode || (hasFreeSpin ? 'freeSpin' : 'normal');

  const entry = {
    num: startNum,
    timestamp: roundDoc.createdAt
      ? new Date(roundDoc.createdAt).toISOString()
      : new Date().toISOString(),
    gameId: roundDoc.gameCode || g.id,
    rawData: roundDoc,
    isCheatTriggered: false,
    fields: allFields,
    summary: { coins: totalWin, hasMaxWin },
    isWin: parseFloat(totalWin) > 0,
    totalWin,
    tumbleCount: allFields.length,
    cascadeCount: allFields.filter((f) => parseInt(f.coins || 0) > 0 && isSettleField(f)).length,
    betAmount,
    spinMode,
    spinType: hasFreeSpin ? 'freeSpin' : 'baseSpin',
    hasBaseSpin: true,
    hasFreeSpin,
    playgroundCount: allPlaygroundStats.length,
    roundTags: roundDoc.roundTags || [],
    choices: allChoices,
    hasMaxWin,
    goldenTransformed: stats.goldenTransformed,
    maxMultiplier: stats.maxMultiplier,
    fieldMetadata: allFieldMetadata,
    playgroundStats: allPlaygroundStats,
    description: `[Mongo] ${roundDoc.roundId || ''}`,
    requestBody: null,
    metadata: {
      fromMongoRound: true,
      roundId: roundDoc.roundId,
      roundStatus: roundDoc.status,
      currency: roundDoc.currency,
      operator: roundDoc.operator,
      brand: roundDoc.brand,
      playerId: roundDoc.playerId,
      bet: roundDoc.bet,
      win: roundDoc.win,
    },
  };

  return { entries: [entry], errors };
}
