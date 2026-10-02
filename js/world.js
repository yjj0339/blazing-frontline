// ===== 世界：地图布局、碰撞、路点网、视线 =====
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_HALF, TEAM_COLOR } from './config.js';

const H = MAP_HALF; // 40

export class World {
  constructor() {
    this.colliders = [];      // {x1,z1,x2,z2,h,name}
    this.solids = [];         // 参与渲染的 mesh（阴影）
    this.waypoints = [];      // {x,z,nbrs:[idx]}
    this.spawns = { blue: [], red: [], ffa: [] };
    this._wpGrid = new Map();
  }

  addCollider(x, z, w, d, h, name) {
    this.colliders.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2, h, name });
  }

  // ---------- 建场景 ----------
  build(scene, propsGltf, THREE_REF) {
    this.scene = scene;
    const P = propsGltf;
    const pick = (n) => {
      const o = P.scene.getObjectByName(n);
      if (!o) throw new Error('props missing ' + n);
      return o;
    };

    // 天空穹顶
    const skyGeo = new THREE.SphereGeometry(300, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x3f8fd2) }, bot: { value: new THREE.Color(0xd8ecf9) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
        void main(){ float t=clamp(vP.y/180.0,0.0,1.0); gl_FragColor=vec4(mix(bot,top,pow(t,0.7)),1.0); }`,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 太阳
    const sun = new THREE.DirectionalLight(0xffe3b8, 2.9);
    sun.position.set(35, 55, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbdd9f5, 0x8a9b6c, 1.2));
    scene.fog = new THREE.Fog(0xcfe5f4, 70, 210);

    // 远山剪影（雾中层次）
    const mountMat = new THREE.MeshBasicMaterial({ color: 0x8fa9c4, fog: true });
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + 0.35;
      const r = 175 + Math.random() * 55;
      const h = 20 + Math.random() * 26;
      const m = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 22, h, 5), mountMat);
      m.position.set(Math.cos(ang) * r, h / 2 - 6, Math.sin(ang) * r);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
    }

    // 营地旗帜（顶点波动）
    this.flags = [];
    const mkFlag = (x, z, color) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.7 })
      );
      pole.position.set(x, 1.7, z);
      pole.castShadow = true;
      scene.add(pole);
      const geo = new THREE.PlaneGeometry(1.6, 0.95, 10, 5);
      geo.translate(0.8, 0, 0);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color, roughness: 1, side: THREE.DoubleSide,
      }));
      cloth.position.set(x, 3.0, z);
      cloth.castShadow = true;
      scene.add(cloth);
      this.flags.push(cloth);
    };
    mkFlag(-35.5, -30, TEAM_COLOR.blue.main);
    mkFlag(35.5, 30, TEAM_COLOR.red.main);

    // 云朵（billboard 板）
    const cloudTex = this._cloudTexture();
    for (let i = 0; i < 9; i++) {
      const s = 26 + Math.random() * 30;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s * 0.42),
        new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85 })
      );
      m.position.set((Math.random() - 0.5) * 300, 60 + Math.random() * 45, (Math.random() - 0.5) * 300);
      m.rotation.y = Math.random() * Math.PI;
      m.renderOrder = -1;
      scene.add(m);
    }

    // 地面
    const groundTex = this._groundTexture();
    groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(H * 2, H * 2),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 围墙
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb9aa90, roughness: 1 });
    const mkWall = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), wallMat);
      m.position.set(x, 2.1, z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      this.addCollider(x, z, w, d, 4.2, 'wall');
    };
    mkWall(0, -H - 0.5, H * 2 + 2, 1);
    mkWall(0, H + 0.5, H * 2 + 2, 1);
    mkWall(-H - 0.5, 0, 1, H * 2 + 2);
    mkWall(H + 0.5, 0, 1, H * 2 + 2);

    // ---------- 道具（静态几何按材质合并，200+ draw call → 十几个）----------
    const staticByMat = new Map();
    const place = (proto, x, z, rotY = 0, tint = null, scale = 1) => {
      const o = proto.clone(true);
      o.position.set(x, 0, z);
      o.rotation.y = rotY;
      if (scale !== 1) o.scale.setScalar(scale);
      o.updateMatrixWorld(true);
      o.traverse((c) => {
        if (!c.isMesh || !c.geometry?.attributes?.position) return;
        let mat = c.material;
        let key = mat.uuid;
        if (tint !== null) {
          mat = mat.clone();
          mat.color = new THREE.Color(tint);
          key = 'tint' + tint;
        }
        const g = c.geometry.clone().applyMatrix4(c.matrixWorld);
        if (!staticByMat.has(key)) staticByMat.set(key, { mat, geos: [] });
        staticByMat.get(key).geos.push(g);
      });
      return o;
    };
    const container = pick('Container');
    const crateB = pick('CrateBig');
    const crateS = pick('CrateSmall');
    const barrel = pick('Barrel');
    // 油桶：可破坏爆炸物（独立网格，受击闪红，3 发引爆）
    this.barrels = [];
    const placeBarrel = (x, z, rot = 0) => {
      const o = barrel.clone(true);
      o.position.set(x, 0, z);
      o.rotation.y = rot;
      o.updateMatrixWorld(true);
      const mat0 = o.getObjectByName('bb')?.material || o.children.find((c) => c.isMesh)?.material;
      const geos = [];
      o.traverse((c) => {
        if (c.isMesh && c.geometry?.attributes?.position) {
          const g = c.geometry.clone().applyMatrix4(c.matrixWorld);
          g.deleteAttribute('uv');
          geos.push(g);
        }
      });
      const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      const mesh = new THREE.Mesh(merged, mat0.clone());
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      const rec = { mesh, hp: 30, x, z, dead: false };
      this.barrels.push(rec);
      this.addCollider(x, z, 0.58, 0.58, 0.9, 'barrel');
      this.colliders[this.colliders.length - 1].barrel = rec;
      geos.forEach((g) => g.dispose());
    };
    const sandbag = pick('Sandbag');
    const tower = pick('Tower');
    const fence = pick('Fence');
    const wallR = pick('WallRuin');
    const pallet = pick('Pallet');
    const rock1 = pick('Rock1');
    const rock2 = pick('Rock2');

    const CON_H = 2.6, CON_L = 6.0, CON_W = 2.44;
    const CONTAINER_TINTS = [0xc75b45, 0x3d7ec2, 0xd2a63f, 0x4f9e5f, 0x8a6fae];

    // 中央十字掩体（对称）
    place(container, 0, -6.2, 0, CONTAINER_TINTS[0]); this.addCollider(0, -6.2, CON_L, CON_W, CON_H, 'con');
    place(container, 0, 6.2, 0, CONTAINER_TINTS[1]); this.addCollider(0, 6.2, CON_L, CON_W, CON_H, 'con');
    place(container, -6.2, 0, Math.PI / 2, CONTAINER_TINTS[2]); this.addCollider(-6.2, 0, CON_W, CON_L, CON_H, 'con');
    place(container, 6.2, 0, Math.PI / 2, CONTAINER_TINTS[3]); this.addCollider(6.2, 0, CON_W, CON_L, CON_H, 'con');
    place(wallR, 0, 0, 0); this.addCollider(0, 0, 3.0, 0.3, 2.2, 'wallR');
    place(wallR, 0, 0, Math.PI / 2); this.addCollider(0, 0, 0.3, 3.0, 2.2, 'wallR');

    // 四象限镜像摆放 helper
    const sym4 = (fn) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) fn(sx, sz);
    };

    // 中圈集装箱斜对（±14,±14）
    sym4((sx, sz) => {
      place(container, sx * 14, sz * 14, sx * sz > 0 ? Math.PI / 2 : 0, CONTAINER_TINTS[(sx + sz + 8) % 5]);
      if (sx * sz > 0) this.addCollider(sx * 14, sz * 14, CON_W, CON_L, CON_H, 'con');
      else this.addCollider(sx * 14, sz * 14, CON_L, CON_W, CON_H, 'con');
    });

    // 四角哨塔
    sym4((sx, sz) => {
      place(tower, sx * 31, sz * 31, 0);
      this.addCollider(sx * 31, sz * 31, 2.9, 2.9, 2.66, 'tower');
    });

    // 木箱群（掩体点）
    const crateSpot = (x, z, bigRot = 0) => {
      place(crateB, x, z, bigRot); this.addCollider(x, z, 0.92, 0.92, 0.9, 'crate');
      place(crateS, x + 0.95, z + 0.25, Math.random() * 1.5); this.addCollider(x + 0.95, z + 0.25, 0.57, 0.57, 0.55, 'crate');
      placeBarrel(x - 0.2, z + 1.1);
    };
    sym4((sx, sz) => crateSpot(sx * 8.5, sz * 8.5));

    // 沙袋阵地
    sym4((sx, sz) => {
      const rot = Math.abs(sx) === Math.abs(sz) ? (sx > 0 ? 0.6 : -0.6) : 0.6;
      const x = sx * 21, z = sz * 9;
      place(sandbag, x, z, rot);
      this.addCollider(x, z, 2.0, 2.0, 0.85, 'sandbag');
    });
    sym4((sx, sz) => {
      const x = sx * 9, z = sz * 21;
      place(sandbag, x, z, -0.6);
      this.addCollider(x, z, 2.0, 2.0, 0.85, 'sandbag');
    });

    // 出生区围挡（半开放营地）
    const camp = (cx, cz, tint) => {
      place(container, cx, cz - 3.2, 0, tint);
      this.addCollider(cx, cz - 3.2, CON_L, CON_W, CON_H, 'con');
      place(crateB, cx - 3.6, cz + 1.2, 0.3); this.addCollider(cx - 3.6, cz + 1.2, 0.92, 0.92, 0.9, 'crate');
      place(crateB, cx + 3.6, cz + 1.2, 0.1); this.addCollider(cx + 3.6, cz + 1.2, 0.92, 0.92, 0.9, 'crate');
      place(crateS, cx - 2.2, cz + 2.4); this.addCollider(cx - 2.2, cz + 2.4, 0.57, 0.57, 0.55, 'crate');
      place(crateS, cx + 2.2, cz + 2.4); this.addCollider(cx + 2.2, cz + 2.4, 0.57, 0.57, 0.55, 'crate');
      for (let i = -1; i <= 1; i++) {
        placeBarrel(cx + i * 1.15, cz - 6.4, Math.random() * 3);
      }
      place(pallet, cx + 5.5, cz + 3, 0.4); place(pallet, cx - 5.5, cz + 3, 1.2);
    };
    camp(-33, -33, 0x3d7ec2);
    camp(33, 33, 0xc75b45);

    // 散件（围栏/断墙/石头/托盘）
    const scatter = [
      [fence, -24, -2, 0], [fence, 24, 2, 0],
      [fence, -2, 24, Math.PI / 2], [fence, 2, -24, Math.PI / 2],
      [wallR, -18, 26, 0], [wallR, 18, -26, 0],
      [wallR, 26, 18, Math.PI / 2], [wallR, -26, -18, Math.PI / 2],
      [rock1, -12, -20, 0], [rock1, 12, 20, 2.1],
      [rock1, 20, -12, 4.0], [rock1, -20, 12, 1.0],
      [rock2, -10.5, -18.6, 0], [rock2, 10.5, 18.6, 1], [rock2, 18.6, -10.5, 2], [rock2, -18.6, 10.5, 3],
      [pallet, -15, 4, 0.3], [pallet, 15, -4, 2.2],
      [fence, -30, 12, 0.4], [fence, 30, -12, 0.4],
    ];
    for (const [p, x, z, r] of scatter) {
      place(p, x, z, r);
      if (p === fence) this.addCollider(x, z, r ? 0.3 : 2.0, r ? 2.0 : 0.3, 1.2, 'fence');
      if (p === wallR) this.addCollider(x, z, r ? 0.4 : 3.0, r ? 3.0 : 0.4, 2.2, 'wallR');
      if (p === rock1) this.addCollider(x, z, 1.0, 1.0, 0.62, 'rock');
      if (p === rock2) this.addCollider(x, z, 0.66, 0.66, 0.4, 'rock');
    }
    // 零散油桶（可爆炸）
    for (const [x, z] of [[-27, -10], [27, 10], [-10, 27], [10, -27], [4, 15], [-4, -15], [22, 22], [-22, -22]]) {
      placeBarrel(x, z, Math.random() * 3);
    }

    // 合并静态几何
    for (const { mat, geos } of staticByMat.values()) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.solids.push(mesh);
    }
    geosCleanup(staticByMat);

    // 出生点（营地前方开阔区，面向场中心）
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.spawns.blue.push(new THREE.Vector3(-33 + Math.cos(a) * 3.2, 0, -26.5 + Math.sin(a) * 2.4));
      this.spawns.red.push(new THREE.Vector3(33 + Math.cos(a) * 3.2, 0, 26.5 + Math.sin(a) * 2.4));
      this.spawns.ffa.push(new THREE.Vector3(
        (Math.random() - 0.5) * 2 * (H - 8), 0, (Math.random() - 0.5) * 2 * (H - 8)));
    }

    this._buildWaypoints();
  }

  _cloudTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * 176, y = 45 + Math.random() * 40, r = 14 + Math.random() * 26;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  _groundTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = '#96ab5f';
    g.fillRect(0, 0, 1024, 1024);
    // 色块变化
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${140 + Math.random() * 40 | 0},${160 + Math.random() * 40 | 0},${80 + Math.random() * 30 | 0},0.25)`;
      const r = 20 + Math.random() * 90;
      g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 1024, r, 0, 7); g.fill();
    }
    // 十字土路
    g.strokeStyle = '#c2ab7c'; g.lineWidth = 46; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 512); g.lineTo(1024, 512); g.stroke();
    g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.stroke();
    g.strokeStyle = 'rgba(160,140,100,0.5)'; g.lineWidth = 60;
    g.beginPath(); g.moveTo(0, 512); g.lineTo(1024, 512); g.stroke();
    // 草丛点
    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * 1024, y = Math.random() * 1024;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(120,140,70,0.5)' : 'rgba(180,190,110,0.4)';
      g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- 路点网 ----------
  _buildWaypoints() {
    const step = 5, from = -H + 3;
    const n = Math.floor((H * 2 - 6) / step) + 1;
    const idx = (i, j) => i * n + j;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = from + i * step, z = from + j * step;
        if (this._pointBlocked(x, z, 0.6)) continue;
        this.waypoints.push({ x, z, nbrs: [] });
        this._wpGrid.set(idx(i, j), this.waypoints.length - 1);
        this._wpGrid.set('ij' + idx(i, j), [i, j]);
      }
    }
    for (const [key, wi] of this._wpGrid) {
      if (typeof key !== 'number') continue;
      const [i, j] = this._wpGrid.get('ij' + key);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const wj = this._wpGrid.get(idx(i + di, j + dj));
        if (wj === undefined) continue;
        const a = this.waypoints[wi], b = this.waypoints[wj];
        if (this._segBlocked2D(a.x, a.z, b.x, b.z, 0.42)) continue;
        a.nbrs.push(wj);
      }
    }
  }
  _pointBlocked(x, z, pad) {
    for (const c of this.colliders) {
      if (x > c.x1 - pad && x < c.x2 + pad && z > c.z1 - pad && z < c.z2 + pad) return true;
    }
    return false;
  }
  _segBlocked2D(x1, z1, x2, z2, pad) {
    for (const c of this.colliders) {
      if (this._segAABB(x1, z1, x2, z2, c.x1 - pad, c.z1 - pad, c.x2 + pad, c.z2 + pad)) return true;
    }
    return false;
  }
  _segAABB(x1, z1, x2, z2, ax1, az1, ax2, az2) {
    // Liang-Barsky
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dz = z2 - z1;
    const p = [-dx, dx, -dz, dz];
    const q = [x1 - ax1, ax2 - x1, z1 - az1, az2 - z1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  // ---------- 查询 ----------
  // 视线：a b 为 Vector3（眼睛高度）。返回最近障碍距离（无限=通畅）
  losDist(a, b) {
    let best = Infinity;
    for (const c of this.colliders) {
      if (c.dead || c.h < 0.5) continue;
      // 高度检查：线段在该障碍 t 区间的 z 值
      const t = this._segAABBT(a.x, a.z, b.x, b.z, c.x1, c.z1, c.x2, c.z2);
      if (t === null) continue;
      const z = a.y + (b.y - a.y) * t;
      if (z < c.h) best = Math.min(best, t * Math.hypot(b.x - a.x, b.z - a.z));
    }
    return best;
  }
  _segAABBT(x1, z1, x2, z2, ax1, az1, ax2, az2) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dz = z2 - z1;
    const p = [-dx, dx, -dz, dz];
    const q = [x1 - ax1, ax2 - x1, z1 - az1, az2 - z1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
    }
    return t0;
  }
  losClear(a, b) { return this.losDist(a, b) === Infinity; }

  // 圆 vs AABB 滑动碰撞，pos 就地修改
  slide(pos, radius) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.dead) continue;
        const nx = Math.max(c.x1, Math.min(pos.x, c.x2));
        const nz = Math.max(c.z1, Math.min(pos.z, c.z2));
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            pos.x = nx + dx / d * radius;
            pos.z = nz + dz / d * radius;
          } else {
            // 在 box 内部：往最近边推出
            const l = pos.x - c.x1, r = c.x2 - pos.x, t = pos.z - c.z1, b = c.z2 - pos.z;
            const m = Math.min(l, r, t, b);
            if (m === l) pos.x = c.x1 - radius;
            else if (m === r) pos.x = c.x2 + radius;
            else if (m === t) pos.z = c.z1 - radius;
            else pos.z = c.z2 + radius;
          }
        }
      }
    }
    pos.x = Math.max(-H + 1, Math.min(H - 1, pos.x));
    pos.z = Math.max(-H + 1, Math.min(H - 1, pos.z));
  }

  // A* 寻路，返回路径点数组 [{x,z}]
  findPath(from, to) {
    const nearest = (x, z) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < this.waypoints.length; i++) {
        const w = this.waypoints[i];
        const d = (w.x - x) ** 2 + (w.z - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const s = nearest(from.x, from.z), e = nearest(to.x, to.z);
    if (s < 0 || e < 0) return null;
    const W = this.waypoints;
    const open = [s], came = new Map(), g = new Map([[s, 0]]);
    const f = new Map([[s, 0]]);
    const closed = new Set();
    let guard = 0;
    while (open.length && guard++ < 3000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if ((f.get(open[i]) ?? 1e9) < (f.get(open[bi]) ?? 1e9)) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === e) {
        const path = [];
        let c = e;
        while (c !== undefined) { path.push({ x: W[c].x, z: W[c].z }); c = came.get(c); }
        path.reverse();
        path.push({ x: to.x, z: to.z });
        return path;
      }
      closed.add(cur);
      for (const nb of W[cur].nbrs) {
        if (closed.has(nb)) continue;
        const tg = (g.get(cur) ?? 1e9) + Math.hypot(W[nb].x - W[cur].x, W[nb].z - W[cur].z);
        if (tg < (g.get(nb) ?? 1e9)) {
          came.set(nb, cur); g.set(nb, tg);
          f.set(nb, tg + Math.hypot(W[e].x - W[nb].x, W[e].z - W[nb].z));
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return null;
  }

  randomRoam() {
    const w = this.waypoints[(Math.random() * this.waypoints.length) | 0];
    return w ? { x: w.x, z: w.z } : { x: 0, z: 0 };
  }
}

function geosCleanup(byMat) {
  for (const { geos } of byMat.values()) geos.forEach((g) => g.dispose());
}
