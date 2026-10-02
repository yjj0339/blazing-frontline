// v0.9 爽快度验证：滑铲/侦察机/空袭/击杀回血/气泡
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, n) => console.log((c ? '✓' : '✗') + ' ' + n);
const URLBASE = 'http://localhost:8129/';

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8129'], { stdio: 'pipe' });
  await wait(800);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8129/?__test=0.5&mode=tdm&diff=normal', { waitUntil: 'networkidle' });
  await wait(3000);

  // 1. 击杀回血 + 奖励解锁（先攒 2 连杀，第三杀触发）
  const heal = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.hp = 40;
    p.streak = 2;
    const killOne = () => {
      const b = g.bots.bots.find((x) => x.team === 'red' && x.alive);
      if (b) b.damage(999, p, false);
      return !!b;
    };
    killOne();
    return { hpAfter: Math.round(p.hp), uavReady: g.rewards.uav };
  });
  ok(heal.hpAfter === 65, `击杀回血 +25（${heal.hpAfter}）`);
  ok(heal.uavReady, '3杀解锁侦察机');

  // 2. 使用侦察机
  await page.evaluate(() => { window.__game.useUav(); });
  const uav = await page.evaluate(() => window.__game.uavT);
  ok(uav > 8, `侦察机激活 ${Math.round(uav)}s`);

  // 3. 6杀解锁空袭 + 使用
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    g.player.streak = 5; // 击杀后 streak 会 +1 → 6
    g.player.hp = 70;
    const b = g.bots.bots.find((x) => x.team === 'red' && x.alive);
    if (b) b.damage(999, p, false);
  });
  await wait(200);
  const strike = await page.evaluate(() => {
    const g = window.__game;
    const ready = g.rewards.strike;
    g.useStrike();
    return { ready, pending: g.pendingStrikes.length };
  });
  ok(strike.ready && strike.pending === 4, `空袭就绪并标记 4 连爆`);
  await wait(2900);
  const boom = await page.evaluate(() => ({ pending: window.__game.pendingStrikes.length }));
  ok(boom.pending === 0, '空袭全部落下');

  // 4. 滑铲：先冲刺跑起来，再按蹲
  const slide = await page.evaluate(() => {
    const g = window.__game, p = g.player, inp = g.input;
    inp.sprint = true; inp.moveY = 1;
    return new Promise((res) => setTimeout(() => {
      inp.crouch = true;   // 跑起来后按蹲 → 滑铲
      setTimeout(() => res({
        sliding: p.slideT > 0, speed: Math.round(p.moveSpeed * 10) / 10,
      }), 350);
    }, 700));
  });
  ok(slide.sliding && slide.speed > 6, `滑铲触发（速度 ${slide.speed}）`);
  await page.evaluate(() => { const i = window.__game.input; i.sprint = false; i.crouch = false; i.moveY = 0; });

  // 5. 击杀屏效 DOM：hitmarker/气泡层存在
  const dom = await page.evaluate(() => ({
    rw: !!document.getElementById('reward-bar'),
    bubble: !!document.getElementById('bubble-layer'),
  }));
  ok(dom.rw && dom.bubble, '奖励条与气泡层就位');

  // 6. 油桶：3 发引爆
  const barrel = await page.evaluate(() => {
    const g = window.__game;
    const rec = g.world.barrels.find((b) => !b.dead);
    if (!rec) return { ok: false };
    const n0 = g.world.barrels.filter((b) => !b.dead).length;
    g.damageBarrel(rec, 999, g.player);
    const n1 = g.world.barrels.filter((b) => !b.dead).length;
    return { ok: n1 === n0 - 1, gone: rec.dead, colliderGone: !g.world.colliders.some((c) => c.barrel === rec) };
  });
  ok(barrel.ok && barrel.gone && barrel.colliderGone, '油桶引爆并移除碰撞');

  // 7. 据点争夺：蓝队进圈占领得分
  await page.goto(URLBASE + '?__test=0.5&mode=koth&diff=easy', { waitUntil: 'networkidle' });
  await wait(3000);
  const koth = await page.evaluate(() => {
    const g = window.__game;
    if (g.mode !== 'koth') return { ok: false };
    // 清空圈附近的红队，放一个蓝 bot 进圈；关视觉+站桩彻底冻结
    for (const b of g.bots.bots) {
      b.state = 'roam'; b.observeT = 999; b.roamPt = null; b.path = null; b.target = null;
      b.visionK = 0.01; b.heardShotT = 0; b.lastSeen = null; b.burstLeft = 0;
      if (b.team === 'red') b.pos.set(26, 0, 26);
      else b.pos.set(1.5, 0, 1.5);
    }
    return new Promise((res) => setTimeout(() => res({
      ok: true, blue: g.score.blue, owner: g.point.owner,
    }), 8000));
  });
  ok(koth.ok && koth.owner === 'blue' && koth.blue > 0, `据点占领得分（蓝 ${koth.blue} 分 owner=${koth.owner}）`);

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'test_v12.png') });
  console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
  await browser.close();
  srv.kill();
  process.exit(0);
})();
