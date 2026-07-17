const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('CONSOLE:', msg.text()));
  await page.goto('http://localhost:5173/');
  const src = await page.evaluate(async () => (await fetch('/src/sqlite-worker.js')).text());
  console.log('--- worker source contains WAL? ---', src.includes('WAL'));
  console.log(src.slice(src.indexOf('sqlite3InitModule')));
  await browser.close();
})();
