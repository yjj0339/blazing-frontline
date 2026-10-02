// ===== 入口：加载 GLB 资产 → 启动游戏 =====
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import { Game } from './game.js';

const FILES = ['soldier', 'props', 'fp_ar', 'fp_sg', 'fp_sr', 'fp_pg'];
const bar = document.getElementById('load-bar');
const txt = document.getElementById('load-txt');
let done = 0;

const loader = new GLTFLoader();
const assets = {};
let failed = false;

Promise.all(
  FILES.map((f) => new Promise((res) => {
    loader.load(
      `assets/models/${f}.glb`,
      (g) => { assets[f] = g; done++; bar.style.width = (done / FILES.length * 100) + '%'; txt.textContent = `加载资产 ${done}/${FILES.length}`; res(); },
      undefined,
      (err) => { console.error('load fail', f, err); failed = true; res(); }
    );
  }))
).then(() => {
  if (failed) {
    txt.textContent = '资产加载失败，请刷新重试';
    return;
  }
  txt.textContent = '准备战场…';
  // 给 UI 一帧时间
  setTimeout(() => {
    window.__game = new Game(assets);
    document.getElementById('loading').classList.add('hidden');
  }, 60);
});
