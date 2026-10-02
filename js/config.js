// ===== 全局配置 =====
export const MAP_HALF = 40;              // 地图半宽（米）

export const WEAPONS = {
  ar: {
    id: 'ar', name: '突击步枪 AR-7', slot: 1, auto: true,
    dmg: 25, headMul: 2.0, rpm: 640, mag: 30, reserve: 150,
    spreadStand: 1.7, spreadAds: 0.45, spreadMove: 1.3, spreadJump: 3.2,
    recoil: 0.85, recoilAds: 0.5, reload: 2.1, kick: 0.05,
    adsFov: 52, tracer: '#ffd27a', pellete: 1, range: 70,
    optic: 'holo', opticName: '全息镜 ×1.4', modes: ['AUTO', '三连发'],
  },
  sg: {
    id: 'sg', name: '霰弹枪 SG-8', slot: 2, auto: false,
    dmg: 11, headMul: 1.5, rpm: 78, mag: 6, reserve: 36,
    spreadStand: 5.2, spreadAds: 3.8, spreadMove: 1.0, spreadJump: 2.0,
    recoil: 3.2, recoilAds: 2.6, reload: 2.6, kick: 0.14,
    adsFov: 62, tracer: '#ffbe5e', pellets: 8, range: 26,
    optic: 'iron', opticName: '机瞄 ×1.2',
  },
  sr: {
    id: 'sr', name: '狙击枪 SR-50', slot: 3, auto: false,
    dmg: 95, headMul: 2.0, rpm: 40, mag: 5, reserve: 25,
    spreadStand: 6.0, spreadAds: 0.06, spreadMove: 2.0, spreadJump: 5.0,
    recoil: 4.5, recoilAds: 3.0, reload: 2.9, kick: 0.2,
    adsFov: 20, tracer: '#bfe8ff', pellets: 1, range: 150, scope: true,
    optic: 'scope', opticName: '高倍镜 ×3.8 / ×7.5', zoom2Fov: 10,
  },
  pg: {
    id: 'pg', name: '手枪 P-9', slot: 4, auto: false,
    dmg: 17, headMul: 2.0, rpm: 320, mag: 12, reserve: 60,
    spreadStand: 2.2, spreadAds: 0.9, spreadMove: 1.0, spreadJump: 2.6,
    recoil: 1.1, recoilAds: 0.7, reload: 1.5, kick: 0.06,
    adsFov: 60, tracer: '#ffe1a0', pellets: 1, range: 45,
    optic: 'iron', opticName: '机瞄 ×1.25',
  },
};
export const WEAPON_ORDER = ['ar', 'sg', 'sr', 'pg'];

export const GRENADE = { dmg: 115, radius: 6.2, fuse: 2.1, carry: 3, replenish: 18, throwSpeed: 15 };

export const PLAYER = {
  hp: 100, walk: 5.4, sprint: 8.0, crouch: 2.7, ads: 3.5,
  accel: 46, friction: 10, jumpV: 5.8, gravity: 15.5,
  eyeStand: 1.62, eyeCrouch: 1.06, radius: 0.38, regenDelay: 3.2, regenRate: 34,
  killHeal: 25,
  slide: { speed: 10.5, time: 0.62, endSpeed: 4.2 },
};

// 连杀奖励（玩家专属）
export const REWARDS = {
  uav: { kills: 3, time: 9, label: '侦察机', desc: '全图敌人暴露 9 秒' },
  strike: { kills: 6, label: '空袭', desc: '在准星处召唤 4 连爆' },
  rampage: { kills: 9, time: 10, label: '狂暴', desc: '射速 +60% 弹匣无限' },
};

// 军衔成长
export const RANKS = ['新兵', '列兵', '下士', '中士', '上士', '尉官', '少校', '上校', '将军', '战神', '传奇战场之王'];
export function xpForLevel(l) { return Math.round(120 * (l - 1) * l / 2); }
export function levelOf(xp) {
  let l = 1;
  while (l < RANKS.length && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export const BOT_NAMES = {
  blue: ['雷霆', '蓝鲸', '浪花', '飞鱼', '礁石', '海风'],
  red:  ['烈焰', '毒蝎', '猎隼', '黑豹', '蝰蛇', '赤狐', '野牛'],
  ffa:  ['夜枭', '幽灵', '秃鹫', '沙暴', '响尾', '铁拳', '闪电', '寒鸦'],
};

export const DIFFS = {
  easy:   { label: '新兵', react: 0.7,  acc: 0.24, dmgMul: 0.65, burst: 3, speed: 4.5, vision: 44 },
  normal: { label: '老兵', react: 0.46, acc: 0.35, dmgMul: 0.9,  burst: 4, speed: 4.9, vision: 52 },
  hard:   { label: '精英', react: 0.3,  acc: 0.48, dmgMul: 1.2,  burst: 5, speed: 5.3, vision: 60 },
};

export const MODES = {
  tdm: { label: '团队死斗', scoreLimit: 30, time: 360, desc: '蓝队 vs 红队 · 先达 30 杀获胜' },
  koth: { label: '据点争夺', scoreLimit: 60, time: 480, desc: '占领中央据点持续得分 · 先达 60 分' },
  ffa: { label: '个人混战', scoreLimit: 15, time: 300, desc: '以一敌七 · 先达 15 杀获胜' },
};

export const KOTH = { radius: 6, captureTime: 3, scoreInterval: 4, center: { x: 0, z: 0 } };

// 命中材质音映射（collider.name → 音色）
export const MAT_SOUND = {
  con: 'metal', barrel: 'metal', wall: 'stone', wallR: 'stone', rock: 'stone',
  crate: 'wood', tower: 'wood', fence: 'wood', sandbag: 'sand', pallet: 'wood',
};

export const TEAM_COLOR = {
  blue: { main: 0x2f7fd4, dark: 0x1f4d7d, ui: '#2f7fd4', light: '#8fc4f0' },
  red:  { main: 0xd0452f, dark: 0x7d2a1c, ui: '#d0452f', light: '#f0a08c' },
};

// 难度参数存到 localStorage
export const LS_SETTINGS = 'bf_settings_v1';
export const LS_STATS = 'bf_stats_v1';
