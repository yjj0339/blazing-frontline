// ===== Bot AI：感知/游走/交战/寻路/动画 =====
import * as THREE from '../vendor/three.module.js';
import { WEAPONS, DIFFS, BOT_NAMES, TEAM_COLOR } from './config.js';

const AR = WEAPONS.ar;

export class Bot {
  constructor(game, team, name, isFFA = false) {
    this.game = game;
    this.isPlayer = false;
    this.team = team;
    this.name = name;
    this.isFFA = isFFA;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.hp = 100;
    this.alive = true;
    this.kills = 0; this.deaths = 0; this.streak = 0;

    this.state = 'roam';
    this.target = null;
    this.lastSeen = null;         // Vector3
    this.reactT = 0;
    this.burstLeft = 0;
    this.burstCd = 0;
    this.fireT = 0;
    this.mag = AR.mag;
    this.reloadT = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.roamPt = null;
    this.path = null; this.pathI = 0; this.repathT = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.walkPhase = 0;
    this.moveSpeed = 0;
    this.deadT = 0;
    this.respawnT = 0;
    this.observeT = 0;            // 站桩观察
    this.heardShotT = 0; this.heardPos = null;
    this.loseT = 0;
    this.visionK = 1;
  }

  get eyeY() { return 1.5; }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeY, this.pos.z); }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  spawnAt(p) {
    this.pos.copy(p);
    this.hp = 100; this.alive = true;
    this.state = 'roam'; this.target = null; this.lastSeen = null;
    this.path = null; this.roamPt = null; this.mag = AR.mag; this.reloadT = 0;
    this.deadT = 0; this.streak = 0;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.rotation.set(0, this.yaw + Math.PI, 0);
      this.mesh.position.copy(this.pos);
    }
  }

  // ---------- 感知 ----------
  canSee(u) {
    if (!u.alive) return false;
    if (this.game.mode === 'tdm' && u.team === this.team) return false;
    const d = this.pos.distanceTo(u.pos);
    const diff = this.game.diff;
    if (d > diff.vision * this.visionK) return false;
    // FOV（近距全向感知）
    if (d > 6) {
      const f = this.forward();
      const dx = (u.pos.x - this.pos.x) / d, dz = (u.pos.z - this.pos.z) / d;
      if (f.x * dx + f.z * dz < Math.cos(1.15)) return false; // ~132°
    }
    const a = this.eyePos(), b = u.isPlayer ? u.eyePos : u.eyePos();
    return this.game.world.losClear(a, b);
  }

  sense(dt) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const u of g.allUnits()) {
      if (u === this || !u.alive) continue;
      if (g.mode === 'tdm' && u.team === this.team) continue;
      const d = this.pos.distanceTo(u.pos);
      if (d < bd && this.canSee(u)) { bd = d; best = u; }
    }
    if (best) {
      if (this.target !== best) {
        this.target = best;
        // 反应时间：距离越近越快
        this.reactT = this.game.diff.react * (0.7 + Math.random() * 0.6) * (bd > 30 ? 1.4 : 1);
        if (best.isPlayer) this.game.botSay(this, ['发现目标！', '指挥官在那边！', '看到他了！'][(Math.random() * 3) | 0]);
      }
      this.state = 'combat';
      this.lastSeen = best.pos.clone();
      this.loseT = 0;
    } else if (this.state === 'combat') {
      this.loseT += dt;
      if (!this.target || !this.target.alive || this.loseT > 2.5 || !this.canSee(this.target)) {
        this.state = 'hunt';
        this.burstLeft = 0;
      }
    }
    // 枪声吸引
    if (this.heardShotT > 0) {
      this.heardShotT -= dt;
      if (this.state === 'roam' && this.heardPos) {
        this.state = 'hunt';
        this.lastSeen = this.heardPos.clone();
      }
    }
    if (this.target && !this.target.alive) { this.target = null; if (this.state === 'combat') this.state = 'hunt'; }
  }

  // ---------- 行为 ----------
  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT < 0.4) {
        const k = this.deadT / 0.4;
        this.mesh.rotation.x = k * Math.PI / 2 * 0.96;
        this.mesh.position.y = Math.sin(k * Math.PI) * 0.16; // 倒地小弹跳
      }
      if (this.deadT > 2.6) this.mesh.visible = false;
      return;
    }
    this.sense(dt);
    this.fireT = Math.max(0, this.fireT - dt);
    this.burstCd = Math.max(0, this.burstCd - dt);
    this.observeT = Math.max(0, this.observeT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.mag = AR.mag; this.burstLeft = 0; this.burstCd = 0.35; }
    }

    let wishX = 0, wishZ = 0, speed = g.diff.speed;

    if (this.state === 'combat' && this.target) {
      const t = this.target;
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz);
      this.turnToward(wantYaw, dt, 10);
      // 反应计时
      if (this.reactT > 0) this.reactT -= dt;
      // 走位：侧移 + 距离维持
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir = Math.random() > 0.5 ? 1 : -1; this.strafeT = 0.7 + Math.random() * 1.1; }
      const f = this.forward();
      const side = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(this.strafeDir);
      let adv = 0;
      if (dist > 26) adv = 0.7;
      else if (dist < 9) adv = -0.55;
      wishX = f.x * adv + side.x * 0.75;
      wishZ = f.z * adv + side.z * 0.75;
      speed *= 0.62;
      // 开火
      if (this.reactT <= 0 && this.reloadT <= 0 && Math.abs(this.angDiff(wantYaw, this.yaw)) < 0.14) {
        this.tryFire(t, dist, dt);
      }
    } else if (this.state === 'hunt' && this.lastSeen) {
      const dx = this.lastSeen.x - this.pos.x, dz = this.lastSeen.z - this.pos.z;
      if (Math.hypot(dx, dz) < 2.2) { this.state = 'roam'; this.lastSeen = null; this.observeT = 0.8 + Math.random(); }
      else { wishX = dx; wishZ = dz; speed *= 0.92; }
      this.turnToward(Math.atan2(-dx, -dz), dt, 8);
    }

    if (this.state === 'roam' || (this.state === 'hunt' && !this.lastSeen)) {
      this.state = 'roam';
      if (this.observeT > 0) {
        // 站桩扫视
        this.yaw += Math.sin(performance.now() / 400) * dt * 1.6;
      } else {
        if (!this.roamPt || Math.hypot(this.roamPt.x - this.pos.x, this.roamPt.z - this.pos.z) < 2) {
          this.roamPt = this.pickRoam();
          this.path = null;
        }
        if (!this.path && this.roamPt) {
          this.path = g.world.findPath(this.pos, this.roamPt);
          this.pathI = 0;
        }
        if (this.path) {
          while (this.pathI < this.path.length - 1) {
            const n = this.path[this.pathI];
            if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 1.4) this.pathI++;
            else break;
          }
          const n = this.path[Math.min(this.pathI, this.path.length - 1)];
          wishX = n.x - this.pos.x; wishZ = n.z - this.pos.z;
          this.turnToward(Math.atan2(-wishX, -wishZ), dt, 6);
        }
        if (Math.random() < dt * 0.06) this.observeT = 0.5 + Math.random() * 0.9;
      }
      speed *= 0.8;
    }

    // 移动
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0.01) {
      wishX /= wl; wishZ /= wl;
      this.moveSpeed = speed;
    } else this.moveSpeed = 0;

    const step = (this.reloadT > 0 && this.state === 'combat') ? speed * 0.4 : speed;
    this.pos.x += wishX * step * dt;
    this.pos.z += wishZ * step * dt;
    g.world.slide(this.pos, 0.38);

    // 卡住检测
    if (this.moveSpeed > 0.1) {
      if (this.pos.distanceTo(this.lastPos) < 0.4 * step * dt + 0.005) {
        this.stuckT += dt;
        if (this.stuckT > 0.9) {
          this.stuckT = 0; this.path = null; this.roamPt = null;
          this.strafeDir *= -1;
          this.pos.x += (Math.random() - 0.5) * 0.6;
          g.world.slide(this.pos, 0.38);
        }
      } else this.stuckT = 0;
    }
    this.lastPos.copy(this.pos);
    this.walkPhase += dt * (this.moveSpeed > 0.1 ? this.moveSpeed * 1.5 : 0);
    this.updateMesh(dt);
  }

  pickRoam() {
    // 偏向有敌人的区域（偏向地图中部与敌方半场）
    const g = this.game;
    let pt;
    if (Math.random() < 0.4) {
      // 朝最近敌人方向
      let en = null, bd = Infinity;
      for (const u of g.allUnits()) {
        if (u === this || !u.alive) continue;
        if (g.mode === 'tdm' && u.team === this.team) continue;
        const d = this.pos.distanceTo(u.pos);
        if (d < bd) { bd = d; en = u; }
      }
      if (en) {
        pt = { x: en.pos.x + (Math.random() - 0.5) * 14, z: en.pos.z + (Math.random() - 0.5) * 14 };
      }
    }
    if (!pt) pt = g.world.randomRoam();
    pt.x = Math.max(-37, Math.min(37, pt.x));
    pt.z = Math.max(-37, Math.min(37, pt.z));
    return pt;
  }

  angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  turnToward(want, dt, k) {
    const d = this.angDiff(want, this.yaw);
    this.yaw += d * Math.min(1, dt * k);
  }

  tryFire(target, dist, dt) {
    const g = this.game, diff = g.diff;
    if (this.burstLeft <= 0) {
      if (this.burstCd <= 0) {
        this.burstLeft = 2 + ((Math.random() * diff.burst) | 0);
        this.burstCd = 0.45 + Math.random() * 0.75;
      }
      return;
    }
    if (this.fireT > 0) return;
    // 弹匣
    if (this.mag <= 0) { this.reloadT = AR.reload; this.burstLeft = 0; return; }
    this.fireT = 60 / AR.rpm;
    this.burstLeft--;
    if (this.burstLeft <= 0) this.burstCd = 0.45 + Math.random() * 0.75;
    this.mag--;

    const muzzle = this.eyePos().addScaledVector(this.forward(), 0.55).add(new THREE.Vector3(0, -0.12, 0));
    g.audio.shoot('ar', this.pos, g.camera);
    g.botHearShot(this.pos, 40, this);

    // 命中率模型
    const moving = this.moveSpeed > 0.5;
    const tMoving = target.isPlayer ? target.moveSpeed > 1.5 : target.moveSpeed > 0.5;
    let p = diff.acc * Math.max(0.28, Math.min(1.15, 1.25 - dist / diff.vision));
    if (moving) p *= 0.72;
    if (tMoving) p *= 0.8;
    if (target.isPlayer && target.crouching) p *= 0.85;
    const hit = Math.random() < p;

    if (hit) {
      const r = Math.random();
      const head = r < 0.10;
      const leg = r > 0.82;
      let dmg = AR.dmg * (head ? AR.headMul : 1) * (leg ? 0.75 : 1);
      if (!target.isPlayer) dmg *= 0.62;   // bot 互伤降低，拉长战场节奏
      dmg *= diff.dmgMul;
      const hitPos = target.isPlayer
        ? target.eyePos.clone().add(new THREE.Vector3(0, head ? 0 : -0.5, 0))
        : target.eyePos().add(new THREE.Vector3(0, head ? 1.5 : 0.9, 0));
      g.weapons.tracers.fire(muzzle, hitPos, AR.tracer);
      g.weapons.sparks.burst(hitPos, head ? 0xff5a4d : 0xffd27a, 4, 3.5);
      target.damage(dmg, this, head);
    } else {
      // 失弹：目标附近偏移
      const aim = target.isPlayer
        ? target.eyePos.clone()
        : target.eyePos().add(new THREE.Vector3(0, 1.2, 0));
      aim.x += (Math.random() - 0.5) * 2.6;
      aim.y += (Math.random() - 0.5) * 1.4;
      aim.z += (Math.random() - 0.5) * 2.6;
      const dir = aim.sub(muzzle).normalize();
      const res = g.rayWorld(muzzle, dir, dist + 12);
      const end = res ? res.point : muzzle.clone().addScaledVector(dir, dist + 10);
      g.weapons.tracers.fire(muzzle, end, AR.tracer);
      if (res) g.weapons.sparks.burst(end, 0xbfae8e, 3, 2.5);
      // 擦身威胁：玩家近距 miss 有 whiz 音（省）
    }
  }

  // ---------- 模型 ----------
  buildMesh(soldierGltf, teamMats) {
    const root = soldierGltf.scene.clone(true);
    const parts = {};
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        if (o.material && o.material.name === 'T_main') o.material = teamMats.main;
        else if (o.material && o.material.name === 'T_vest') o.material = teamMats.vest;
      }
    });
    for (const n of ['head', 'torso', 'arm_L', 'arm_R', 'leg_L', 'leg_R', 'rifle']) {
      parts[n] = root.getObjectByName(n);
    }
    // 持枪姿态
    if (parts.arm_R) parts.arm_R.rotation.set(-1.25, 0, -0.18);
    if (parts.arm_L) parts.arm_L.rotation.set(-1.45, 0.25, 0.5);
    this.parts = parts;
    this.mesh = root;
    root.visible = false;
    this.game.scene.add(root);
    return root;
  }

  updateMesh(dt) {
    const m = this.mesh;
    if (!m) return;
    m.position.copy(this.pos);
    m.rotation.set(0, this.yaw + Math.PI, 0);
    const spK = Math.min(1, this.moveSpeed / 4);
    const s = Math.sin(this.walkPhase), c = Math.sin(this.walkPhase + Math.PI);
    if (this.parts.leg_L) this.parts.leg_L.rotation.x = s * 0.6 * spK;
    if (this.parts.leg_R) this.parts.leg_R.rotation.x = c * 0.6 * spK;
    if (this.parts.torso) {
      this.parts.torso.rotation.x = 0.06 * spK + Math.abs(s) * 0.02;
      this.parts.torso.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.035 * spK;
    }
    if (this.parts.arm_R) this.parts.arm_R.rotation.x = -1.25 + c * 0.1 * spK;
    if (this.parts.arm_L) this.parts.arm_L.rotation.x = -1.45 + s * 0.1 * spK;
  }

  die() {
    this.alive = false;
    this.deaths++;
    this.deadT = 0;
    this.target = null;
  }

  damage(amount, from, head) {
    if (!this.alive) return;
    this.hp -= amount;
    if (from && from.alive && from !== this) {
      if (this.canSee(from)) {
        this.target = from;
        this.state = 'combat';
        this.reactT = Math.min(this.reactT > 0 ? this.reactT : 0.12, this.game.diff.react * 0.5);
        this.lastSeen = from.pos.clone();
      } else if (this.state !== 'combat') {
        this.state = 'hunt';
        this.lastSeen = from.pos.clone();
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      this.game.onUnitKilled(this, from, head);
    }
  }
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.teamMats = {
      blue: { main: this._mat(TEAM_COLOR.blue.main), vest: this._mat(0x1f4d7d) },
      red: { main: this._mat(TEAM_COLOR.red.main), vest: this._mat(0x7d2a1c) },
    };
  }
  _mat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 1 });
  }
  spawnAll(mode) {
    const g = this.game;
    for (const b of this.bots) g.scene.remove(b.mesh);
    this.bots = [];
    const names = { ...BOT_NAMES };
    if (mode === 'tdm') {
      for (let i = 0; i < 6; i++) this.bots.push(new Bot(g, 'blue', names.blue[i]));
      for (let i = 0; i < 7; i++) this.bots.push(new Bot(g, 'red', names.red[i]));
    } else {
      const pool = [...names.ffa, ...names.red.slice(0, 1)];
      for (let i = 0; i < 7; i++) this.bots.push(new Bot(g, 'red', pool[i], true));
    }
    for (const b of this.bots) b.buildMesh(g.assets.soldier, this.teamMats[b.team === 'blue' ? 'blue' : 'red']);
  }
  update(dt) {
    for (const b of this.bots) b.update(dt);
    // 单位间轻推
    const g = this.game;
    const units = [...this.bots.filter((b) => b.alive), ...(g.player.alive ? [g.player] : [])];
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.55 * 0.55 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.55 - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
      }
    }
  }
}
