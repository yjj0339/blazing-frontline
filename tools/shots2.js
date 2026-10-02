// 狙击开镜远景 + 爆头伤害数字 验证截图
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const S = (n) => path.join(__dirname, '..', 'shots', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8127'], { stdio: 'pipe' });
  await wait(800);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  await page.goto('http://localhost:8127/?__test=0.5&mode=tdm&diff=easy', { waitUntil: 'networkidle' });
  await wait(3000);

  // 狙击开镜朝场地中央（远距有 bot 可见）
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    g.inv.switchTo('sr');
    p.pos.set(0, 0, 32); p.yaw = 0; p.pitch = -0.03;
    // 摆一个红队 bot 在中央集装箱附近
    const b = g.bots.bots.find((x) => x.team === 'red');
    b.pos.set(4.5, 0, 12); b.state = 'roam'; b.observeT = 999;
  });
  await wait(800);
  await page.evaluate(() => { window.__game.input.ads = true; });
  await wait(1300);
  await page.screenshot({ path: S('shot_scope_far.png') });
  await page.evaluate(() => { window.__game.input.ads = false; });

  // 爆头击杀数字 + hitmarker：直接打中央 bot
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const b = g.bots.bots.find((x) => x.team === 'red');
    b.pos.set(0, 0, 12); b.observeT = 999; b.state = 'roam';
    p.yaw = 0; p.pitch = 0;
  });
  await wait(150);
  await page.evaluate(() => { window.__game.input.firing = true; });
  await wait(700);
  await page.screenshot({ path: S('shot_hitmarker.png') });

  const st = await page.evaluate(() => {
    const g = window.__game;
    return { kills: g.player.kills, hp: Math.round(g.player.hp) };
  });
  console.log('after-fire', JSON.stringify(st));
  await browser.close();
  srv.kill();
  process.exit(0);
})();
