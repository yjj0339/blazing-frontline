// 线上版验证：加载/开局/截图
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('https://yjj0339.github.io/blazing-frontline/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(6000);
  const st = await page.evaluate(() => {
    const g = window.__game;
    return g ? { state: g.state, bots: g.bots.bots.length, moving: g.bots.bots.some((b) => b.moveSpeed > 0.5) } : null;
  });
  console.log('LIVE', JSON.stringify(st), 'errs:', errs.length ? errs.slice(0, 3) : 'none');
  await page.screenshot({ path: 'shots/live_check.png' });
  await browser.close();
  process.exit(st && st.state === 'playing' && st.moving ? 0 : 1);
})();
