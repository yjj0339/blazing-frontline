// v0.9 目验：枪口火光 / 奖励条 / 平衡（bot acc 0.35 下挂机存活）
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const S = (n) => path.join(__dirname, '..', 'shots', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8130'], { stdio: 'pipe' });
  await wait(800);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:8130/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle' });
  await wait(3000);

  // 开火看枪口火光（截帧时机随机，多截）
  await page.evaluate(() => { window.__game.input.firing = true; });
  await wait(160);
  await page.screenshot({ path: S('v09_muzzle.png') });
  await page.evaluate(() => { window.__game.input.firing = false; });

  // 模拟玩家击杀 3 次 → 奖励条点亮
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    for (let i = 0; i < 3; i++) {
      const b = g.bots.bots.filter((x) => x.team === 'red' && x.alive)[0];
      if (b) b.damage(999, p, false);
    }
  });
  await wait(600);
  await page.screenshot({ path: S('v09_rewards.png') });

  // 平衡：挂机 20s 看死亡节奏
  const t0 = Date.now();
  let deaths = 0;
  for (let i = 0; i < 10; i++) {
    await wait(2000);
    const st = await page.evaluate(() => ({ alive: window.__game.player.alive, hp: Math.round(window.__game.player.hp) }));
    if (!st.alive) { deaths++; await wait(2600); }
  }
  console.log('AFK 20s deaths:', deaths, '（期望 ≤2，越少越友好）');
  await browser.close();
  srv.kill();
  process.exit(0);
})();
