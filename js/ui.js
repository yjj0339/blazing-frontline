// ===== 全部界面：HUD/菜单/结算/小地图/移动端 =====
import * as THREE from '../vendor/three.module.js';
import { MODES, DIFFS, WEAPONS, LS_SETTINGS, LS_STATS, TEAM_COLOR, REWARDS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.settings = this.loadSettings();
    this.stats = this.loadStats();
    this.mode = 'tdm';
    this.diff = 'normal';
    this.dmgPool = [];
    this._kfTimers = [];
    this.hitT = 0;
    this.buildMenus();
    this.bindSettings();
  }

  loadSettings() {
    try { return { ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; } catch { return {}; }
  }
  saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(this.settings)); }
  loadStats() {
    const def = { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 };
    try { return { ...def, ...JSON.parse(localStorage.getItem(LS_STATS) || '{}') }; } catch { return def; }
  }
  saveStats() { localStorage.setItem(LS_STATS, JSON.stringify(this.stats)); }

  // ---------- 屏幕切换 ----------
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  toMenu() {
    this.hide('hud'); this.hide('end-panel'); this.hide('pause-panel');
    this.show('menu'); this.refreshMenuStats();
    if (document.exitPointerLock) document.exitPointerLock();
    this.game.state = 'menu';
  }
  toGame() {
    this.hide('menu'); this.hide('end-panel'); this.hide('pause-panel');
    this.show('hud');
    this.game.state = 'playing';
    this.refreshRewards();
  }

  // ---------- 菜单 ----------
  buildMenus() {
    // 模式卡
    const modeWrap = $('mode-cards');
    for (const [k, m] of Object.entries(MODES)) {
      const div = document.createElement('div');
      div.className = 'card mode-card' + (k === 'tdm' ? ' sel' : '');
      div.innerHTML = `<b>${m.label}</b><span>${m.desc}</span>`;
      div.onclick = () => {
        this.mode = k;
        [...modeWrap.children].forEach((c) => c.classList.remove('sel'));
        div.classList.add('sel');
        this.game.audio.uiClick();
      };
      modeWrap.appendChild(div);
    }
    // 难度
    const diffWrap = $('diff-cards');
    for (const [k, d] of Object.entries(DIFFS)) {
      const div = document.createElement('div');
      div.className = 'card diff-card' + (k === 'normal' ? ' sel' : '');
      div.innerHTML = `<b>${d.label}</b>`;
      div.onclick = () => {
        this.diff = k;
        [...diffWrap.children].forEach((c) => c.classList.remove('sel'));
        div.classList.add('sel');
        this.game.audio.uiClick();
      };
      diffWrap.appendChild(div);
    }
    $('btn-play').onclick = () => { this.game.audio.uiClick(); this.game.startMatch(this.mode, this.diff); };
    $('btn-help').onclick = () => { this.game.audio.uiClick(); this.show('help-panel'); };
    $('help-close').onclick = () => this.hide('help-panel');
    $('btn-settings').onclick = () => { this.game.audio.uiClick(); this.show('settings-panel'); };
    $('settings-close').onclick = () => { this.saveSettings(); this.hide('settings-panel'); };
    $('pause-resume').onclick = () => this.game.togglePause(false);
    $('pause-settings').onclick = () => { this.show('settings-panel'); };
    $('pause-quit').onclick = () => this.game.quitMatch();
    $('end-again').onclick = () => { this.game.startMatch(this.game.mode, this.game.diffKey); };
    $('end-menu').onclick = () => this.game.quitMatch();
    // hover 音
    document.querySelectorAll('button, .card').forEach((el) => {
      el.addEventListener('mouseenter', () => this.game.audio.uiHover());
    });
    this.refreshMenuStats();
  }

  refreshMenuStats() {
    const s = this.stats;
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    $('menu-stats').innerHTML =
      `出战 <b>${s.matches}</b> 场 · 胜 <b>${s.wins}</b> · 击杀 <b>${s.kills}</b> · 阵亡 <b>${s.deaths}</b> · K/D <b>${kd}</b> · 最高连杀 <b>${s.bestStreak}</b>`;
  }

  bindSettings() {
    const st = this.settings;
    st.sens ??= 1.0; st.fov ??= 75; st.vol ??= 0.8; st.shadow ??= true; st.xcolor ??= '#7fe07f';
    const sens = $('set-sens'), fov = $('set-fov'), vol = $('set-vol'), shadow = $('set-shadow'), xc = $('set-xcolor');
    sens.value = st.sens; fov.value = st.fov; vol.value = st.vol; shadow.checked = st.shadow; xc.value = st.xcolor;
    const upd = () => {
      st.sens = parseFloat(sens.value); st.fov = parseFloat(fov.value);
      st.vol = parseFloat(vol.value); st.shadow = shadow.checked; st.xcolor = xc.value;
      $('set-sens-v').textContent = st.sens.toFixed(2);
      $('set-fov-v').textContent = st.fov;
      this.game.applySettings(st);
      this.saveSettings();
    };
    sens.oninput = upd; fov.oninput = upd; vol.oninput = upd; shadow.onchange = upd; xc.oninput = upd;
    upd();
  }

  // ---------- HUD ----------
  refreshAmmo() {
    const g = this.game;
    if (!g.inv) return;
    const w = g.inv.w, st = g.inv.st;
    $('ammo-mag').textContent = st.mag;
    $('ammo-res').textContent = '/ ' + st.reserve;
    $('wname').textContent = w.name;
    $('grenade-n').textContent = '×' + g.inv.grenades;
    const slots = $('weapon-slots');
    [...slots.children].forEach((el, i) => {
      el.classList.toggle('sel', WEAPONS[Object.keys(WEAPONS)[i]].slot === w.slot || el.dataset.k === g.inv.current);
    });
  }

  updateHUD(dt) {
    const g = this.game, p = g.player;
    if (g.state !== 'playing' && g.state !== 'paused') return;
    // 血条
    const hp = Math.ceil(p.hp);
    $('hp-bar').style.width = hp + '%';
    $('hp-bar').classList.toggle('low', hp < 35);
    $('hp-num').textContent = hp;
    // 计时/比分
    const t = Math.max(0, g.timeLeft);
    $('timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('score-blue').textContent = g.score.blue;
    $('score-red').textContent = g.score.red;
    // 准星扩散
    const w = g.inv.w;
    const spread = (w.spreadStand + w.spreadMove * Math.min(1, p.moveSpeed / 5)) * (1 - p.adsT)
      + w.spreadAds * p.adsT + (p.grounded ? 0 : w.spreadJump);
    const gap = 5 + spread * 4.5;
    document.documentElement.style.setProperty('--xgap', gap + 'px');
    document.documentElement.style.setProperty('--xcolor', this.settings.xcolor);
    // hitmarker 消隐
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) $('hitmarker').classList.remove('show', 'head');
    }
    // 狙击镜
    const scope = w.scope && p.adsT > 0.85;
    $('scope-overlay').classList.toggle('hidden', !scope);
    $('crosshair').classList.toggle('hidden', scope);
    // 受击红晕衰减
    const v = $('dmg-vignette');
    if (this._vign > 0) {
      this._vign = Math.max(0, this._vign - dt * 1.8);
      v.style.opacity = this._vign;
    }
    // 低血搏动
    v.classList.toggle('crit', p.alive && p.hp < 30);
    this.drawMinimap();
    this.updateDmgNums();
    // 奖励条节流刷新（UAV 倒计时）
    this._rwT = (this._rwT || 0) + dt;
    if (this._rwT > 0.3) { this._rwT = 0; this.refreshRewards(); }
    // 死亡重生提示
    const rp = $('respawn-tip');
    if (!p.alive) {
      rp.classList.remove('hidden');
      rp.textContent = p.respawnT > 0 ? `重生倒计时 ${Math.ceil(p.respawnT)} …` : '即将重生…';
    } else rp.classList.add('hidden');
  }

  hitmarker(head) {
    this.hitT = 0.12;
    const h = $('hitmarker');
    h.classList.add('show');
    h.classList.toggle('head', !!head);
  }
  vignette(k = 0.55) { this._vign = Math.max(this._vign || 0, k); }

  damageDir(worldPos) {
    const g = this.game, p = g.player;
    const dx = worldPos.x - p.pos.x, dz = worldPos.z - p.pos.z;
    const ang = Math.atan2(dx, -dz) - p.yaw; // 相对朝向
    const el = $('dmg-dir');
    el.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
    el.classList.add('show');
    clearTimeout(this._ddT);
    this._ddT = setTimeout(() => el.classList.remove('show'), 650);
  }

  // 伤害数字
  spawnDmg(worldPos, amount, head, kill) {
    const layer = $('dmg-layer');
    const v = worldPos.clone().project(this.game.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg-num' + (head ? ' head' : '') + (kill ? ' kill' : '');
    el.textContent = Math.round(amount);
    el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }
  updateDmgNums() { /* 纯 CSS 动画，无需逐帧 */ }

  // ---------- 连杀奖励 UI ----------
  refreshRewards() {
    const g = this.game;
    if (!g.rewards) return;
    const u = $('rw-uav'), s = $('rw-strike');
    u.classList.toggle('ready', g.rewards.uav);
    u.classList.toggle('active', g.uavT > 0);
    $('rw-uav-t').textContent = g.uavT > 0 ? Math.ceil(g.uavT) + 's' : (g.rewards.uav ? '就绪' : REWARDS.uav.kills + '杀');
    s.classList.toggle('ready', g.rewards.strike);
    $('rw-strike-t').textContent = g.rewards.strike ? '就绪' : REWARDS.strike.kills + '杀';
  }

  botSay(bot, text) {
    const layer = $('bubble-layer');
    if (!layer) return;
    const v = bot.pos.clone().add(new THREE.Vector3(0, 2.15, 0)).project(this.game.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'bot-bubble' + (bot.team === 'blue' ? ' bb' : ' br');
    el.textContent = bot.name + '：' + text;
    el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    layer.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 350); }, 1700);
  }

  spawnHeal(amount) {
    const layer = $('dmg-layer');
    const el = document.createElement('div');
    el.className = 'dmg-num heal';
    el.textContent = '+' + amount;
    el.style.left = '50%';
    el.style.top = '58%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  killfeed(killer, victim, head, weaponName) {
    const kf = $('killfeed');
    const el = document.createElement('div');
    el.className = 'kf-item';
    const kName = killer ? `<span style="color:${TEAM_COLOR[killer.team]?.ui || '#fff'}">${killer.name}</span>` : '<span>战场</span>';
    el.innerHTML = `${kName} <i class="kf-w">${head ? '爆头' : ''}${weaponName}</i> <span style="color:${TEAM_COLOR[victim.team]?.ui || '#fff'}">${victim.name}</span>`;
    kf.prepend(el);
    while (kf.children.length > 5) kf.lastChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 400); }, 4200);
  }

  killBanner(text, cls = '') {
    const b = $('kill-banner');
    b.textContent = text;
    b.className = 'show ' + cls;
    clearTimeout(this._kbT);
    this._kbT = setTimeout(() => (b.className = ''), 1400);
  }
  streakBanner(text) {
    const b = $('streak-banner');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this._sbT);
    this._sbT = setTimeout(() => b.classList.remove('show'), 1600);
  }

  // ---------- 小地图 ----------
  drawMinimap() {
    const g = this.game, p = g.player;
    const c = $('minimap');
    const ctx = c.getContext('2d');
    const S = c.width, s = S / 88, now = performance.now() / 1000;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7);
    ctx.clip();
    ctx.fillStyle = 'rgba(22,32,26,0.72)';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.yaw);
    ctx.translate(-p.pos.x * s, -p.pos.z * s);
    // 障碍
    ctx.fillStyle = 'rgba(214,203,170,0.5)';
    for (const b of g.world.colliders) {
      if (b.h < 0.7) continue;
      ctx.fillRect(b.x1 * s, b.z1 * s, (b.x2 - b.x1) * s, (b.z2 - b.z1) * s);
    }
    // 出生区
    ctx.fillStyle = 'rgba(90,150,220,0.35)';
    ctx.fillRect(-36 * s, -30 * s, 6 * s, 6 * s);
    ctx.fillStyle = 'rgba(220,90,70,0.35)';
    ctx.fillRect(30 * s, 24 * s, 6 * s, 6 * s);
    // 单位
    const uav = g.uavT > 0;
    for (const u of g.allUnits()) {
      if (!u.alive || u.isPlayer) continue;
      const friend = g.mode === 'tdm' && u.team === p.team;
      let show = friend;
      if (!friend) {
        const st = u.shotAt || -9;
        show = uav || (now - st < 2.2);
      }
      if (!show) continue;
      ctx.beginPath();
      ctx.arc(u.pos.x * s, u.pos.z * s, friend ? 3.2 : 3.6, 0, 7);
      ctx.fillStyle = friend ? '#4da3ff' : '#ff5a48';
      ctx.fill();
      // UAV 时敌军加描边闪
      if (!friend && uav) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffd25e';
        ctx.stroke();
      }
    }
    ctx.restore();
    // 玩家箭头
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7);
    ctx.stroke();
  }

  // ---------- 比分板 ----------
  fillScoreboard() {
    const g = this.game;
    const sb = $('sb-body');
    sb.innerHTML = '';
    const mkRow = (u) => {
      const tr = document.createElement('tr');
      const kd = u.deaths ? (u.kills / u.deaths).toFixed(2) : u.kills.toFixed(2);
      tr.innerHTML = `<td style="color:${TEAM_COLOR[u.team]?.ui}">${u.name}${u.isPlayer ? '（你）' : ''}</td>
        <td>${u.kills}</td><td>${u.deaths}</td><td>${kd}</td>`;
      if (u.isPlayer) tr.classList.add('me');
      sb.appendChild(tr);
    };
    const units = g.allUnits().sort((a, b) => b.kills - a.kills);
    if (g.mode === 'tdm') {
      $('sb-blue').textContent = g.score.blue;
      $('sb-red').textContent = g.score.red;
      units.filter((u) => u.team === 'blue').forEach(mkRow);
      const sep = document.createElement('tr');
      sep.innerHTML = '<td colspan="4" style="text-align:center;color:#d0452f;font-weight:700">— 红队 —</td>';
      sb.appendChild(sep);
      units.filter((u) => u.team === 'red').forEach(mkRow);
    } else {
      units.forEach(mkRow);
    }
  }

  // ---------- 结算 ----------
  showEnd(win, winTeam) {
    const g = this.game, p = g.player;
    this.hide('hud');
    $('end-title').textContent = win ? '胜  利' : '战  败';
    $('end-title').style.color = win ? '#2f9e4f' : '#d0452f';
    const acc = p.shotsFired ? Math.round(p.shotsHit / p.shotsFired * 100) : 0;
    $('end-score').innerHTML = g.mode === 'tdm'
      ? `<span style="color:${TEAM_COLOR.blue.ui}">蓝队 ${g.score.blue}</span> : <span style="color:${TEAM_COLOR.red.ui}">${g.score.red} 红队</span>`
      : `你 ${g.score.blue} · 桂冠者 ${Math.max(...g.bots.map((b) => b.kills), 0)}`;
    $('end-kd').innerHTML = `击杀 <b>${p.kills}</b> · 阵亡 <b>${p.deaths}</b> · 连杀 <b>${p.streakBest || 0}</b> · 命中率 <b>${acc}%</b>`;
    this.show('end-panel');
  }

  // ---------- 移动端 ----------
  setupTouch() {
    if (!this.isTouch()) return;
    this.show('touch-ui');
    this.hide('hint-bar');
    const inp = this.game.input;
    const joy = $('joy-base'), knob = $('joy-knob');
    let joyId = null, lookId = null, lx = 0, ly = 0;
    const JMAX = 52;
    const setJoy = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const k = d > JMAX ? JMAX / d : 1;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      inp.moveX = dx / JMAX; inp.moveY = -dy / JMAX;
      inp.sprint = d > JMAX * 0.92;
    };
    joy.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId; joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      setJoy(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      const r = joy.getBoundingClientRect();
      setJoy(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; knob.style.transform = '';
      inp.moveX = 0; inp.moveY = 0; inp.sprint = false;
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    const look = $('look-zone');
    look.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return;
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
      look.setPointerCapture(e.pointerId);
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const k = this.settings.sens * 2.4;
      inp.lookDX += (e.clientX - lx) * k * 0.0032;
      inp.lookDY += (e.clientY - ly) * k * 0.0032;
      lx = e.clientX; ly = e.clientY;
    });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);

    const bind = (id, down, up) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
      if (up) el.addEventListener('pointerup', up), el.addEventListener('pointercancel', up);
    };
    bind('tb-fire', () => (inp.firing = true), () => (inp.firing = false));
    bind('tb-ads', () => (inp.ads = !inp.ads));
    bind('tb-jump', () => (inp.jump = true));
    bind('tb-crouch', () => (inp.crouch = !inp.crouch));
    bind('tb-reload', () => (inp.reload = true));
    bind('tb-grenade', () => (inp.grenade = true));
    bind('tb-swap', () => (inp.cycle = 1));
    bind('tb-uav', () => this.game.useUav());
    bind('tb-strike', () => this.game.useStrike());
  }
  isTouch() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
}
