// 结算面板验证
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const S = (n) => path.join(__dirname, '..', 'shots', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8128'], { stdio: 'pipe' });
  await wait(800);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  await page.goto('http://localhost:8128/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle' });
  await wait(3000);
  // 快进：时间耗尽触发结算（蓝 27 红 24 → 胜利）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.kills = 7; g.player.deaths = 2; g.player.streakBest = 3;
    g.player.shotsFired = 210; g.player.shotsHit = 96;
    g.score.blue = 27; g.score.red = 24; g.timeLeft = 1.0;
  });
  await wait(3500);
  await page.screenshot({ path: S('shot_end.png') });
  const st = await page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, score: g.score, stats: JSON.parse(localStorage.getItem('bf_stats_v1') || '{}') };
  });
  console.log(JSON.stringify(st));
  await browser.close();
  srv.kill();
  process.exit(0);
})();
