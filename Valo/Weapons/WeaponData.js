const ARCH = {
  sidearm: {
    category: 'sidearm', slot: 'secondary', fireMode: 'semi',
    equipTime: 0.75, reloadTime: 1.75, range: 60, falloffStart: 20, falloffEnd: 55, minDamageFrac: 0.55,
    baseSpread: 0.006, moveSpreadMul: 1.2, bloomPerShot: 0.012, maxBloom: 0.06,
    recoil: { pitch: 0.016, yaw: 0.004, pitchRand: 0.004, yawRand: 0.006 },
    alt: 'aim', aimSpreadMul: 0.6,
  },
  smg: {
    category: 'smg', slot: 'primary', fireMode: 'auto',
    equipTime: 0.75, reloadTime: 2.25, range: 55, falloffStart: 15, falloffEnd: 45, minDamageFrac: 0.5,
    baseSpread: 0.008, moveSpreadMul: 0.55, bloomPerShot: 0.006, maxBloom: 0.06,
    recoil: { pitch: 0.009, yaw: 0.006, pitchRand: 0.003, yawRand: 0.008 },
    alt: 'aim', aimSpreadMul: 0.7,
  },
  rifle: {
    category: 'rifle', slot: 'primary', fireMode: 'auto',
    equipTime: 1.0, reloadTime: 2.5, range: 100, falloffStart: 40, falloffEnd: 100, minDamageFrac: 0.6,
    baseSpread: 0.004, moveSpreadMul: 1.6, bloomPerShot: 0.006, maxBloom: 0.05,
    recoil: { pitch: 0.013, yaw: 0.005, pitchRand: 0.003, yawRand: 0.006 },
    alt: 'aim', aimSpreadMul: 0.55,
  },
  shotgun: {
    category: 'shotgun', slot: 'primary', fireMode: 'semi', pellets: 10,
    equipTime: 0.75, reloadTime: 2.5, range: 22, falloffStart: 8, falloffEnd: 22, minDamageFrac: 0.25,
    baseSpread: 0.05, moveSpreadMul: 0.6, bloomPerShot: 0.01, maxBloom: 0.05,
    recoil: { pitch: 0.035, yaw: 0.008, pitchRand: 0.006, yawRand: 0.01 },
    alt: 'aim', aimSpreadMul: 0.85,
  },
  sniper: {
    category: 'sniper', slot: 'primary', fireMode: 'semi', scope: true,
    equipTime: 1.25, reloadTime: 2.5, range: 240, falloffStart: 200, falloffEnd: 250, minDamageFrac: 0.9,
    baseSpread: 0.0003, moveSpreadMul: 4.0, bloomPerShot: 0.02, maxBloom: 0.09,
    recoil: { pitch: 0.05, yaw: 0.006, pitchRand: 0.008, yawRand: 0.006 }, recoilKick: 1.6,
    alt: 'aim', aimSpreadMul: 0.05, aimFov: 30,
  },
  mg: {
    category: 'mg', slot: 'primary', fireMode: 'auto',
    equipTime: 1.25, reloadTime: 3.25, range: 110, falloffStart: 40, falloffEnd: 110, minDamageFrac: 0.55,
    baseSpread: 0.009, moveSpreadMul: 1.6, bloomPerShot: 0.008, maxBloom: 0.08,
    recoil: { pitch: 0.012, yaw: 0.007, pitchRand: 0.004, yawRand: 0.009 },
    alt: 'aim', aimSpreadMul: 0.7,
  },
};

const mk = (arch, o) => Object.assign({}, ARCH[arch], o);

export const Weapons = {

  classic:  mk('sidearm', { id: 'classic',  name: 'Classic',  price: 0,   rpm: 405, magazine: 12, reserve: 36, damage: 26, headshotDamage: 78, minDamageFrac: 0.85, baseSpread: 0.0085 }),
  shorty:   mk('sidearm', { id: 'shorty',   name: 'Shorty',   price: 300, rpm: 198, magazine: 2,  reserve: 6,  damage: 12, headshotDamage: 24, pellets: 15, baseSpread: 0.03, range: 16, falloffStart: 7, falloffEnd: 15, minDamageFrac: 0.5 }),
  frenzy:   mk('sidearm', { id: 'frenzy',   name: 'Frenzy',   price: 450, fireMode: 'auto', rpm: 600, magazine: 13, reserve: 39, damage: 26, headshotDamage: 78, minDamageFrac: 0.81, baseSpread: 0.0085, reloadTime: 1.5 }),
  ghost:    mk('sidearm', { id: 'ghost',    name: 'Ghost',    price: 500, rpm: 405, magazine: 15, reserve: 45, damage: 30, headshotDamage: 105, range: 70, minDamageFrac: 0.83, baseSpread: 0.0052, reloadTime: 1.5 }),
  marker:   mk('sidearm', { id: 'marker',   name: 'Sheriff',  price: 800, rpm: 240, magazine: 6,  reserve: 30, damage: 55, headshotDamage: 159, range: 120, falloffStart: 45, falloffEnd: 120, minDamageFrac: 0.9, baseSpread: 0.0006, moveSpreadMul: 1.6, bloomPerShot: 0.012, maxBloom: 0.06, recoil: { pitch: 0.022, yaw: 0.003, pitchRand: 0.004, yawRand: 0.004 }, aimSpreadMul: 0.4, equipTime: 1.0, reloadTime: 2.25 }),

  stinger:  mk('smg', { id: 'stinger', name: 'Stinger', price: 950,  rpm: 960, magazine: 20, reserve: 60, damage: 27, headshotDamage: 67, minDamageFrac: 0.9 }),
  spectre:  mk('smg', { id: 'spectre', name: 'Spectre', price: 1600, rpm: 800, magazine: 30, reserve: 90, damage: 26, headshotDamage: 78, minDamageFrac: 0.85 }),

  bulldog:  mk('rifle', { id: 'bulldog',  name: 'Bulldog',  price: 2050, rpm: 549, magazine: 24, reserve: 72, damage: 35, headshotDamage: 115, minDamageFrac: 1.0 }),

  guardian: mk('rifle', { id: 'guardian', name: 'Guardian', price: 2250, fireMode: 'semi', rpm: 390, magazine: 12, reserve: 36, damage: 65, headshotDamage: 195, baseSpread: 0.004, aimSpreadMul: 0.02, range: 130, minDamageFrac: 1.0 }),

  phantom:  mk('rifle', { id: 'phantom',  name: 'Phantom',  price: 2900, rpm: 660, magazine: 30, reserve: 90, damage: 39, headshotDamage: 156, minDamageFrac: 0.79, baseSpread: 0.0035, aimSpreadMul: 0.55 }),

  vantage:  mk('rifle', { id: 'vantage',  name: 'Vandalism', price: 2900, rpm: 585, magazine: 25, reserve: 75, damage: 40, headshotDamage: 160, range: 90, falloffEnd: 90, minDamageFrac: 1.0, baseSpread: 0.0044, aimSpreadMul: 0.63 }),

  bucky:    mk('shotgun', { id: 'bucky', name: 'Bucky', price: 850,  rpm: 66,  magazine: 5, reserve: 10, damage: 22, headshotDamage: 44, pellets: 15, falloffStart: 8, falloffEnd: 20, minDamageFrac: 0.3 }),
  judge:    mk('shotgun', { id: 'judge', name: 'Judge', price: 1850, fireMode: 'auto', rpm: 210, magazine: 7, reserve: 14, damage: 17, headshotDamage: 34, pellets: 12, falloffStart: 10, falloffEnd: 22, minDamageFrac: 0.35, equipTime: 1.0, reloadTime: 2.2 }),

  marshal:  mk('sniper', { id: 'marshal',  name: 'Marshal',  price: 950,  rpm: 90, magazine: 5, reserve: 15, damage: 101, headshotDamage: 202, reloadTime: 2.5, aimFov: 46, minDamageFrac: 0.9, scopeStyle: 'duplex' }),
  outlaw:   mk('sniper', { id: 'outlaw',   name: 'Outlaw',   price: 2400, rpm: 165, magazine: 2, reserve: 8,  damage: 140, headshotDamage: 238, reloadTime: 2.25, aimFov: 40, minDamageFrac: 1.0, scopeStyle: 'mildot' }),
  operator: mk('sniper', { id: 'operator', name: 'Operator', price: 4700, rpm: 36, magazine: 5, reserve: 10, damage: 150, headshotDamage: 255, reloadTime: 3.7, aimFov: 30, minDamageFrac: 1.0, scopeStyle: 'christmas' }),

  ares:     mk('mg', { id: 'ares', name: 'Ares', price: 1600, rpm: 660, magazine: 50,  reserve: 100, damage: 30, headshotDamage: 72, minDamageFrac: 0.9 }),
  odin:     mk('mg', { id: 'odin', name: 'Odin', price: 3200, rpm: 780, magazine: 100, reserve: 200, damage: 38, headshotDamage: 95, reloadTime: 5.0, minDamageFrac: 0.82 }),

  karambit: {
    id: 'karambit', name: 'Karambit', category: 'melee', slot: 'melee', melee: true,
    price: 0, fireMode: 'semi', rpm: 90, magazine: Infinity, reserve: 0,
    reloadTime: 0, equipTime: 0.5, range: 2.4, damage: 50, headshotDamage: 65,
    falloffStart: 2.4, falloffEnd: 2.4, minDamageFrac: 1.0,
    baseSpread: 0.02, moveSpreadMul: 0, bloomPerShot: 0, maxBloom: 0,
    recoil: { pitch: 0, yaw: 0, pitchRand: 0, yawRand: 0 },
    alt: 'none', aimSpreadMul: 1,
  },
};

function mkSpray(phases) {
  const a = [];
  for (const p of phases) {
    for (let i = 0; i < p.shots; i++) {
      const jx = (p.jx || 0) * (i % 2 ? -1 : 1);
      a.push([(p.dx || 0) + jx, p.dy]);
    }
  }
  return a;
}
const SPRAY = {
  vantage: mkSpray([{ shots: 10, dy: 1.15, jx: 0.15 }, { shots: 5, dx: 0.65, dy: 0.45, jx: 0.1 }, { shots: 10, dx: -0.72, dy: 0.28, jx: 0.15 }]),
  phantom: mkSpray([{ shots: 11, dy: 0.98, jx: 0.14 }, { shots: 7, dx: -0.55, dy: 0.36, jx: 0.1 }, { shots: 12, dx: 0.6, dy: 0.24, jx: 0.16 }]),
  spectre: mkSpray([{ shots: 8, dy: 0.72, jx: 0.2 }, { shots: 8, dx: -0.5, dy: 0.32, jx: 0.15 }, { shots: 14, dx: 0.56, dy: 0.22, jx: 0.22 }]),
  stinger: mkSpray([{ shots: 6, dy: 0.95, jx: 0.25 }, { shots: 14, dy: 0.4, jx: 0.7 }]),
  bulldog: mkSpray([{ shots: 8, dy: 0.9, jx: 0.15 }, { shots: 6, dx: 0.55, dy: 0.4, jx: 0.1 }, { shots: 10, dx: -0.58, dy: 0.26, jx: 0.15 }]),
  frenzy:  mkSpray([{ shots: 5, dy: 0.62, jx: 0.2 }, { shots: 8, dy: 0.3, jx: 0.45 }]),
  ares:    mkSpray([{ shots: 10, dy: 0.72, jx: 0.18 }, { shots: 15, dx: 0.5, dy: 0.26, jx: 0.2 }, { shots: 25, dx: -0.44, dy: 0.2, jx: 0.3 }]),
  odin:    mkSpray([{ shots: 12, dy: 0.78, jx: 0.2 }, { shots: 20, dx: -0.46, dy: 0.3, jx: 0.25 }, { shots: 30, dx: 0.42, dy: 0.2, jx: 0.32 }]),
  judge:   mkSpray([{ shots: 7, dy: 1.25, jx: 0.35 }]),
};
for (const [id, pat] of Object.entries(SPRAY)) if (Weapons[id]) Weapons[id].spray = pat;

export const Armor = {
  light: { id: 'light', name: 'Light Shields', price: 400, shield: 25 },
  heavy: { id: 'heavy', name: 'Heavy Shields', price: 1000, shield: 50 },
};

export const BuyColumns = [
  { title: 'Sidearms', groups: ['sidearm'] },
  { title: 'SMGs', groups: ['smg'], extra: [{ title: 'Shotguns', groups: ['shotgun'] }] },
  { title: 'Rifles', groups: ['rifle'] },
  { title: 'Sniper Rifles', groups: ['sniper'], extra: [{ title: 'Machine Guns', groups: ['mg'] }] },
  { title: 'Armor', armor: true },
];

export const Loadout = { primary: 'vantage', secondary: 'classic', melee: 'karambit' };
