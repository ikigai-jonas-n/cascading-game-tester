// src/spin-worker.js

function isSettleField(field) {
  if (field.features && 'isSettle' in field.features) return field.features.isSettle === true;
  return true;
}

function getSpinStats(fields, wildSymbolId) {
  if (!fields) return { totalGolden: 0, maxMultiplier: 1 };
  let totalGolden = 0;
  let maxMultiplier = 1;

  fields.forEach((f) => {
    const payoutPositions = new Set();
    (f.symbols?.payouts || []).forEach((p) => {
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

self.onmessage = async (e) => {
  const { apiUrl, config, gameCode, playerId, gameId, wildSymbolId, startNum, batchSize } = e.data;

  const results = [];

  for (let i = 0; i < batchSize; i++) {
    try {
      const response = await fetch(`${apiUrl}/v1/service/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
        body: JSON.stringify({ ...config, gameCode, id: playerId }),
      });

      const json = await response.json();
      if (!json.data) continue;

      let data = json.data;
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

      const summary = data.step?.summary || {};
      const metaPublic = data.meta?.public || data.step?.meta?.public || {};
      const stats = getSpinStats(fields, wildSymbolId);

      results.push({
        num: startNum + i,
        timestamp: new Date().toISOString(),
        gameId: gameId,
        rawData: data,
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
        playgroundCount: playgroundCounter,
        roundTags: data.roundTags || data.step?.roundTags || [],
        choices: data.choices || data.step?.choices || [],
        hasMaxWin: !!(summary.hasMaxWin || data.hasMaxWin),
        goldenTransformed: stats.goldenTransformed,
        maxMultiplier: stats.maxMultiplier,
        fieldMetadata,
        playgroundStats,
      });
    } catch (err) {
      console.error('Worker fetch failed:', err);
    }
  }

  self.postMessage({ results });
};
