// ===== 玩家：移动/视角/姿态/回血 =====
import * as THREE from '../vendor/three.module.js';
import { PLAYER, WEAPONS, WEAPON_ORDER } from './config.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.team = 'blue';
    this.name = '指挥官';
    this.pos = new THREE.Vector3(0, 0, 0);   // 脚底
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.alive = true;
    this.crouchT = 0;                         // 0站 1蹲 平滑
    this.wantCrouch = false;
    this.grounded = true;
    this.adsT = 0;                            // 0..1 瞄准插值
    this.regenT = 0;
    this.eyeY = PLAYER.eyeStand;
    this.bobPhase = 0;
    this.stepAcc = 0;
    this.landK = 0;                           // 落地压弯
    this.recoilK = 0;                         // 枪口上抬恢复
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.deaths = 0; this.kills = 0; this.streak = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.lastDmgFrom = null;
    this.moveSpeed = 0;                       // 供脚步/FOV
    this.respawnT = 0;
    this.slideT = 0; this.slideCd = 0; this.slideDir = { x: 0, z: 0 };
    this.protectT = 0;
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeY, this.pos.z);
  }
  get dir() {
    const d = new THREE.Vector3(0, 0, -1);
    d.applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ'));
    return d;
  }
  get speedNow() { return Math.hypot(this.vel.x, this.vel.z); }
  get weapon() { return WEAPONS[this.game.inv.current]; }
  get crouching() { return this.crouchT > 0.5; }

  respawn(at) {
    this.pos.copy(at); this.vel.set(0, 0, 0);
    this.hp = PLAYER.hp; this.alive = true;
    this.protectT = 2.0;
    this.slideT = 0; this.slideCd = 0;
    this.regenT = 0; this.streak = 0;
    this.wantCrouch = false; this.grounded = true;
    this.game.inv.fullReset();
    // 朝向场地中心
    this.yaw = Math.atan2(this.pos.x, this.pos.z);
    this.pitch = 0;
  }

  damage(amount, from, head) {
    if (!this.alive) return;
    if (this.protectT > 0) amount *= 0.45;   // 重生保护
    this.hp -= amount;
    this.protectT = Math.max(0, this.protectT - 0.6);
    this.regenT = 0;
    this.lastDmgFrom = from;
    this.game.onPlayerHurt(from, head, amount);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.deaths++;
      this.game.onUnitKilled(this, from, head);
    }
  }

  update(dt, inp) {
    const g = this.game;
    if (!this.alive) {
      // 死亡镜头：缓慢升起
      this.respawnT = Math.max(0, this.respawnT - dt);
      this.eyeY += dt * 1.2;
      return;
    }

    // ---- 姿态 ----
    const wantC = inp.crouch && this.grounded;
    this.wantCrouch = wantC;
    const targetC = wantC || this.slideT > 0 ? 1 : 0;
    this.crouchT += (targetC - this.crouchT) * Math.min(1, dt * 10);
    const slideK = this.slideT > 0 ? 1 : 0;
    this.eyeY = PLAYER.eyeStand + (PLAYER.eyeCrouch - PLAYER.eyeStand) * this.crouchT - slideK * 0.24;

    // ---- ADS ----
    const canAds = !inp.sprint && this.speedNow < 6.4;
    this.adsT += (((inp.ads && canAds) ? 1 : 0) - this.adsT) * Math.min(1, dt * 12);

    // ---- 移动（脆手感：地面快速贴到目标速度）----
    const sprinting = inp.sprint && inp.moveY > 0.1 && !inp.ads && !wantC && this.grounded;
    let maxSp = PLAYER.walk;
    if (sprinting) maxSp = PLAYER.sprint;
    if (wantC && this.slideT <= 0) maxSp = PLAYER.crouch;
    if (inp.ads) maxSp = Math.min(maxSp, PLAYER.ads);

    // 触发滑铲：冲刺状态中按蹲（sprintWish 不含姿态，避免与 sprinting 互斥）
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const sprintWish = inp.sprint && inp.moveY > 0.1 && !inp.ads;
    if (sprintWish && wantC && this.grounded && spd > 6.2 && this.slideT <= 0 && this.slideCd <= 0) {
      this.slideT = PLAYER.slide.time;
      this.slideCd = 1.15;
      const inv = 1 / (spd || 1);
      this.slideDir = { x: this.vel.x * inv, z: this.vel.z * inv };
      g.audio.footstep(null, null, true);
    }
    this.slideCd = Math.max(0, this.slideCd - dt);
    this.slideT = Math.max(0, this.slideT - dt);
    const sliding = this.slideT > 0 && this.grounded;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, inp.moveY)
      .addScaledVector(right, inp.moveX);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(maxSp);

    if (sliding) {
      // 滑铲：沿初始方向冲，速度衰减；跳起=滑跳保留速度
      const k = this.slideT / PLAYER.slide.time;
      const sp = PLAYER.slide.endSpeed + (PLAYER.slide.speed - PLAYER.slide.endSpeed) * k;
      this.vel.x = this.slideDir.x * sp;
      this.vel.z = this.slideDir.z * sp;
      if (inp.jump) {
        this.vel.y = PLAYER.jumpV * 0.95;
        this.grounded = false;
        this.slideT = 0;
        g.audio.jump();
      }
    } else {
      const t = this.grounded ? Math.min(1, dt * 13) : Math.min(1, dt * 2.4);
      this.vel.x += (wish.x - this.vel.x) * t;
      this.vel.z += (wish.z - this.vel.z) * t;
      // 跳跃
      if (inp.jump && this.grounded && !wantC) {
        this.vel.y = PLAYER.jumpV; this.grounded = false;
        g.audio.jump();
      }
    }
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.vel.y -= PLAYER.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vel.y < -4) {
        g.audio.land(); this.landK = Math.min(1, -this.vel.y / 9);
      }
      this.pos.y = 0; this.vel.y = 0; this.grounded = true;
    }
    this.landK = Math.max(0, this.landK - dt * 4);

    // ---- 水平位移+碰撞 ----
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    g.world.slide(this.pos, PLAYER.radius);

    // ---- 脚步 ----
    if (this.grounded && this.moveSpeed > 0.8) {
      this.stepAcc += this.moveSpeed * dt;
      const stride = sprinting ? 2.6 : 2.0;
      if (this.stepAcc > stride) { this.stepAcc = 0; g.audio.footstep(null, null, true); }
      this.bobPhase += dt * this.moveSpeed * 1.35;
    }

    // ---- 回血 ----
    this.regenT += dt;
    if (this.regenT > PLAYER.regenDelay && this.hp < PLAYER.hp) {
      this.hp = Math.min(PLAYER.hp, this.hp + PLAYER.regenRate * dt);
    }

    // ---- 后坐恢复 ----
    this.recoilPitch *= Math.max(0, 1 - dt * 9);
    this.recoilYaw *= Math.max(0, 1 - dt * 9);

    // ---- 相机（含屏震）----
    const cam = g.camera;
    const tr = (g.trauma || 0) ** 2;
    const tN = performance.now() / 1000;
    const shX = tr * 0.04 * Math.sin(tN * 67.3);
    const shY = tr * 0.04 * Math.cos(tN * 55.7);
    const bobA = this.adsT > 0.5 ? 0.012 : 0.03;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * bobA * Math.min(1, this.moveSpeed / 4);
    const bobX = Math.sin(this.bobPhase) * bobA * Math.min(1, this.moveSpeed / 4);
    cam.position.set(
      this.pos.x + bobX * Math.cos(this.yaw) + shX,
      this.pos.y + this.eyeY - bobY - this.landK * 0.14 + shY,
      this.pos.z - bobX * Math.sin(this.yaw)
    );
    cam.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, Math.sin(this.bobPhase) * 0.006 + tr * 0.02 * Math.sin(tN * 71), 'YXZ');
  }

  addRecoil(r) {
    this.recoilPitch += r * (0.85 + Math.random() * 0.3);
    this.recoilYaw += (Math.random() - 0.5) * r * 0.8;
  }
}
