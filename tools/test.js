// 静默冒烟测试：playwright(msedge) 无头，绝不打扰用户
// 用法：node tools/test.js
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const PORT = 8123;
const URLBASE = `http://localhost:${PORT}/`;

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const { spawn } = require('child_process');
  const srv = spawn('node', [path.join(__dirname, 'server.js'), String(PORT)], { stdio: 'pipe' });
  await wait(800);

  let browser = null;
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { browser = await chromium.launch({ channel, headless: true }); break; }
    catch (e) { console.log(`channel ${channel} 不可用`); }
  }
  if (!browser) throw new Error('无可用浏览器');

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const result = { checks: [] };
  const ok = (name, cond) => { result.checks.push({ name, pass: !!cond }); console.log((cond ? '✓' : '✗') + ' ' + name); };

  // 1. 菜单加载
  await page.goto(URLBASE, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(3500);
  ok('菜单可见', await page.$('#menu:not(.hidden)'));
  ok('加载层隐藏', await page.$eval('#loading', (el) => el.classList.contains('hidden')));
  ok('模式卡≥2', (await page.$$('.mode-card')).length >= 2);

  // 2. 菜单截图
  await page.screenshot({ path: path.join(SHOTS, 'test_menu.png') });

  // 3. 自动开局（测试钩子）：__test 参数会在 0.5s 后自动 startMatch
  await page.goto(URLBASE + '?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle', timeout: 30000 });
  await wait(4000);
  ok('进入对局', await page.$eval('#hud', (el) => !el.classList.contains('hidden')));
  const gs = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state, bots: g.bots.bots.length,
      aliveBots: g.bots.bots.filter((b) => b.alive).length,
      playerAlive: g.player.alive,
      wp: g.world.waypoints.length,
      colliders: g.world.colliders.length,
      botMoving: g.bots.bots.some((b) => b.moveSpeed > 0.5),
      ammo: g.inv.st.mag,
      vm: !!g.vm.current,
      sceneMeshes: g.scene.children.length,
    };
  });
  console.log(JSON.stringify(gs));
  ok('13 bot 生成', gs.bots === 13);
  ok('bot 存活≥12', gs.aliveBots >= 12);
  ok('路点>100', gs.wp > 100);
  ok('碰撞体>40', gs.colliders > 40);
  ok('bot 在移动', gs.botMoving);
  ok('视图模型就位', gs.vm);

  // 4. 命中验证：冻结一个 bot 在玩家正前方 12m，单发验证 fireHitscan
  const hitTest = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player, b = g.bots.bots.find((x) => x.team === 'red' && x.alive);
  // 命中验证：开阔地玩家 (26,0,0) 朝 -Z，bot (26,0,-12)
  p.pos.set(26, 0, 0); p.yaw = 0; p.pitch = 0;
  b.pos.set(26, 0, -12); b.state = 'roam'; b.observeT = 999; b.moveSpeed = 0;
    const dir = p.dir;
    const w = g.inv.w;
    const res = g.fireHitscan(p, p.eyePos, dir, w);
    return { hit: !!res.hitUnit, head: res.head, dist: res.point ? Math.round(res.point.distanceTo(p.eyePos)) : -1 };
  });
  console.log(JSON.stringify(hitTest));
  ok('单发命中静止目标', hitTest.hit);

  // 5. 战斗推进：等 10 秒看击杀发生（bot 互战）
  await wait(12000);
  const battle = await page.evaluate(() => {
    const g = window.__game;
    return {
      kills: g.allUnits().reduce((s, u) => s + u.kills, 0),
      scoreB: g.score.blue, scoreR: g.score.red,
      playerHp: Math.round(g.player.hp),
      playerAlive: g.player.alive,
    };
  });
  console.log(JSON.stringify(battle));
  ok('战场有击杀（bot 互战）', battle.kills > 0);
  ok('比分在动', battle.scoreB + battle.scoreR > 0);
  await page.screenshot({ path: path.join(SHOTS, 'test_battle1.png') });

  // 6. 玩家连发验证（bot 会走位，只验证开火机制与弹药消耗）
  await page.evaluate(() => {
    const g = window.__game;
    g.input.firing = true;
  });
  await wait(2500);
  const fire = await page.evaluate(() => {
    const g = window.__game;
    g.input.firing = false;
    const p = g.player;
    return { fired: p.shotsFired, hit: p.shotsHit, mag: g.inv.st.mag };
  });
  console.log(JSON.stringify(fire));
  ok('玩家已开火', fire.fired > 5);
  ok('弹药消耗', fire.mag < 30);

  // 6. FFA 模式快速验证
  await page.goto(URLBASE + '?__test=0.5&mode=ffa&diff=easy', { waitUntil: 'networkidle', timeout: 30000 });
  await wait(3500);
  const ffa = await page.evaluate(() => {
    const g = window.__game;
    return { bots: g.bots.bots.length, ffa: g.bots.bots[0].isFFA, state: g.state };
  });
  ok('FFA 7 bot', ffa.bots === 7 && ffa.ffa);
  await wait(5000);
  await page.screenshot({ path: path.join(SHOTS, 'test_ffa.png') });

  // 7. 手机宽度布局（触屏 context）
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  await mp.goto(URLBASE, { waitUntil: 'networkidle' });
  await wait(2500);
  await mp.screenshot({ path: path.join(SHOTS, 'test_mobile_menu.png') });
  const mctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const mp2 = await mctx2.newPage();
  await mp2.goto(URLBASE + '?__test=0.5', { waitUntil: 'networkidle' });
  await wait(3500);
  const touch = await mp2.evaluate(() => !document.getElementById('touch-ui').classList.contains('hidden'));
  ok('触屏 UI 显示', touch);
  await mp2.screenshot({ path: path.join(SHOTS, 'test_mobile_game.png') });
  await mctx.close(); await mctx2.close();

  // 汇总
  const failed = result.checks.filter((c) => !c.pass);
  console.log(`\n== 结果: ${result.checks.length - failed.length}/${result.checks.length} 通过 ==`);
  if (errors.length) { console.log('页面错误:'); errors.slice(0, 12).forEach((e) => console.log('  ' + e)); }
  fs.writeFileSync(path.join(SHOTS, 'test-result.json'), JSON.stringify({ result, errors }, null, 2));
  await browser.close();
  srv.kill();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
