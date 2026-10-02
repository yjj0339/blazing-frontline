// ===== 对局核心：初始化/循环/命中/击杀/重生/结束 =====
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import { MAP_HALF, WEAPONS, WEAPON_ORDER, GRENADE, PLAYER, MODES, DIFFS, TEAM_COLOR, LS_STATS, REWARDS, KOTH, MAT_SOUND } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Inventory } from './weapons.js';
import { BotManager } from './bots.js';
import { UI } from './ui.js';
import { AudioSys, MusicSys } from './audio.js';

const H = MAP_HALF;

export class Game {
  constructor(assets) {
    this.assets = assets;
    this.state = 'menu';
    this.mode = 'tdm';
    this.diffKey = 'normal';
    this.diff = DIFFS.normal;
    this.score = { blue: 0, red: 0 };

    const canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    // 帧率自适应：初始最高档，掉帧自动降 pixelRatio
    this._prTiers = [Math.min(devicePixelRatio, 1.75), Math.min(devicePixelRatio, 1.35), 1.0];
    this._prTier = 0;
    this._fpsEMA = 60;
    this._fpsT = 0;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    this.audio = new AudioSys();
    this.music = new MusicSys(this.audio);
    this.ui = new UI(this);
    this.ui.setupTouch();
    this.applySettings();
    this.world = new World();
    this.world.build(this.scene, assets.props, this.ui.settings.map || 'town');
    this.player = new Player(this);
    this.inv = new Inventory(this);
    this.weapons = new Weapons(this);
    this.weapons.buildViewModel(assets);
    this.bots = new BotManager(this);

    // 枪口灯
    this.muzzleLight = new THREE.PointLight(0xffc266, 0, 7);
    this.camera.add(this.muzzleLight);
    this.muzzleLight.position.set(0.16, -0.1, -0.8);

    this.input = this._makeInput();
    this.trauma = 0;
    this.uavT = 0;
    this.pendingStrikes = [];
    this.rewards = { uav: false, strike: false, rampageT: 0 };
    this.point = { owner: null, prog: 0, progTeam: null };
    this.pointT = 0;
    this.pointHold = 0;
    this._lastSay = -9;
    this.hitstopT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.menuAng = 0;
    // 武器熟练度（跨局持久）
    this.mastery = this.ui.loadMastery();
    this.sessionMastery = { ar: 0, sg: 0, sr: 0, pg: 0 };
    this.scorchPool = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 16),
        new THREE.MeshBasicMaterial({ color: 0x1c1a14, transparent: true, opacity: 0.55, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      m.visible = false;
      this.scene.add(m);
      this.scorchPool.push(m);
    }
    this._scorchI = 0;
    // 菜单背景先跑起来
    this.state = 'menu';

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindPointerLock();

    this._last = performance.now();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);

    // 菜单背景：先摆一队 bot 在场上巡逻
    this.redeployMenuBots();
    // 首次交互解锁音频（浏览器策略）
    window.addEventListener('pointerdown', () => {
      this.audio.init(); this.audio.resume(); this.music.start();
    }, { once: true });

    // 测试钩子
    const q = new URLSearchParams(location.search);
    if (q.get('__test')) {
      this._autoTest = { mode: q.get('mode') || 'tdm', diff: q.get('diff') || 'normal', t: parseFloat(q.get('__test')) || 0.5 };
      window.__game = this;
    }
  }

  allUnits() {
    return [this.player, ...this.bots.bots];
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this._prTiers ? this._prTiers[this._prTier] : Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applySettings(stIn) {
    const st = stIn || (this.ui ? this.ui.settings : null);
    if (!st) return;
    this.audio.setVolume(st.vol);
    this.baseFov = st.fov;
    this.renderer.shadowMap.enabled = st.shadow;
    if (this.music && this.music.gain) this.music.gain.gain.value = st.music ? 0.55 : 0;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  // ============ 对局 ============
  startMatch(mode, diffKey) {
    this.audio.init(); this.audio.resume(); this.music.start();
    this.mode = mode;
    this.diffKey = diffKey;
    this.diff = DIFFS[diffKey];
    // 地图
    const mapId = this.ui.settings.map || 'town';
    if (this.world.mapId !== mapId) this.world.build(this.scene, this.assets.props, mapId);
    this.score = { blue: 0, red: 0 };
    this.timeLeft = MODES[mode].time;
    this.over = false;
    this.state = 'playing';
    this.uavT = 0;
    this.pendingStrikes = [];
    this.rewards = { uav: false, strike: false };
    this.trauma = 0;
    this.bots.spawnAll(mode);
    // 出生
    const sp = this.world.spawns;
    this.player.team = 'blue';
    this.player.kills = 0; this.player.deaths = 0; this.player.streakBest = 0;
    this.player.shotsFired = 0; this.player.shotsHit = 0;
    this.player.respawn(sp.blue[(Math.random() * sp.blue.length) | 0]);
    // bot 初始站位
    this.bots.bots.forEach((b, i) => {
      const arr = mode === 'ffa' ? sp.ffa : sp[b.team];
      b.spawnAt(arr[i % arr.length].clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)));
      b.shotAt = -9;
    });
    this.ui.toGame();
    document.getElementById('mode-tag').textContent = MODES[mode].label;
    document.getElementById('sb-mode').textContent = MODES[mode].label;
    // 据点圈标记（A 点实体环）
    if (mode === 'koth' && !this.pointRing) {
      this.pointRing = new THREE.Mesh(
        new THREE.RingGeometry(KOTH.radius - 0.5, KOTH.radius, 40),
        new THREE.MeshBasicMaterial({ color: 0xe8ddc0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
      );
      this.pointRing.rotation.x = -Math.PI / 2;
      this.pointRing.position.set(KOTH.center.x, 0.04, KOTH.center.z);
      this.scene.add(this.pointRing);
    }
    if (this.pointRing) this.pointRing.visible = mode === 'koth';
    this.ui.refreshAmmo();
    this.vm.show(this.inv.current);
    this.ui.killBanner(mode === 'tdm' ? '团队死斗 · 消灭红队！' : mode === 'koth' ? '占领中央据点 A！' : '个人混战 · 你只能相信自己！', 'big');
    if (!this.ui.isTouch() && document.body.requestPointerLock) {
      try {
        const r = document.getElementById('c').requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* 无手势时忽略 */ }
    }
  }

  togglePause(on) {
    if (this.state === 'playing' && on !== false) {
      this.state = 'paused';
      this.ui.show('pause-panel');
      if (document.exitPointerLock) document.exitPointerLock();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.hide('pause-panel');
      if (!this.ui.isTouch()) document.getElementById('c').requestPointerLock();
    }
  }
  quitMatch() {
    this.state = 'menu';
    this.over = true;
    this.ui.toMenu();
  }

  addMastery(kind, n) {
    if (!this.mastery[kind]) this.mastery[kind] = 0;
    const lv0 = Math.min(10, Math.floor(this.mastery[kind] / 100) + 1);
    this.mastery[kind] += n;
    this.sessionMastery[kind] = (this.sessionMastery[kind] || 0) + n;
    const lv1 = Math.min(10, Math.floor(this.mastery[kind] / 100) + 1);
    if (lv1 > lv0) {
      this.ui.streakBanner(`${WEAPONS[kind].name} 熟练度 Lv.${lv1}！`);
      this.audio.streak(2);
    }
    this.ui.saveMastery(this.mastery);
  }
  masteryOf(kind) {
    return Math.min(10, Math.floor((this.mastery[kind] || 0) / 100) + 1);
  }
  masteryBonus(kind) {
    const lv = this.masteryOf(kind);
    return { reload: 1 - 0.02 * (lv - 1), spread: 1 - 0.015 * (lv - 1), lv };
  }

  // 菜单切图：重建战场 + 重摆背景 bot
  changeMap(mapId) {
    this.world.build(this.scene, this.assets.props, mapId);
    if (this.state === 'menu') this.redeployMenuBots();
  }
  redeployMenuBots() {
    this.bots.spawnAll('tdm');
    const sp = this.world.spawns;
    this.bots.bots.forEach((b, i) => {
      const arr = b.team === 'blue' ? sp.blue : sp.red;
      b.spawnAt(arr[i % arr.length].clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5)));
    });
  }

  addTrauma(k) {
    this.trauma = Math.min(1, (this.trauma || 0) + k);
  }

  // ---- 连杀奖励 ----
  useUav() {
    if (!this.rewards.uav || this.uavT > 0 || this.state !== 'playing') return;
    this.rewards.uav = false;
    this.uavT = REWARDS.uav.time;
    this.ui.streakBanner('侦察机升空 · 敌人全部暴露');
    this.audio.streak(3);
    this.ui.refreshRewards();
  }
  useStrike() {
    if (!this.rewards.strike || this.state !== 'playing' || !this.player.alive) return;
    this.rewards.strike = false;
    const p = this.player;
    const dir = p.dir;
    const hit = this.rayWorld(p.eyePos, dir, 80);
    const target = hit
      ? hit.point.clone()
      : p.eyePos.addScaledVector(dir, 45);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.random();
      const r = i === 0 ? 0 : 4.5;
      this.pendingStrikes.push({
        pos: new THREE.Vector3(target.x + Math.cos(ang) * r, 0, target.z + Math.sin(ang) * r),
        t: 1.6 + i * 0.24,
      });
    }
    this.ui.streakBanner('空袭已标记 · 注意隐蔽');
    this.audio.streak(4);
    this.ui.refreshRewards();
  }
  updateRewards(dt) {
    this.uavT = Math.max(0, this.uavT - dt);
    if (this.rewards.rampageT > 0) {
      this.rewards.rampageT -= dt;
      if (this.rewards.rampageT <= 0) this.ui.showRamp(false);
    }
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const s = this.pendingStrikes[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.pendingStrikes.splice(i, 1);
        this.explode(s.pos, this.player);
      }
    }
  }

  botSay(bot, text, force) {
    const now = performance.now() / 1000;
    if (!force && now - this._lastSay < 2.0) return;
    this._lastSay = now;
    this.ui.botSay(bot, text);
  }

  addScorch(pos) {
    const sc = this.scorchPool[this._scorchI++ % this.scorchPool.length];
    sc.position.set(pos.x, 0.02 + Math.random() * 0.004, pos.z);
    sc.rotation.z = Math.random() * Math.PI * 2;
    sc.scale.setScalar(0.8 + Math.random() * 0.5);
    sc.visible = true;
  }

  // ============ 命中 ============
  // 世界遮挡：返回 {point, t, collider} 或 null
  rayWorld(origin, dir, maxD) {
    let bt = maxD, hit = null, hitC = null;
    const boxHit = (min, max, c) => {
      let t0 = 0, t1 = bt;
      const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (o[i] < min[i] || o[i] > max[i]) return;
        } else {
          let ta = (min[i] - o[i]) / d[i], tb = (max[i] - o[i]) / d[i];
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) return;
        }
      }
      if (t0 < bt && t0 > 0.001) { bt = t0; hit = t0; hitC = c; }
    };
    for (const c of this.world.colliders) {
      if (c.dead) continue;
      boxHit([c.x1, 0, c.z1], [c.x2, c.h, c.z2], c);
    }
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0.001 && t < bt) {
        const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
        if (Math.abs(px) < H && Math.abs(pz) < H) { hit = t; hitC = null; }
      }
    }
    if (hit === null) return null;
    return { t: hit, point: origin.clone().addScaledVector(dir, hit), collider: hitC };
  }

  // 通用 hitscan（玩家武器）：世界遮挡 + 单位命中
  fireHitscan(shooter, origin, dir, w) {
    const maxD = w.range + 60;
    const wall = this.rayWorld(origin, dir, maxD);
    const wallT = wall ? wall.t : maxD;
    let best = null;
    for (const u of this.allUnits()) {
      if (u === shooter || !u.alive) continue;
      if (this.mode === 'tdm' && u.team === shooter.team) continue;
      // 2D 射线-圆
      const ox = origin.x - u.pos.x, oz = origin.z - u.pos.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-8) continue;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - 0.42 * 0.42;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0.3 || t > wallT) continue;
      const z = origin.y + dir.y * t - u.pos.y;
      let part = 'body';
      if (z > 1.38) part = 'head';
      else if (z < 0.55) part = 'leg';
      if (!best || t < best.t) best = { u, t, part };
    }
    if (best) {
      const head = best.part === 'head';
      const dmgMul = best.part === 'head' ? w.headMul : best.part === 'leg' ? 0.75 : 1;
      const point = origin.clone().addScaledVector(dir, best.t);
      let dmg = w.dmg * dmgMul;
      best.u.damage(dmg, shooter, head);
      return { hitUnit: best.u, head, point, t: best.t };
    }
    if (wall && wall.collider && wall.collider.barrel && !wall.collider.barrel.dead) {
      this.damageBarrel(wall.collider.barrel, w.dmg * (w.pellets || 1), shooter);
    }
    const hitMat = wall && wall.collider ? MAT_SOUND[wall.collider.name] || null : null;
    return { hitUnit: null, head: false, point: wall ? wall.point : origin.clone().addScaledVector(dir, maxD), t: wallT, mat: hitMat, collider: wall?.collider || null };
  }

  // 据点争夺：圈内单队 → 占领 3s → 持有方每 4s +1 分
  updateKoth(dt) {
    if (this.mode !== 'koth' || this.over) return;
    // 点圈颜色随归属
    if (this.pointRing) {
      this.pointRing.material.color.setHex(
        this.point.owner === 'blue' ? 0x2f7fd4 : this.point.owner === 'red' ? 0xd0452f : 0xe8ddc0);
    }
    this.pointT -= dt;
    if (this.pointT > 0) return;
    this.pointT = 0.25;
    const pt = this.point;
    const inZone = (u) => u.alive && Math.hypot(u.pos.x - KOTH.center.x, u.pos.z - KOTH.center.z) < KOTH.radius;
    let nb = 0, nr = 0;
    for (const u of this.allUnits()) {
      if (!inZone(u)) continue;
      if (u.team === 'blue') nb++;
      else nr++;
    }
    const step = 0.25;
    if (nb > 0 && nr === 0) {
      const team = 'blue';
      if (pt.owner !== team) {
        if (pt.progTeam !== team) { pt.prog = Math.max(0, pt.prog - step * 2); if (pt.prog <= 0) pt.progTeam = team; }
        else pt.prog += step;
        if (pt.prog >= KOTH.captureTime) {
          pt.owner = team; pt.prog = 0;
          this.ui.killBanner(pt.owner === 'blue' ? '蓝队占领了据点！' : '红队占领了据点！', 'big');
          this.audio.streak(2);
        }
      }
    } else if (nr > 0 && nb === 0) {
      const team = 'red';
      if (pt.owner !== team) {
        if (pt.progTeam !== team) { pt.prog = Math.max(0, pt.prog - step * 2); if (pt.prog <= 0) pt.progTeam = team; }
        else pt.prog += step;
        if (pt.prog >= KOTH.captureTime) {
          pt.owner = team; pt.prog = 0;
          this.ui.killBanner(pt.owner === 'blue' ? '蓝队占领了据点！' : '红队占领了据点！', 'big');
          this.audio.streak(2);
        }
      }
    } else if (nb > 0 && nr > 0) {
      // 争夺中：进度冻结
    }
    if (pt.owner) {
      this.pointHold += step;
      if (this.pointHold >= KOTH.scoreInterval) {
        this.pointHold = 0;
        this.score[pt.owner]++;
        this.ui.pointFlash();
        const lim = MODES.koth.scoreLimit;
        if (this.score[pt.owner] >= lim) this.endMatch();
      }
    }
  }

  // 油桶受击：闪暗、3 发引爆，爆炸可连锁
  damageBarrel(rec, dmg, shooter) {
    if (rec.dead) return;
    rec.hp -= dmg;
    rec.mesh.material.color.multiplyScalar(0.93);
    if (rec.hp <= 0) {
      rec.dead = true;
      rec.mesh.visible = false;
      const idx = this.world.colliders.indexOf(this.world.colliders.find((c) => c.barrel === rec));
      if (idx >= 0) this.world.colliders.splice(idx, 1);
      this.explode(new THREE.Vector3(rec.x, 0.45, rec.z), shooter || null);
    }
  }

  explode(pos, owner) {
    this.audio.explosion(pos, this.camera);
    this.weapons.sparks.burst(pos, 0xffa640, 22, 9);
    this.weapons.sparks.burst(pos, 0x6b6b6b, 14, 5);
    this.addScorch(pos);
    const dCam = this.camera.position.distanceTo(pos);
    this.addTrauma(Math.max(0, 0.35 - dCam * 0.012));
    // 连锁引爆附近油桶
    for (const rec of [...this.world.barrels]) {
      if (rec.dead) continue;
      if (Math.hypot(rec.x - pos.x, rec.z - pos.z) < GRENADE.radius) {
        this.damageBarrel(rec, 40, owner && owner.isPlayer ? owner : null);
      }
    }
    // 范围伤害
    for (const u of this.allUnits()) {
      if (!u.alive) continue;
      const d = u.pos.distanceTo(pos);
      if (d > GRENADE.radius) continue;
      const k = 1 - d / GRENADE.radius;
      let dmg = GRENADE.dmg * (0.35 + k * 0.65);
      if (!u.isPlayer && !(owner && owner.isPlayer)) dmg *= 0.6;
      if (u.isPlayer && owner && !owner.isPlayer) dmg *= 0.55;   // bot 手雷对玩家减伤
      u.damage(dmg, owner && owner !== u ? owner : null, false);
      if (u.isPlayer && u.alive) {
        this.ui.vignette(0.7);
        this.ui.damageDir(pos);
      }
    }
    this.botHearShot(pos, 60);
  }

  botHearShot(pos, radius, except) {
    for (const b of this.bots.bots) {
      if (b === except || !b.alive) continue;
      if (b.pos.distanceTo(pos) < radius) {
        b.heardShotT = 3;
        b.heardPos = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, 0, pos.z);
      }
    }
  }

  // ============ 击杀/受伤回调 ============
  onPlayerHurt(from, head, amount) {
    this.ui.vignette(Math.min(0.85, 0.3 + amount / 120));
    this.addTrauma(0.14);
    this._lastCombatT = performance.now() / 1000;
    if (from) this.ui.damageDir(from.pos);
    this.audio.hurt();
  }

  onUnitKilled(victim, killer, head) {
    if (this.over) return;
    const wName = '步枪';
    if (killer && killer !== victim) {
      killer.kills++;
      killer.streak = (killer.streak || 0) + 1;
      if (killer.streakBest === undefined) killer.streakBest = 0;
      killer.streakBest = Math.max(killer.streakBest, killer.streak);
      if (this.mode === 'tdm' || this.mode === 'koth') this.score[killer.team]++;
      else if (killer.isPlayer) this.score.blue = killer.kills;
    }
    victim.streak = 0;
    this.ui.killfeed(killer, victim, head, wName);

    if (killer && killer.isPlayer && victim !== killer) {
      // 击杀奖励：回血 + 连击 + hitstop + 连杀解锁 + 熟练度
      this.addMastery(this.inv.current, 20);
      killer.hp = Math.min(PLAYER.hp, killer.hp + PLAYER.killHeal);
      this.ui.spawnHeal(PLAYER.killHeal);
      this.hitstopT = 0.085;
      this.combo = (this.comboT > 0 ? this.combo : 0) + 1;
      this.comboT = 4;
      this.ui.showCombo(this.combo);
      const n = killer.streak;
      if (n === REWARDS.uav.kills) { this.rewards.uav = true; this.ui.streakBanner('侦察机就绪 · 按 5 释放'); }
      if (n === REWARDS.strike.kills) { this.rewards.strike = true; this.ui.streakBanner('空袭就绪 · 按 6 释放'); }
      if (n === REWARDS.rampage.kills) {
        this.rewards.rampageT = REWARDS.rampage.time;
        this.ui.streakBanner('狂暴！射速暴增 · 弹匣无限！');
        this.ui.showRamp(true);
      }
      this.ui.refreshRewards();
      this.audio.kill(this.combo);
      this.ui.hitmarker(head);
      this.addTrauma(0.05);
      this.ui.killBanner(head ? `爆头击杀 ${victim.name}！` : `击杀了 ${victim.name}`);
      if (n === 2) { this.ui.streakBanner('双杀！'); this.audio.streak(2); }
      else if (n === 3) { this.ui.streakBanner('三连杀！'); this.audio.streak(3); }
      else if (n === 4) { this.ui.streakBanner('四连杀！火力全开！'); this.audio.streak(4); }
      else if (n >= 5 && n !== REWARDS.rampage.kills) { this.ui.streakBanner(`${n} 连杀 · 杀神降临！`); this.audio.streak(5); }
    }
    if (killer && !killer.isPlayer && killer !== victim) {
      this.botSay(killer, victim.isPlayer ? ['拿下指挥官！', '搞定一个！', '干净利落'][(Math.random() * 3) | 0]
        : ['拿下！', '下一个是谁？', '换我上！'][(Math.random() * 3) | 0]);
    }

    if (victim.isPlayer) {
      victim.lastKiller = killer && killer !== victim ? killer : null;
      victim.respawnT = 2.5;
    } else {
      victim.respawnT = 2.5;
    }
    // 胜负
    const lim = MODES[this.mode].scoreLimit;
    if (this.mode === 'koth') {
      if (this.score.blue >= lim || this.score.red >= lim) this.endMatch();
    } else if ((this.mode === 'tdm' && (this.score.blue >= lim || this.score.red >= lim)) ||
        (this.mode === 'ffa' && this.score.blue >= lim)) {
      this.endMatch();
    }
  }

  _respawnUnits(dt) {
    // 玩家
    const p = this.player;
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const arr = this.mode === 'ffa' ? this.world.spawns.ffa : this.world.spawns.blue;
        p.respawn(arr[(Math.random() * arr.length) | 0].clone());
        this.audio.respawn();
      }
    }
    for (const b of this.bots.bots) {
      if (b.alive) continue;
      b.respawnT -= dt;
      if (b.respawnT <= 0) {
        const arr = this.mode === 'ffa' ? this.world.spawns.ffa : this.world.spawns[b.team];
        let pt = arr[(Math.random() * arr.length) | 0].clone();
        // 远离敌人
        for (let tries = 0; tries < 6; tries++) {
          let mind = Infinity;
          for (const u of this.allUnits()) {
            if (u === b || !u.alive) continue;
            if (this.mode === 'tdm' && u.team === b.team) continue;
            mind = Math.min(mind, u.pos.distanceTo(pt));
          }
          if (mind > 16) break;
          pt = arr[(Math.random() * arr.length) | 0].clone();
        }
        b.spawnAt(pt);
      }
    }
  }

  endMatch() {
    this.over = true;
    this.state = 'ended';
    this.music.setIntensity(0);
    const p = this.player;
    let win;
    if (this.mode === 'ffa') {
      let top = p.kills;
      for (const b of this.bots.bots) top = Math.max(top, b.kills);
      win = p.kills >= top && p.kills >= MODES.ffa.scoreLimit;
    } else {
      win = this.score.blue > this.score.red;
    }
    // 战绩 + 经验
    const s = this.ui.stats;
    s.matches++; if (win) s.wins++;
    s.kills += p.kills; s.deaths += p.deaths;
    s.bestStreak = Math.max(s.bestStreak || 0, p.streakBest || 0);
    const gained = p.kills * 10 + (win ? 60 : 20) + (p.streakBest || 0) * 8;
    s.xp = (s.xp || 0) + gained;
    this.xpGained = gained;
    this.ui.saveStats();
    if (win) this.audio.win(); else this.audio.lose();
    if (document.exitPointerLock) document.exitPointerLock();
    setTimeout(() => this.ui.showEnd(win), 900);
  }

  // ============ 输入 ============
  _makeInput() {
    const inp = {
      moveX: 0, moveY: 0, jump: false, crouch: false, sprint: false,
      firing: false, ads: false, reload: false, grenade: false,
      switchTo: null, cycle: 0, lookDX: 0, lookDY: 0,
      useUav: false, useStrike: false, toggleFire: false,
    };
    const keys = {};
    const syncMove = () => {
      inp.moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      inp.moveY = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      inp.sprint = !!keys['ShiftLeft'];
      inp.crouch = !!keys['KeyC'] || !!keys['ControlLeft'];
    };
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing' && e.code !== 'Tab' && e.code !== 'Escape') return;
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
      keys[e.code] = true;
      if (e.code === 'Space') inp.jump = true;
      if (e.code === 'KeyR') inp.reload = true;
      if (e.code === 'KeyG') inp.grenade = true;
      if (e.code === 'Digit1') inp.switchTo = 'ar';
      if (e.code === 'Digit2') inp.switchTo = 'sg';
      if (e.code === 'Digit3') inp.switchTo = 'sr';
      if (e.code === 'Digit4') inp.switchTo = 'pg';
      if (e.code === 'Digit5') inp.useUav = true;
      if (e.code === 'Digit6') inp.useStrike = true;
      if (e.code === 'KeyX') inp.toggleFire = true;
      if (e.code === 'KeyQ') inp.cycle = -1;
      if (e.code === 'Escape' && this.state === 'playing') this.togglePause(true);
      syncMove();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      syncMove();
    });
    const canvas = document.getElementById('c');
    canvas.addEventListener('mousedown', (e) => {
      if (this.state === 'playing' && document.pointerLockElement !== canvas) {
        try {
          const r = canvas.requestPointerLock();
          if (r && r.catch) r.catch(() => {});
        } catch (err) { }
        return;
      }
      if (e.button === 0) inp.firing = true;
      if (e.button === 2) inp.ads = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) inp.firing = false;
      if (e.button === 2) inp.ads = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.state !== 'playing') return;
      const k = 0.0021 * this.ui.settings.sens * (inp.ads ? 0.6 : 1);
      inp.lookDX -= e.movementX * k;
      inp.lookDY -= e.movementY * k;
    });
    window.addEventListener('wheel', (e) => {
      if (this.state === 'playing') inp.cycle = e.deltaY > 0 ? 1 : -1;
    }, { passive: true });
    // Tab 比分板
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && (this.state === 'playing' || this.state === 'paused')) {
        this.ui.fillScoreboard();
        this.ui.show('scoreboard');
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.ui.hide('scoreboard');
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.state === 'playing' && !this.ui.isTouch()) {
        this.togglePause(true);
      }
    });
    return inp;
  }

  _bindPointerLock() { /* 已并入 _makeInput */ }

  _consumeLook() {
    const inp = this.input;
    const p = this.player;
    p.yaw += inp.lookDX;
    p.pitch += inp.lookDY;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    inp.lookDX = 0; inp.lookDY = 0;
  }

  // ============ 主循环 ============
  _tick(now) {
    requestAnimationFrame(this._tick);
    const rawDt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    let dt = rawDt;

    // 帧率监控：持续掉帧自动降渲染分辨率档位
    this._fpsEMA += (1 / Math.max(rawDt, 1e-4) - this._fpsEMA) * 0.03;
    this._fpsT += rawDt;
    if (this._fpsT > 2.5) {
      this._fpsT = 0;
      if (this._fpsEMA < 45 && this._prTier < this._prTiers.length - 1) {
        this._prTier++;
        this._resize();
      }
    }

    if (this._autoTest) {
      this._autoTest.t -= dt;
      if (this._autoTest.t <= 0 && this.state === 'menu') {
        this.startMatch(this._autoTest.mode, this._autoTest.diff);
      }
    }

    if (this.state === 'menu') {
      // 主菜单：相机绕战场缓巡，bot 自在巡逻
      this.menuAng += dt * 0.045;
      const r = 33;
      this.camera.position.set(Math.cos(this.menuAng) * r, 13.5, Math.sin(this.menuAng) * r);
      this.camera.lookAt(0, 1.5, 0);
      for (const b of this.bots.bots) b.update(dt);
    } else if (this.state === 'playing' && !this.over) {
      // 击杀 hitstop：时间缓一拍
      if (this.hitstopT > 0) {
        this.hitstopT -= dt;
        dt *= 0.22;
      }
      this._consumeLook();
      // 连杀奖励按键 + 射击模式/倍镜档位（X）
      if (this.input.useUav) { this.input.useUav = false; this.useUav(); }
      if (this.input.useStrike) { this.input.useStrike = false; this.useStrike(); }
      if (this.input.toggleFire) {
        this.input.toggleFire = false;
        if (this.inv.current === 'sr') { this.zoom2 = !this.zoom2; this.ui.streakBanner(this.zoom2 ? '倍镜 ×7.5' : '倍镜 ×3.8'); }
        else this.inv.switchFireMode();
      }
      this.player.update(dt, this.input);
      this.weapons.update(dt, this.input);
      this.input.jump = false;
      this.bots.update(dt);
      this._respawnUnits(dt);
      this.updateRewards(dt);
      this.updateKoth(dt);
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.endMatch();
      this.ui.updateHUD(dt);
      // 音乐强度
      const hot = this.combo > 0 || this.rewards.rampageT > 0 || this.pendingStrikes.length > 0 ||
        (performance.now() / 1000 - (this._lastCombatT || -9)) < 4;
      this.music.setIntensity(hot ? 2 : 1);
    } else if (this.state === 'paused') {
      this.ui.updateHUD(0);
    }

    // 旗帜飘动
    if (this.world.flags) {
      const tN2 = performance.now() / 1000;
      for (const cloth of this.world.flags) {
        const pos = cloth.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setZ(i, Math.sin(x * 3.2 + tN2 * 5.5) * 0.09 * (x / 1.6));
        }
        pos.needsUpdate = true;
        cloth.geometry.computeVertexNormals();
      }
    }

    // FOV：ADS 倍镜（狙击二段 ×7.5）
    const w = this.inv.w;
    let adsFov = w.adsFov;
    if (w.zoom2Fov && this.zoom2) adsFov = w.zoom2Fov;
    const targetFov = this.baseFov + (adsFov - this.baseFov) * this.player.adsT;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.25;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
