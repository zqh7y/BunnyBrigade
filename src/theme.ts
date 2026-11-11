import type { SuperId } from './data';

/**
 * The one place for the game's shared look: canvas size, layout, colours and font.
 * Everything is in "logical" pixels on a 540 x 1170 portrait canvas that is scaled to fit the window.
 */
export const W = 540;
export const H = 1170;

export const FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

export const COLOR = {
  page: '#1d1a24',
  ink: '#2a2233',
  white: '#ffffff',
  textDim: '#d8d2e2',
  toast: '#ffe27a',

  hudPill: 'rgba(36, 32, 46, 0.8)',
  // the top bar (money, wave bar, gems, stage plate): candy bodies in the dark of the old money / gem pills
  hud: '#24202e',
  hudDark: '#141119',
  hudWell: '#0e0b13',
  cash: '#5fd16f',
  cashDark: '#2f9a48',
  gem: '#b94dff',
  gemLight: '#eaa6ff',
  gemDark: '#7a26c2',

  hpGood: '#5ad66c',
  hpBad: '#ff4d4d',
  hpBack: '#3a2f3f',
  progress: '#ffa630',
  progressLight: '#ffd36b',
  progressBack: '#3a3448',
  bannerBoss: '#ff5a4f',
  // the wave tracker (top centre)
  hereFill: '#fff7e0',
  waveChipDark: '#d9821c',
  stageTab: '#ffd23a',
  stageTabDark: '#d99a12',
  bossCapDark: '#c23a32',
  bossText: '#ffb0a8',

  panelFrame: '#8d8896',
  panelInner: '#55515d',
  panelInnerEdge: '#3a3641',
  cell: 'rgba(0, 0, 0, 0.14)',
  joint: '#ffa33a',
  valid: 'rgba(110, 230, 120, 0.45)',
  invalid: 'rgba(255, 80, 80, 0.45)',
  merge: '#ffe066',

  ground: '#958a88', // plain area under the road, behind the grid

  rabbitFur: ['#fbf8f3', '#f3e7d6', '#e9e5e6'] as const,
  rabbitInnerEar: '#ffb3c4',
  rabbitHelmet: '#4a7fd6',
  rabbitHelmetLight: '#8db4f2',
  rabbitHelmetDark: '#3360ad',
  rabbitOveralls: '#3c64c4',

  foxFur: '#ec7a2f',
  foxFurDark: '#c45d1d',
  foxCream: '#fff1e2',
  foxMask: '#3b2b2b',
};

/** Evolution look: one signature hue per super weapon (not used by foxes or gear), rainbow rims, gold for Awakened. */
export const EVO = {
  rim: ['#ff6b6b', '#ffd84a', '#5ad66c', '#5aa8ff', '#c48bff'],
  glow: '#ff7af5',
  dim: 'rgba(10, 6, 20, 0.55)',
  flash: '#ffffff',
  badge: '#3a1a5c',
  badgeLight: '#ffd6ff',
  awake: '#ffe08a',
  ghost: 'rgba(20, 14, 30, 0.85)',
  accent: {
    gunblade: '#6ff3ff',
    gatling: '#ff9f43',
    railgun: '#7affc8',
    ram: '#ff5fa8',
    barrage: '#ff6a2b',
    cannon: '#ffb02e',
  } satisfies Record<SuperId, string>,
  art: { copper: '#c8844a', drum: '#5f7a3a', wood: '#a0673a', band: '#e04848', brass: '#e8b84a', star: '#ffd84a' },
};

/** Colours per class: index 0 = E (gray), D green, C blue, B purple, A gold, S crimson, 6 = SSS (prismatic). */
export const TIER = {
  metal: ['#8f99a8', '#38b653', '#2f86f6', '#9a52f5', '#f5a417', '#ff3b5c', '#ff4fd8'],
  metalLight: ['#d2d8e1', '#9bf0a8', '#a3cdff', '#dcb8ff', '#ffe08a', '#ffb3c0', '#ffd1f6'],
  tile: ['#c9cfd9', '#7fd77c', '#7db9fb', '#c09af7', '#ffc94f', '#ff8a9c', '#f2a6ff'],
  tileLight: ['#eef1f5', '#c9f3c4', '#cfe6ff', '#ead9ff', '#fff0bf', '#ffdbe1', '#fff0ff'],
  tileDark: ['#7d8696', '#3a9a45', '#3a78cc', '#7b47c9', '#c98712', '#c4243f', '#9b2fd0'],
};

/** The S-class aura colour (SSS uses the rainbow EVO.rim). */
export const CLASS_FX = { s: '#ff4664', sss: '#ff7af5', spark: '#fff6d8' };

export const L = {
  sidewalkTop: 322,
  roadTop: 348,
  roadBottom: 612,
  sceneBottom: 626,
  laneTop: 376,
  laneBottom: 600,
  exitX: -24, // a fox that walks past this line steals carrots
  rallyMelee: 228,
  rallyRanged: 150,

  cash: { x: 12, y: 16, w: 132, h: 46 },
  gems: { x: 396, y: 16, w: 132, h: 46 },
  wave: { x: 154, y: 16, w: 232, h: 46 }, // the wave bar: same top and height as the money and gem pills
  pause: { x: 14, y: 74, w: 56, h: 56 },
  speed: { x: 470, y: 74, w: 56, h: 56 },
  auto: { x: 470, y: 138, w: 56, h: 56 }, // AUTO battle toggle, under x2
  km: { x: 14, y: 138, w: 56, h: 56 }, // the distance run (the goal), under pause
  baseHp: { x: 14, y: 328, w: 112, h: 12 }, // the bar; number and carrot sit above it
  bomb: { x: 154, y: 326, r: 18 }, // airstrike charge indicator
  comboY: 196,
  bossBar: { x: 120, y: 146, w: 300, h: 16 },
  bannerY: 240,
  ribbonY: 150, // the WAVE CLEAR ribbon, above the street's windows so the cheering townsfolk show

  powerTab: { x: 186, y: 622, w: 168, h: 40 },
  panel: { x: 86, y: 660, w: 368, h: 352 },
  grid: { x: 110, y: 676, cols: 5, rows: 5, cell: 64 },
  tray: { x: 141, y: 1024, size: 78, gap: 12, count: 3 },
  sell: { x: 452, y: 1030, w: 64, h: 66 },
  stats: { x: 24, y: 1030, w: 64, h: 66 },
  caseBtn: { x: 24, y: 1110, w: 236, h: 54 },
  eliteBtn: { x: 268, y: 1110, w: 168, h: 54 },
  mute: { x: 444, y: 1110, w: 74, h: 52 },
  startBtn: { x: 150, y: 436, w: 240, h: 76 }, // START WAVE, on the road during prep
  endPanel: { x: 50, y: 300, w: 440, h: 420 }, // stage clear / defeat panel
  overlayBtn: { x: 150, y: 640, w: 240, h: 66 },
  overlay: { x: 36, y: 150, w: 468, h: 840 }, // stats panel
  evoTitleY: 720, // "EVOLVED!" text during the reveal
  infoCard: { y: 590, h: 52, hTall: 72 }, // bottom-anchored card shown while dragging
};

/** The roll stage: where the medallion floats, its radius, and where the open case sits under it. */
export const CASE = { x: W / 2, y: 468, r: 92, caseY: 772 };

/**
 * Roll timing (seconds). The case drops (lands at `drop`), its lid pops at `pop`, the first piece appears at
 * `open`. A rare prize lands as a lower class, waits `calm`, cracks for `charge`, breaks through, and after
 * `gap` cracks again if it has further to go.
 */
export const ROLL = { drop: 0.26, pop: 0.48, open: 0.58, calm: 0.25, charge: 0.6, gap: 0.2 };

/** Where the prize is on its flight to tray slot `slot` (fly = 0..1), and how big (1 = a medallion of radius CASE.r). */
export function caseFlyPos(fly: number, slot: number) {
  const k = fly * fly;
  const r = trayRect(slot);
  return {
    x: CASE.x + (r.x + r.w / 2 - CASE.x) * k,
    y: CASE.y + (r.y + r.h / 2 - CASE.y) * k - Math.sin(fly * Math.PI) * 70,
    scale: 1.1 + (0.42 - 1.1) * k, // it leaves the stage at the prize's size and arrives tray-sized
  };
}

export function trayRect(i: number) {
  const t = L.tray;
  return { x: t.x + i * (t.size + t.gap), y: t.y, w: t.size, h: t.size };
}

/**
 * Attack effect palettes. Rabbits fight clean and bright (yellow-white flashes, white smoke, tier-coloured
 * tracers with a white-hot core); foxes fight dirty (orange flashes, dark smoke, embers, dull brass, jagged red
 * slashes). Fox tracers are one fixed orange, not the tier colour, so whose bullets are whose reads at a glance.
 * kind: each fox's signature move colour (swing smears and slashes).
 */
export const FX = {
  rabbit: { flash: '#ffd84a', core: '#fffbe0', spark: '#fff3b0', smoke: '#ece9f1', word: '#ffe34a', wordText: '#ff4b4b', wordLine: COLOR.ink, tracerCore: '#fffbe8', casing: '#e8b84a' },
  fox: {
    flash: '#ffb347',
    core: '#ffe3a0',
    glow: '#ff8a3d',
    spark: '#ff9a3c',
    smoke: '#8a7f86',
    ember: '#ff7a2b',
    tracer: '#ff6a3d',
    tracerCore: '#ffe08a',
    tracerHead: '#ffd27a',
    slash: '#ff5a3c',
    slashEdge: '#5a1a1a',
    word: '#ff7a3d',
    wordStar: '#ffc23a',
    wordText: '#fff1d6',
    wordLine: '#4a1410',
    casing: '#b88a3a',
    rocket: '#7a3b2e',
    rocketTrail: '#5a5560',
  },
  kind: { thug: '#ff7a5c', runner: '#ffb36b', ninja: '#6b4cff', ninjaEdge: '#2a1a3a', ninjaCore: '#a48bff', brute: '#f3e2c4', boss: '#ff3b30' },
  hit: { white: '#ffffff', star: '#ffd84a', bash: '#d8f2ff', zap: '#7affc8', char: '#3b3040', charSmoke: '#5a5564', decal: '#2b2230', decalLight: '#e8dccb', link: '#8a8f9a', pin: '#b8bcc6' },
  boom: {
    dirty: ['#ffcf6b', '#ff7a2b', '#e8452c'],
    dirtySmoke: '#3e3844',
    dirt: '#7a5a40',
    carrot: '#ff9a3c',
    leaf: ['#5ad66c', '#3fae4f'],
  },
};
