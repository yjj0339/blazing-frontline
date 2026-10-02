// 线上手机端截图 + 导航主页验证
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // 手机竖屏菜单
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p1 = await ctx1.newPage();
  await p1.goto('https://yjj0339.github.io/blazing-frontline/', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(4000);
  await p1.screenshot({ path: 'shots/live_mobile_menu.png' });
  await ctx1.close();
  // 手机横屏对局
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p2 = await ctx2.newPage();
  await p2.goto('https://yjj0339.github.io/blazing-frontline/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(5000);
  await p2.screenshot({ path: 'shots/live_mobile_game.png' });
  await ctx2.close();
  // 导航主页
  const p3 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p3.goto('https://yjj0339.github.io/', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(1200);
  const has = await p3.evaluate(() => document.body.innerHTML.includes('blazing-frontline'));
  console.log('nav card online:', has);
  await p3.screenshot({ path: 'shots/live_nav.png' });
  await browser.close();
  process.exit(0);
})();
