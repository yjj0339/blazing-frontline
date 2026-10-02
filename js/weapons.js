// ===== 武器：槽位/开火/换弹/第一人称视图模型/曳光/粒子/手雷 =====
import * as THREE from '../vendor/three.module.js';
import { WEAPONS, WEAPON_ORDER, GRENADE } from './config.js';

// ---------- 曳光弹池 ----------
class TracerPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 1),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 })
      );
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, t: 0 });
    }
  }
  fire(from, to, color) {
    const it = this.pool.find((p) => p.t <= 0);
    if (!it) return;
    const d = new THREE.Vector3().subVectors(to, from);
    const len = d.length();
    it.m.position.copy(from).addScaledVector(d, 0.5);
    it.m.lookAt(to);
    it.m.scale.set(1, 1, Math.max(0.5, len));
    it.m.material.color.set(color);
    it.m.material.opacity = 0.85;
    it.m.visible = true;
    it.t = 0.055;
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.t > 0) {
        p.t -= dt;
        p.m.material.opacity = Math.max(0, p.t / 0.055) * 0.85;
        if (p.t <= 0) p.m.visible = false;
      }
    }
  }
}

// ---------- 命中粒子池 ----------
class SparkPool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
      m.visible = false;
      scene.add(m);
      this.items.push({ m, v: new THREE.Vector3(), t: 0 });
    }
  }
  burst(pos, color, n = 6, speed = 5, awayFrom = null) {
    let c = 0;
    for (const it of this.items) {
      if (it.t > 0) continue;
      it.m.position.copy(pos);
      it.m.material.color.set(color);
      it.v.set((Math.random() - 0.5) * 2, Math.random() * 0.8, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      // 火花背向镜头飞，避免糊脸放大成色块
      if (awayFrom) {
        const away = pos.clone().sub(awayFrom);
        away.y = 0;
        if (away.lengthSq() > 1e-6) it.v.addScaledVector(away.normalize(), speed * 0.9);
      }
      it.t = 0.26 + Math.random() * 0.2;
      it.m.visible = true;
      if (++c >= n) break;
    }
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t > 0) {
        it.t -= dt;
        it.v.y -= 12 * dt;
        it.m.position.addScaledVector(it.v, dt);
        if (it.t <= 0) it.m.visible = false;
      }
    }
  }
}

// ---------- 手雷 ----------
class Grenades {
  constructor(scene) { this.scene = scene; this.live = []; this.mesh = null; }
  throw_(from, dir, owner) {
    if (!this.mesh) {
      // 用一个小球代替（模型可选）
      this.mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.7 })
      );
    }
    const m = this.mesh.clone();
    m.position.copy(from);
    m.castShadow = true;
    this.scene.add(m);
    this.live.push({
      m, owner, t: GRENADE.fuse,
      v: dir.clone().multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(0, 3.2, 0)),
    });
  }
  update(dt, game) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.t -= dt;
      g.v.y -= 16 * dt;
      g.m.position.addScaledVector(g.v, dt);
      g.m.rotation.x += dt * 9; g.m.rotation.z += dt * 7;
      if (g.m.position.y < 0.09) {
        g.m.position.y = 0.09;
        g.v.y = Math.abs(g.v.y) * 0.35;
        g.v.x *= 0.6; g.v.z *= 0.6;
        game.world.slide(g.m.position, 0.1);
      }
      if (g.t <= 0) {
        game.explode(g.m.position.clone(), g.owner);
        this.scene.remove(g.m);
        this.live.splice(i, 1);
      }
    }
  }
}

// ---------- 第一人称视图模型 ----------
let muzzleTex = null;
function getMuzzleTexture() {
  if (muzzleTex) return muzzleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,240,190,1)');
  rg.addColorStop(0.35, 'rgba(255,180,70,0.9)');
  rg.addColorStop(0.75, 'rgba(255,120,30,0.35)');
  rg.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  // 星芒
  g.strokeStyle = 'rgba(255,220,140,0.9)';
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
    g.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29);
    g.stroke();
  }
  muzzleTex = new THREE.CanvasTexture(c);
  return muzzleTex;
}

const MUZZLE_POS = { ar: [0, 0.505, 0.045], sg: [0, 0.47, 0.05], sr: [0, 0.67, 0.045], pg: [0, 0.165, 0.038] };
const MUZZLE_SIZE = { ar: 0.17, sg: 0.22, sr: 0.2, pg: 0.13 };

class ViewModel {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.models = {};
    this.flashes = {};
    this.flashT = 0;
    this.current = null;
    this.kick = 0; this.reloadK = 0;
    this.swapT = 0;
    game.camera.add(this.group);
  }
  build(gltfs) {
    for (const k of WEAPON_ORDER) {
      const gl = gltfs['fp_' + k];
      if (!gl) continue;
      const m = gl.scene;
      m.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; c.frustumCulled = false; } });
      m.visible = false;
      // 基础位姿（右手原点在握把）
      m.position.set(0, 0, 0);
      this.models[k] = m;
      this.group.add(m);
      // 枪口火光面片
      const [mx, my, mz] = MUZZLE_POS[k] || [0, 0.5, 0.05];
      const s = MUZZLE_SIZE[k] || 0.16;
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s),
        new THREE.MeshBasicMaterial({
          map: getMuzzleTexture(), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        })
      );
      flash.position.set(mx, my, mz);
      flash.visible = false;
      flash.frustumCulled = false;
      flash.renderOrder = 5;
      this.group.add(flash);
      this.flashes[k] = flash;
    }
    this.flashT = 0;
  }
  show(k) {
    if (this.current) this.current.visible = false;
    this.current = this.models[k];
    if (this.current) this.current.visible = true;
    this.swapT = 0.32;
    this.game.audio.draw();
  }
  fireKick(w) {
    this.kick = Math.min(1.6, this.kick + 1);
    this._baseKick = w.kick;
    const fl = this.flashes[this.game.inv.current];
    if (fl) {
      fl.visible = true;
      fl.rotation.z = Math.random() * Math.PI;
      fl.scale.setScalar(0.85 + Math.random() * 0.5);
      this.flashT = 0.045;
    }
  }
  update(dt, player, inp) {
    if (!this.current) return;
    // 狙击高倍开镜：隐藏枪模（用全屏镜片遮罩）
    const w = this.game.inv.w;
    const hideForScope = w.scope && player.adsT > 0.82;
    this.group.visible = !hideForScope;
    if (hideForScope) return;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        for (const k in this.flashes) this.flashes[k].visible = false;
      }
    }
    this.kick = Math.max(0, this.kick - dt * 9);
    this.swapT = Math.max(0, this.swapT - dt);
    const ads = player.adsT;
    // 腰射位 ↔ 机瞄位（贴中；AR 照门粗大，整体再下沉避免糊视野）
    const isAR = this.game.inv.current === 'ar';
    const hip = new THREE.Vector3(0.16, -0.155, -0.34);
    const aim = new THREE.Vector3(0, isAR ? -0.135 : -0.088, isAR ? -0.3 : -0.26);
    const p = hip.clone().lerp(aim, ads);
    const sprintK = inp.sprint && player.moveSpeed > 5 ? 1 : 0;
    // 奔跑摆枪
    const t = performance.now() / 1000;
    p.x += sprintK * Math.sin(t * 7.5) * 0.03 * (1 - ads);
    p.y += sprintK * Math.abs(Math.cos(t * 7.5)) * 0.026 * (1 - ads) - sprintK * 0.045;
    // 走路 bob
    const bobA = (1 - ads) * Math.min(1, player.moveSpeed / 5) * 0.011;
    p.y += Math.abs(Math.sin(player.bobPhase * 2)) * bobA;
    p.x += Math.sin(player.bobPhase) * bobA * 0.7;
    // 换弹动作：下沉+翻转
    const rl = player.reloadT > 0 ? Math.sin(Math.min(1, player.reloadT / 0.35) * Math.PI * 0.5) : 0;
    p.y -= rl * 0.14;
    // 换枪：下沉回弹
    p.y -= this.swapT * 0.5;
    // 开火后坐：往后+上抬
    const k = this.kick * (this._baseKick || 0.05);
    p.z += k * 0.55;
    p.y += k * 0.08;
    this.group.position.copy(p);
    this.group.rotation.set(k * 0.28 + rl * 0.7, 0, 0);
  }
}

// ---------- 武器槽位/状态 ----------
export class Inventory {
  constructor(game) {
    this.game = game;
    this.state = {};
    for (const k of WEAPON_ORDER) {
      const w = WEAPONS[k];
      this.state[k] = { mag: w.mag, reserve: w.reserve };
    }
    this.current = 'ar';
    this.fireT = 0;
    this.reloadT = 0;
    this.swapT = 0;
    this.triggerHeld = false;
    this.burstLeft = 0;
    this.fireMode = 0;      // AR：AUTO / 三连发
    this.grenades = GRENADE.carry;
    this.grenadeT = 0;
  }
  get w() { return WEAPONS[this.current]; }
  get st() { return this.state[this.current]; }
  fullReset() {
    for (const k of WEAPON_ORDER) {
      const w = WEAPONS[k];
      this.state[k] = { mag: w.mag, reserve: w.reserve };
    }
    this.current = 'ar';
    this.fireT = 0; this.reloadT = 0; this.swapT = 0;
    this.grenades = GRENADE.carry; this.grenadeT = 0;
  }
  switchTo(k) {
    if (k === this.current || this.swapT > 0) return;
    if (!WEAPONS[k]) return;
    this.reloadT = 0;
    this.current = k;
    this.swapT = 0.36;
    this.game.vm.show(k);
    this.game.ui.refreshAmmo();
  }
  cycle(dir) {
    const i = WEAPON_ORDER.indexOf(this.current);
    this.switchTo(WEAPON_ORDER[(i + dir + 4) % 4]);
  }
  switchFireMode() {
    const w = this.w;
    if (!w.modes) return;
    this.fireMode = (this.fireMode + 1) % w.modes.length;
    this.game.ui.streakBanner(`${w.name} · ${w.modes[this.fireMode]}`);
    this.game.ui.refreshAmmo();
  }
  startReload() {
    const w = this.w, st = this.st;
    if (this.reloadT > 0 || st.mag >= w.mag || st.reserve <= 0 || this.swapT > 0) return;
    this.reloadT = w.reload;
    this.game.audio.reload(this.current);
  }
  update(dt, wantFire) {
    this.fireT = Math.max(0, this.fireT - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.grenadeT = Math.max(0, this.grenadeT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.w, st = this.st;
        const need = w.mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take; st.reserve -= take;
        this.game.ui.refreshAmmo();
      }
    }
    // 手雷补充
    if (this.grenades < GRENADE.carry) {
      this._replenish = (this._replenish || 0) + dt;
      if (this._replenish >= GRENADE.replenish) {
        this._replenish = 0;
        this.grenades++;
        this.game.ui.refreshAmmo();
      }
    }
  }
  canFire() {
    const ramp = this.game.rewards && this.game.rewards.rampageT > 0;
    return this.fireT <= 0 && this.reloadT <= 0 && this.swapT <= 0 && (this.st.mag > 0 || ramp);
  }
  consume() {
    const ramp = this.game.rewards && this.game.rewards.rampageT > 0;
    if (!ramp) this.st.mag--;
    this.fireT = 60 / (this.w.rpm * (ramp ? 1.6 : 1));
  }
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.tracers = new TracerPool(game.scene);
    this.sparks = new SparkPool(game.scene);
    this.grenades = new Grenades(game.scene);
    this.muzzleT = 0;
  }
  buildViewModel(gltfs) {
    this.vm = new ViewModel(this.game);
    this.game.vm = this.vm;
    this.vm.build(gltfs);
  }
  // 玩家每帧
  update(dt, inp) {
    const g = this.game, p = g.player, inv = g.inv;
    inv.update(dt, inp.firing);
    this.tracers.update(dt);
    this.sparks.update(dt);
    this.grenades.update(dt, g);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    if (g.muzzleLight) g.muzzleLight.intensity = this.muzzleT * 22;

    if (!p.alive) return;
    if (inp.reload) { inv.startReload(); inp.reload = false; }
    if (inp.switchTo) { inv.switchTo(inp.switchTo); inp.switchTo = null; }
    if (inp.cycle) { inv.cycle(inp.cycle); inp.cycle = 0; }
    if (inp.grenade && p.alive && inv.grenades > 0 && inv.grenadeT <= 0 && inv.swapT <= 0) {
      inp.grenade = false;
      inv.grenades--;
      inv.grenadeT = 0.8;
      const eye = p.eyePos;
      this.grenades.throw_(eye.addScaledVector(p.dir, 0.4), p.dir.clone(), p);
      g.audio.pin();
      g.ui.refreshAmmo();
    } else inp.grenade = false;

    const want = inp.firing;
    const edge = want && !this._prevFiring;
    this._prevFiring = want;
    const w = inv.w;
    const auto = w.auto && inv.fireMode === 0;
    // 三连发队列
    if (inv.burstLeft > 0 && inv.fireT <= 0 && inv.reloadT <= 0 && inv.swapT <= 0) {
      if (inv.st.mag > 0 || (this.game.rewards && this.game.rewards.rampageT > 0)) this.playerFire();
      else inv.burstLeft = 0;
    }
    const wantShot = auto ? want : (edge && !this._burstLatch);
    if (wantShot && inv.canFire()) {
      if (inv.st.mag <= 0 && !(this.game.rewards && this.game.rewards.rampageT > 0)) {
        g.audio.dryFire(); inv.fireT = 0.2; return;
      }
      this.playerFire();
      if (!auto && w.modes && inv.fireMode === 1) {
        inv.burstLeft = 2;              // 三连发：首发出膛后还有 2 发
        this._burstLatch = true;
      }
    }
    if (!want) { this._burstLatch = false; }
    if (!want && inv.st.mag === 0 && inv.fireT <= 0 && !inv._dryPlayed) {
      g.audio.dryFire(); inv.fireT = 0.25; inv._dryPlayed = true;
      inv.startReload();
    }
    if (want) inv._dryPlayed = false;
    this.vm.update(dt, p, inp);
  }

  playerFire() {
    const g = this.game, p = g.player, inv = g.inv, w = inv.w;
    inv.consume();
    p.shotsFired++;
    p.addRecoil(w.recoil * (1 - p.adsT * 0.45) * 0.017);
    this.vm.fireKick(w);
    g.addTrauma(0.035);
    g._lastCombatT = performance.now() / 1000;
    this.muzzleT = 0.05;
    g.audio.shoot(w.id, null, null);
    // 扩散
    const moveK = Math.min(1, p.moveSpeed / 5);
    let spread = (w.spreadStand + w.spreadMove * moveK) * (1 - p.adsT);
    spread += w.spreadAds * p.adsT;
    if (!p.grounded) spread += w.spreadJump;
    if (p.crouching) spread *= 0.7;
    const spreadRad = spread * Math.PI / 180;
    const eye = p.eyePos;
    const n = w.pellets || 1;
    let anyHit = false, anyHead = false;
    for (let i = 0; i < n; i++) {
      const dir = p.dir.clone();
      // 随机锥形
      const u = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dir.addScaledVector(u, Math.tan(spreadRad) * Math.random()).normalize();
      const res = g.fireHitscan(p, eye, dir, w);
      if (res.hitUnit) { anyHit = true; if (res.head) anyHead = true; }
      if (res.point) {
        this.tracers.fire(eye.clone().addScaledVector(dir, 1.2).addScaledVector(p.dir, 0.4), res.point, w.tracer);
        if (res.hitUnit) {
          this.sparks.burst(res.point, anyHead ? 0xff5a4d : 0xffd27a, 5, 4, eye);
        } else {
          this.sparks.burst(res.point, 0xbfae8e, 4, 3, eye);
        }
      }
    }
    if (anyHit) {
      p.shotsHit++;
      g.ui.hitmarker(anyHead);
      g.audio.hit(anyHead);
    }
    // 抛壳
    const rightV = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const shellPos = eye.clone().addScaledVector(p.dir, 0.45).addScaledVector(rightV, 0.13);
    shellPos.y -= 0.06;
    this.sparks.burst(shellPos, 0xd8b04a, 2, 2.4);
    g.ui.refreshAmmo();
    g.botHearShot(p.pos, 42);
  }
}
