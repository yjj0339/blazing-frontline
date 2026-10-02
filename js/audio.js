// ===== WebAudio 合成音效（零素材）=====
// 全部程序合成：枪声/命中/换弹/爆炸/脚步/UI/播报，带距离衰减与声像。
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.noiseBuf = null;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // 白噪声缓冲
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // --- 基础件 ---
  _noise(dur, { freq = 2000, q = 1, gain = 1, type = 'bandpass', pan = 0, decay, attack = 0.002, out } = {}) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + (decay || dur));
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f).connect(g).connect(p).connect(out || this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  _tone(freq, dur, { type = 'sine', gain = 0.3, slide, pan = 0, delay = 0, out } = {}) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g).connect(p).connect(out || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // --- 空间化：返回 {gain, pan, dist}（相对相机朝向）---
  _spatial(pos, cam, ref = 0.09) {
    if (!pos || !cam) return { gain: 1, pan: 0, dist: 0 };
    const dx = pos.x - cam.position.x, dz = pos.z - cam.position.z;
    const dist = Math.hypot(dx, dz);
    const gain = 1 / (1 + dist * ref * 9);
    const yaw = cam.rotation.y || 0;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // 相机右向 XZ
    const len = dist || 1;
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / len));
    return { gain, pan, dist };
  }

  // --- 枪声 ---
  shoot(kind, pos, cam) {
    if (!this.ctx) return;
    const s = this._spatial(pos, cam);
    if (s.gain < 0.015) return;
    const g = s.gain;
    const lp = Math.max(600, 9000 - (s.dist || 0) * 130); // 远处低闷
    switch (kind) {
      case 'ar':
        this._noise(0.09, { freq: Math.min(1900, lp), q: 0.8, gain: 0.9 * g, pan: s.pan });
        this._tone(150, 0.1, { type: 'triangle', gain: 0.5 * g, slide: 60, pan: s.pan });
        break;
      case 'sg':
        this._noise(0.16, { freq: Math.min(1100, lp), q: 0.5, gain: 1.1 * g, pan: s.pan, type: 'lowpass' });
        this._tone(95, 0.16, { type: 'triangle', gain: 0.65 * g, slide: 40, pan: s.pan });
        break;
      case 'sr':
        this._noise(0.2, { freq: Math.min(900, lp), q: 0.6, gain: 1.15 * g, pan: s.pan, type: 'lowpass' });
        this._tone(85, 0.22, { type: 'triangle', gain: 0.7 * g, slide: 32, pan: s.pan });
        if (g > 0.5) this._noise(0.12, { freq: 1400, gain: 0.18, pan: -s.pan, delay: 0.09 });
        break;
      case 'pg':
        this._noise(0.06, { freq: Math.min(2300, lp), q: 1.2, gain: 0.7 * g, pan: s.pan });
        this._tone(210, 0.07, { type: 'triangle', gain: 0.4 * g, slide: 90, pan: s.pan });
        break;
    }
  }
  dryFire() { if (this.ctx) this._tone(2400, 0.03, { type: 'square', gain: 0.12 }); }
  reload(kind) {
    if (!this.ctx) return;
    const seq = kind === 'sr' ? [0, 0.7, 1.6] : kind === 'sg' ? [0, 0.5, 1.0, 1.6] : [0, 0.6, 1.35];
    seq.forEach((d, i) => this._noise(0.05, { freq: 1400 + i * 300, q: 3, gain: 0.35, delay: d }));
  }
  hit(head) {
    if (!this.ctx) return;
    if (head) {
      this._tone(3400, 0.05, { type: 'square', gain: 0.3 });
      this._tone(4600, 0.06, { type: 'square', gain: 0.26, delay: 0.045 });
    } else {
      this._tone(2900, 0.04, { type: 'square', gain: 0.22 });
    }
  }
  kill() {
    if (!this.ctx) return;
    this._tone(660, 0.09, { type: 'triangle', gain: 0.3 });
    this._tone(880, 0.14, { type: 'triangle', gain: 0.3, delay: 0.08 });
  }
  streak(n) {
    if (!this.ctx) return;
    const base = [523, 659, 784, 1046];
    for (let i = 0; i < Math.min(4, n); i++)
      this._tone(base[i], 0.12, { type: 'triangle', gain: 0.26, delay: i * 0.07 });
  }
  hurt() {
    if (!this.ctx) return;
    this._tone(140, 0.14, { type: 'sawtooth', gain: 0.3, slide: 70 });
    this._noise(0.08, { freq: 300, gain: 0.3, type: 'lowpass' });
  }
  explosion(pos, cam) {
    if (!this.ctx) return;
    const s = this._spatial(pos, cam, 0.05);
    this._noise(0.6, { freq: Math.min(400, 2000 - s.dist * 20), gain: 1.4 * s.gain, type: 'lowpass', pan: s.pan });
    this._tone(55, 0.55, { type: 'sine', gain: 0.9 * s.gain, slide: 28, pan: s.pan });
  }
  footstep(pos, cam, self = false) {
    if (!this.ctx) return;
    const s = self ? { gain: 0.16, pan: 0 } : this._spatial(pos, cam, 0.3);
    if (s.gain < 0.02) return;
    this._noise(0.05, { freq: 380 + Math.random() * 160, gain: s.gain, type: 'lowpass', pan: s.pan });
  }
  land() { if (this.ctx) this._noise(0.09, { freq: 300, gain: 0.3, type: 'lowpass' }); }
  jump() { if (this.ctx) this._noise(0.05, { freq: 500, gain: 0.1, type: 'lowpass' }); }
  draw() { if (this.ctx) this._noise(0.06, { freq: 1800, q: 2, gain: 0.2 }); }
  pin() { if (this.ctx) this._tone(1800, 0.05, { type: 'square', gain: 0.15 }); }
  respawn() {
    if (!this.ctx) return;
    this._tone(440, 0.1, { type: 'triangle', gain: 0.2 });
    this._tone(660, 0.16, { type: 'triangle', gain: 0.2, delay: 0.1 });
  }
  uiClick() { if (this.ctx) this._tone(820, 0.05, { type: 'triangle', gain: 0.18 }); }
  uiHover() { if (this.ctx) this._tone(600, 0.03, { type: 'sine', gain: 0.07 }); }
  win() {
    if (!this.ctx) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this._tone(f, 0.3, { type: 'triangle', gain: 0.3, delay: i * 0.13 }));
  }
  lose() {
    if (!this.ctx) return;
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone(f, 0.34, { type: 'triangle', gain: 0.26, delay: i * 0.16 }));
  }
  startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    const g = this.ctx.createGain(); g.gain.value = 0.018;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain(); lg.gain.value = 0.008;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(); lfo.start();
  }
}
