// ===== 全局配置 =====
export const MAP_HALF = 40;              // 地图半宽（米）

export const WEAPONS = {
  ar: {
    id: 'ar', name: '突击步枪 AR-7', slot: 1, auto: true,
    dmg: 22, headMul: 2.0, rpm: 600, mag: 30, reserve: 150,
    spreadStand: 1.7, spreadAds: 0.45, spreadMove: 1.3, spreadJump: 3.2,
    recoil: 0.85, recoilAds: 0.5, reload: 2.1, kick: 0.05,
    adsFov: 55, tracer: '#ffd27a', pellete: 1, range: 70,
  },
  sg: {
    id: 'sg', name: '霰弹枪 SG-8', slot: 2, auto: false,
    dmg: 11, headMul: 1.5, rpm: 78, mag: 6, reserve: 36,
    spreadStand: 5.2, spreadAds: 3.8, spreadMove: 1.0, spreadJump: 2.0,
    recoil: 3.2, recoilAds: 2.6, reload: 2.6, kick: 0.14,
    adsFov: 60, tracer: '#ffbe5e', pellets: 8, range: 26,
  },
  sr: {
    id: 'sr', name: '狙击枪 SR-50', slot: 3, auto: false,
    dmg: 95, headMul: 2.0, rpm: 40, mag: 5, reserve: 25,
    spreadStand: 6.0, spreadAds: 0.06, spreadMove: 2.0, spreadJump: 5.0,
    recoil: 4.5, recoilAds: 3.0, reload: 2.9, kick: 0.2,
    adsFov: 20, tracer: '#bfe8ff', pellets: 1, range: 150, scope: true,
  },
  pg: {
    id: 'pg', name: '手枪 P-9', slot: 4, auto: false,
    dmg: 17, headMul: 2.0, rpm: 320, mag: 12, reserve: 60,
    spreadStand: 2.2, spreadAds: 0.9, spreadMove: 1.0, spreadJump: 2.6,
    recoil: 1.1, recoilAds: 0.7, reload: 1.5, kick: 0.06,
    adsFov: 60, tracer: '#ffe1a0', pellets: 1, range: 45,
  },
};
export const WEAPON_ORDER = ['ar', 'sg', 'sr', 'pg'];

export const GRENADE = { dmg: 115, radius: 6.2, fuse: 2.1, carry: 3, replenish: 18, throwSpeed: 15 };

export const PLAYER = {
  hp: 100, walk: 5.2, sprint: 7.6, crouch: 2.7, ads: 3.5,
  accel: 46, friction: 10, jumpV: 5.7, gravity: 15.5,
  eyeStand: 1.62, eyeCrouch: 1.06, radius: 0.38, regenDelay: 4.5, regenRate: 22,
};

export const BOT_NAMES = {
  blue: ['雷霆', '蓝鲸', '浪花', '飞鱼', '礁石', '海风'],
  red:  ['烈焰', '毒蝎', '猎隼', '黑豹', '蝰蛇', '赤狐', '野牛'],
  ffa:  ['夜枭', '幽灵', '秃鹫', '沙暴', '响尾', '铁拳', '闪电', '寒鸦'],
};

export const DIFFS = {
  easy:   { label: '新兵', react: 0.65, acc: 0.30, dmgMul: 0.7,  burst: 3, speed: 4.6, vision: 46 },
  normal: { label: '老兵', react: 0.42, acc: 0.42, dmgMul: 1.0,  burst: 4, speed: 5.0, vision: 55 },
  hard:   { label: '精英', react: 0.28, acc: 0.55, dmgMul: 1.3,  burst: 5, speed: 5.4, vision: 62 },
};

export const MODES = {
  tdm: { label: '团队死斗', scoreLimit: 30, time: 360, desc: '蓝队 vs 红队 · 先达 30 杀获胜' },
  ffa: { label: '个人混战', scoreLimit: 15, time: 300, desc: '以一敌七 · 先达 15 杀获胜' },
};

export const TEAM_COLOR = {
  blue: { main: 0x2f7fd4, dark: 0x1f4d7d, ui: '#2f7fd4', light: '#8fc4f0' },
  red:  { main: 0xd0452f, dark: 0x7d2a1c, ui: '#d0452f', light: '#f0a08c' },
};

// 难度参数存到 localStorage
export const LS_SETTINGS = 'bf_settings_v1';
export const LS_STATS = 'bf_stats_v1';
