// 多角度截图：开阔视野 / bot 交战 / 狙击 ADS / 比分板 / 结算
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const S = (n) => path.join(__dirname, '..', 'shots', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8126'], { stdio: 'pipe' });
  await wait(800);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  await page.goto('http://localhost:8126/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle' });
  await wait(3500);

  // 1. 站开阔处平视全场
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.pos.set(26, 0, 4); p.yaw = 2.6; p.pitch = 0.02;
  });
  await wait(1600);
  await page.screenshot({ path: S('shot_view1.png') });

  // 2. 冲向红队方向看交战
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.pos.set(10, 0, 18); p.yaw = 2.2; p.pitch = 0;
  });
  await wait(2500);
  await page.screenshot({ path: S('shot_view2.png') });

  // 3. 狙击枪 ADS 开镜
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    g.inv.switchTo('sr');
    p.pos.set(0, 0, 30); p.yaw = 0.4; p.pitch = 0;
  });
  await wait(900);
  await page.evaluate(() => { window.__game.input.ads = true; });
  await wait(1200);
  await page.screenshot({ path: S('shot_scope.png') });
  await page.evaluate(() => { window.__game.input.ads = false; });

  // 4. 比分板
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.fillScoreboard(); g.ui.show('scoreboard');
  });
  await wait(400);
  await page.screenshot({ path: S('shot_scoreboard.png') });
  await page.evaluate(() => window.__game.ui.hide('scoreboard'));

  // 5. 观察 bot 互战统计（平衡数据）
  await wait(15000);
  const balance = await page.evaluate(() => {
    const g = window.__game;
    return {
      t: Math.round(g.timeLeft),
      score: g.score,
      kills: g.allUnits().map((u) => `${u.name}:${u.kills}/${u.deaths}`),
      alive: g.allUnits().filter((u) => u.alive).length,
      playerHp: Math.round(g.player.hp),
    };
  });
  console.log('BALANCE', JSON.stringify(balance, null, 1));
  await page.screenshot({ path: S('shot_late.png') });

  await browser.close();
  srv.kill();
  process.exit(0);
})();
