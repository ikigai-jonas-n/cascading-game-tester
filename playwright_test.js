const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.error('BROWSER ERROR:', err));

  await page.goto('http://localhost:5173');
  // Trigger clear data
  await page.evaluate(() => {
    localStorage.clear();
    location.reload();
  });
  await page.waitForTimeout(3000);

  await browser.close();
})();
