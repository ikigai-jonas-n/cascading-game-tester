const { chromium } = require('@playwright/test').chromium ? {chromium: require('@playwright/test').chromium} : require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');
  console.log('--- attempting saveAllSpins ---');
  const result = await page.evaluate(async () => {
    try {
      const { game } = await import('/src/store/gameStore.js');
      const { saveAllSpins, getSpinCount } = await import('/src/db.js');
      const gameId = game().id;
      await saveAllSpins([{ num: 1, gameId, isWin: true, totalWin: 10, timestamp: new Date().toISOString() }]);
      const count = await getSpinCount(gameId);
      return { ok: true, gameId, count };
    } catch (err) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
})();
