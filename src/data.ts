/** Super weapons, made by fusing two recipe partners (see RECIPES). */
export type SuperId = 'gunblade' | 'gatling' | 'railgun' | 'ram' | 'barrage' | 'cannon';
export type WeaponId = 'fist' | 'knife' | 'bat' | 'shield' | 'pistol' | 'smg' | 'rifle' | 'rocket' | 'grenade' | SuperId;
export type WeaponItemType = 'knife' | 'shield' | 'pistol' | 'smg' | 'rifle' | 'rocket' | 'grenade' | SuperId;
/** Support pieces: they never fight, they boost the pieces they touch. */
export type GearType = 'ammo' | 'scope' | 'banner' | 'medkit';
export type ItemType = 'rabbit' | WeaponItemType | GearType;
export type ProjKind = 'bullet' | 'rocket' | 'grenade' | 'bomb' | 'wave' | 'shell';
export type FoxKind = 'thug' | 'gunner' | 'sprayer' | 'brute' | 'bomber' | 'boss' | 'runner' | 'ninja';

/** Levels 1..7 are shown as weapon classes E, D, C, B, A, S, SSS. */
export const MAX_LEVEL = 7;
export const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'] as const;
export const classOf = (level: number) => CLASSES[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
/** "C-class" etc. */
export const cls = (level: number) => `${classOf(level)}-class`;
/** A super made at A-class or higher is Awakened ("two max-level pieces" of the old 5-level scale). */
export const AWAKEN_LEVEL = 5;

/** Each stage is fought on the next street; they repeat in this order. */
export const STREETS = ['Carrot Market', 'Maple Park', 'Old Town'] as const;
export const streetOf = (stage: number) => (stage - 1) % STREETS.length;

// ------------------------------------------------------------------ cases

export type CaseKind = 'basic' | 'elite' | 'free';

/** Chance (in %) of each class E..SSS. The higher the class, the rarer. */
export const CASES: Record<CaseKind, { name: string; odds: readonly number[]; show: readonly number[] }> = {
  basic: { name: 'WEAPON CASE', odds: [64, 25, 8, 2.3, 0.6, 0.09, 0.01], show: [30, 24, 18, 13, 8, 5, 2] },
  elite: { name: 'ELITE CASE', odds: [0, 45, 33, 15, 5.5, 1.3, 0.2], show: [0, 28, 26, 20, 14, 8, 4] },
  free: { name: 'FREE CASE', odds: [60, 27, 9, 3, 0.8, 0.17, 0.03], show: [30, 24, 18, 13, 8, 5, 2] },
};
// `show` is the class mix of the cards flying past on the spinning strip: richer than the real odds, so rare ones tease.
/** A-class or better, used for the guaranteed (pity) roll. */
export const TOP_ODDS: readonly number[] = [0, 0, 0, 0, 88, 10.5, 1.5];

export function rollClass(odds: readonly number[]): number {
  const total = odds.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r <= 0 && odds[i] > 0) return i + 1;
  }
  return odds.findIndex((o) => o > 0) + 1;
}

// ------------------------------------------------------------------ grid cells

/** How a starting-locked grid cell opens: with cash, on reaching a stage, or after enough knock-outs. */
export type CellLock = { kind: 'cash' } | { kind: 'stage'; stage: number } | { kind: 'ko'; count: number };

/** Keyed "col,row". Every locked cell of the 5x5 grid is listed. */
export const CELL_LOCKS: Record<string, CellLock> = {
  '0,0': { kind: 'cash' },
  '4,1': { kind: 'cash' },
  '4,2': { kind: 'cash' },
  '4,3': { kind: 'cash' },
  '1,4': { kind: 'cash' },
  '1,0': { kind: 'stage', stage: 2 },
  '2,0': { kind: 'stage', stage: 3 },
  '3,0': { kind: 'stage', stage: 4 },
  '4,0': { kind: 'stage', stage: 5 },
  '0,4': { kind: 'ko', count: 50 },
  '2,4': { kind: 'ko', count: 150 },
  '3,4': { kind: 'ko', count: 300 },
  '4,4': { kind: 'ko', count: 500 },
};

export interface WeaponStats {
  name: string;
  melee: boolean;
  dmg: number;
  cd: number;
  range: number;
  hpMul: number;
  armor: number;
  speedMul: number;
  proj?: ProjKind;
  projSpeed: number;
  aoe: number;
  spread: number;
  /** Power-score multiplier for weapons whose special attack is worth more than raw damage shows. */
  pw?: number;
  evo?: EvoTrait;
}

/** What makes a super weapon fight differently. */
export interface EvoTrait {
  blurb: string; // one line for the info card and the book
  awake: string; // what the Awakened (Lv5) form adds
  waveEvery?: number; // gunblade: every Nth slash sends a shock wave down the lane
  spinMax?: number; // gatling: fire-rate multiplier once fully spun up
  pierce?: number; // railgun: foxes one beam can hit
  dash?: number; // riot ram: seconds between charges
  cluster?: number; // barrage: bomblets per rocket
  shell?: boolean; // carrot cannon: piercing shell that explodes on landing
}

const W0 = { hpMul: 1, armor: 0, speedMul: 1, projSpeed: 0, aoe: 0, spread: 0 };

export const WEAPONS: Record<WeaponId, WeaponStats> = {
  fist: { ...W0, name: 'Paws', melee: true, dmg: 6, cd: 0.8, range: 24 },
  knife: { ...W0, name: 'Knife', melee: true, dmg: 15, cd: 0.65, range: 28, hpMul: 1.15, speedMul: 1.1 },
  bat: { ...W0, name: 'Club', melee: true, dmg: 16, cd: 1.2, range: 30, hpMul: 1.2 },
  shield: { ...W0, name: 'Riot Shield', melee: true, dmg: 9, cd: 1, range: 28, hpMul: 2.6, armor: 0.3, speedMul: 0.85 },
  pistol: { ...W0, name: 'Pistol', melee: false, dmg: 11, cd: 0.85, range: 210, proj: 'bullet', projSpeed: 950 },
  smg: { ...W0, name: 'SMG', melee: false, dmg: 4.6, cd: 0.2, range: 190, proj: 'bullet', projSpeed: 1000, spread: 9 },
  rifle: { ...W0, name: 'Rifle', melee: false, dmg: 34, cd: 1.6, range: 330, proj: 'bullet', projSpeed: 1500, hpMul: 0.9, speedMul: 0.9 },
  rocket: { ...W0, name: 'Rocket', melee: false, dmg: 44, cd: 2.8, range: 270, proj: 'rocket', projSpeed: 430, aoe: 62, speedMul: 0.85 },
  grenade: { ...W0, name: 'Grenade', melee: false, dmg: 30, cd: 2.3, range: 230, proj: 'grenade', projSpeed: 330, aoe: 56 },

  // ---- super weapons (tuned to ~1.4x the two pieces they replace) ----
  gunblade: {
    ...W0,
    name: 'Gunblade',
    melee: true,
    dmg: 24,
    cd: 0.6,
    range: 30,
    hpMul: 1.4,
    armor: 0.1,
    speedMul: 1.15,
    pw: 1.35,
    evo: { blurb: 'Every 3rd slash fires a shock wave down its lane', awake: 'a wave every 2nd slash, reaching farther', waveEvery: 3 },
  },
  gatling: {
    ...W0,
    name: 'Gatling',
    melee: false,
    dmg: 5.4,
    cd: 0.2,
    range: 205,
    proj: 'bullet',
    projSpeed: 1050,
    spread: 11,
    hpMul: 1.15,
    speedMul: 0.85,
    pw: 1.9,
    evo: { blurb: 'Spins up to fire 2.5x faster the longer it shoots', awake: 'spins up to 3.5x', spinMax: 2.5 },
  },
  railgun: {
    ...W0,
    name: 'Railgun',
    melee: false,
    dmg: 75,
    cd: 2,
    range: 380,
    hpMul: 0.95,
    speedMul: 0.9,
    pw: 1.3,
    evo: { blurb: 'Instant beam that pierces up to 5 foxes in a line', awake: 'pierces up to 7 foxes', pierce: 5 },
  },
  ram: {
    ...W0,
    name: 'Riot Ram',
    melee: true,
    dmg: 16,
    cd: 0.95,
    range: 30,
    hpMul: 3.4,
    armor: 0.35,
    speedMul: 0.95,
    pw: 2.9,
    evo: { blurb: 'Charges through the fox line, bowling them over', awake: 'charges every 2 seconds', dash: 3.2 },
  },
  barrage: {
    ...W0,
    name: 'Cluster Barrage',
    melee: false,
    dmg: 50,
    cd: 3,
    range: 285,
    proj: 'rocket',
    projSpeed: 440,
    aoe: 60,
    speedMul: 0.85,
    pw: 2.5,
    evo: { blurb: 'Rockets burst into 4 bomblets on impact', awake: '6 bomblets per rocket', cluster: 4 },
  },
  cannon: {
    ...W0,
    name: 'Carrot Cannon',
    melee: false,
    dmg: 120,
    cd: 4,
    range: 300,
    proj: 'shell',
    projSpeed: 360,
    aoe: 90,
    hpMul: 1.2,
    speedMul: 0.8,
    pw: 2.55,
    evo: { blurb: 'Giant carrot shell pierces the line, then explodes', awake: 'the carrot bounces for a second blast', shell: true },
  },
};

export interface ItemDef {
  name: string;
  w: number;
  h: number;
  weight: number;
}

/** Grid pieces. w/h are in cells; weight is how often the shop rolls it. */
export const ITEMS: Record<ItemType, ItemDef> = {
  rabbit: { name: 'Rabbit', w: 1, h: 2, weight: 20 },
  knife: { name: 'Knife', w: 2, h: 1, weight: 16 },
  pistol: { name: 'Pistol', w: 1, h: 1, weight: 16 },
  smg: { name: 'SMG', w: 1, h: 2, weight: 13 },
  rifle: { name: 'Rifle', w: 2, h: 1, weight: 9 },
  shield: { name: 'Riot Shield', w: 1, h: 2, weight: 9 },
  grenade: { name: 'Grenade', w: 1, h: 1, weight: 9 },
  rocket: { name: 'Rocket', w: 2, h: 1, weight: 6 },
  ammo: { name: 'Ammo Box', w: 1, h: 1, weight: 7 },
  scope: { name: 'Scope', w: 1, h: 1, weight: 7 },
  banner: { name: 'War Banner', w: 1, h: 2, weight: 5 },
  medkit: { name: 'Med Kit', w: 1, h: 1, weight: 6 },
  // supers are only made by fusing (weight 0 = never rolled); each keeps its main ingredient's footprint
  gunblade: { name: 'Gunblade', w: 2, h: 1, weight: 0 },
  gatling: { name: 'Gatling', w: 1, h: 2, weight: 0 },
  railgun: { name: 'Railgun', w: 2, h: 1, weight: 0 },
  ram: { name: 'Riot Ram', w: 1, h: 2, weight: 0 },
  barrage: { name: 'Cluster Barrage', w: 2, h: 1, weight: 0 },
  cannon: { name: 'Carrot Cannon', w: 2, h: 1, weight: 0 },
};

// ------------------------------------------------------------------ evolutions

/** Two different pieces of the SAME level (Lv3+) fuse into a super that keeps that level and the main piece's footprint. */
export interface Recipe {
  result: SuperId;
  main: WeaponItemType;
  partner: ItemType;
}

/** In ladder order: the starter first, the ultimate (two supers) last. */
export const RECIPES: readonly Recipe[] = [
  { result: 'gunblade', main: 'knife', partner: 'pistol' },
  { result: 'gatling', main: 'smg', partner: 'ammo' },
  { result: 'railgun', main: 'rifle', partner: 'scope' },
  { result: 'ram', main: 'shield', partner: 'knife' },
  { result: 'barrage', main: 'rocket', partner: 'grenade' },
  { result: 'cannon', main: 'railgun', partner: 'barrage' },
];

export const SUPERS: readonly SuperId[] = RECIPES.map((r) => r.result);
export const isSuper = (t: string): t is SuperId => (SUPERS as readonly string[]).includes(t);
export const recipeFor = (a: ItemType, b: ItemType): Recipe | null =>
  RECIPES.find((r) => (r.main === a && r.partner === b) || (r.main === b && r.partner === a)) ?? null;
export const recipeOf = (s: SuperId): Recipe => RECIPES.find((r) => r.result === s)!;
export const recipesUsing = (t: ItemType): Recipe[] => RECIPES.filter((r) => r.main === t || r.partner === t);
/** Base recipes use regular pieces; the ultimate fuses two supers. */
export const isBaseRecipe = (r: Recipe) => !isSuper(r.main);

// ------------------------------------------------------------------ gear

export interface GearDef {
  name: string;
  color: string;
  /** What it boosts when touching: any weapon, guns only, or rabbits (all of that rabbit's squads). */
  target: 'weapon' | 'gun' | 'rabbit';
}

export const GEAR: Record<GearType, GearDef> = {
  ammo: { name: 'Ammo Box', color: '#ffd84a', target: 'weapon' },
  scope: { name: 'Scope', color: '#ff5a4f', target: 'gun' },
  banner: { name: 'War Banner', color: '#ff9f43', target: 'rabbit' },
  medkit: { name: 'Med Kit', color: '#5ad66c', target: 'rabbit' },
};

export const isGear = (t: ItemType): t is GearType => t === 'ammo' || t === 'scope' || t === 'banner' || t === 'medkit';
export const isWeapon = (t: ItemType): t is WeaponItemType => t !== 'rabbit' && !isGear(t);

/** Does this gear boost a piece of type t when they touch? */
export function gearBoosts(g: GearType, t: ItemType) {
  const target = GEAR[g].target;
  if (target === 'rabbit') return t === 'rabbit';
  if (target === 'gun') return isWeapon(t) && !WEAPONS[t].melee; // ranged supers take scopes too
  return isWeapon(t);
}

/** What one gear piece of a given level adds. */
export const GEAR_FX = {
  rate: (lv: number) => 0.2 * lv, // ammo: attack speed
  dmg: (lv: number) => 0.2 * lv, // scope
  range: (lv: number) => 0.1 * lv, // scope
  extra: (lv: number) => Math.ceil(lv / 2), // banner: extra soldiers per squad
  hp: (lv: number) => 0.25 * lv, // med kit
  regen: (lv: number) => 0.015 * lv, // med kit: share of max HP healed per second
};

const pct = (f: number) => `+${Math.round(f * 100)}%`;

export function gearDesc(g: GearType, lv: number): string {
  switch (g) {
    case 'ammo':
      return `Weapons touching it attack ${pct(GEAR_FX.rate(lv))} faster`;
    case 'scope':
      return `Guns touching it: ${pct(GEAR_FX.dmg(lv))} damage, ${pct(GEAR_FX.range(lv))} range`;
    case 'banner': {
      const n = GEAR_FX.extra(lv);
      return `Rabbits touching it send +${n} soldier${n > 1 ? 's' : ''} per squad`;
    }
    case 'medkit':
      return `Rabbits touching it: ${pct(GEAR_FX.hp(lv))} HP and their squads heal`;
  }
}

/** One squad as the grid builds it: a weapon carried by a rabbit, plus gear boosts. */
export interface SlotStats {
  weapon: WeaponId;
  wLevel: number;
  rLevel: number;
  rate: number; // attack speed multiplier
  dmgMul: number;
  rangeMul: number;
  hpMul: number;
  regen: number; // share of max HP healed per second
  extra: number; // soldiers on top of BAL.squad
}

export const BAL = {
  rabbitHp: 70,
  rabbitSpeed: 60,
  respawn: 4,
  squad: 2, // rabbits each linked weapon (or lone rabbit) puts on the road
  unitScale: 0.8, // drawing size of everyone on the road (smaller = more of a crowd battle)
  dmgPerWeaponLevel: 2.05,
  hpPerWeaponLevel: 1.3,
  hpPerRabbitLevel: 1.8,
  dmgPerRabbitLevel: 0.25,
  baseHp: 500,
  startCash: 9,
  critChance: 0.15, // rabbit hits that deal double damage
  comboWindow: 2.2, // seconds between knock-outs to keep a combo going
  bombCooldown: 9, // tap-the-road carrot airstrike
  bombDmg: 70, // scaled with the waves like fox health
  bombAoe: 80,
  cellCost: 6, // price of the first extra grid cell...
  cellCostStep: 4, // ...and how much each next one costs more
  evoMinLevel: 3, // recipe partners must be the same class, at least C
  evoGems: 3, // paid the first time each recipe is fused in a run
  featuredChance: 0.15, // share of cases that bring the missing half of the recipe you are closest to
  evoFeed: true, // super + same-level ingredient = super +1 level
  evoSellMul: 2, // supers sell for their two ingredients
  startGems: 5,
  caseCost: 4,
  caseCostStep: 0.9, // case price goes up by this much per case opened (rounded down)
  eliteCost: 6, // gems
  pity: 25, // the 25th case in a row without an A-class or better is guaranteed one
  wavesPerStage: 10,
  foxHp: 1.1, // overall fox toughness
  foxHpGrowth: 1.15, // per wave
  foxDmgGrowth: 1.1,
};

export const sellValue = (level: number) => [1, 3, 6, 12, 24, 48, 96][level - 1] ?? 1;
export const itemSellValue = (t: ItemType, level: number) => sellValue(level) * (isSuper(t) ? BAL.evoSellMul : 1);

export interface FoxDef {
  name: string;
  weapon: WeaponId;
  hp: number;
  dmg: number;
  cd: number;
  range: number;
  speed: number;
  scale: number;
  reward: number;
  armor: number;
  leak: number; // carrots stolen if it gets past the left edge
  minWave: number;
  weight: number;
}

export const FOXES: Record<FoxKind, FoxDef> = {
  thug: { name: 'Thug', weapon: 'knife', hp: 46, dmg: 8, cd: 0.9, range: 28, speed: 50, scale: 1, reward: 1, armor: 0, leak: 25, minWave: 1, weight: 5 },
  gunner: { name: 'Gunner', weapon: 'pistol', hp: 38, dmg: 6, cd: 1.15, range: 200, speed: 44, scale: 1, reward: 1, armor: 0, leak: 20, minWave: 1, weight: 4 },
  sprayer: { name: 'Sprayer', weapon: 'smg', hp: 44, dmg: 2.8, cd: 0.24, range: 180, speed: 44, scale: 1, reward: 2, armor: 0, leak: 25, minWave: 4, weight: 2.5 },
  brute: { name: 'Brute', weapon: 'bat', hp: 190, dmg: 17, cd: 1.3, range: 32, speed: 32, scale: 1.3, reward: 3, armor: 0.2, leak: 60, minWave: 3, weight: 1.6 },
  bomber: { name: 'Bomber', weapon: 'rocket', hp: 58, dmg: 20, cd: 3.2, range: 250, speed: 36, scale: 1, reward: 3, armor: 0, leak: 35, minWave: 6, weight: 1.2 },
  // runners dash past the rabbits for the carrots; shadows teleport next to the rabbit shooters
  runner: { name: 'Runner', weapon: 'knife', hp: 32, dmg: 6, cd: 0.7, range: 26, speed: 92, scale: 0.92, reward: 2, armor: 0, leak: 30, minWave: 3, weight: 1.8 },
  ninja: { name: 'Shadow', weapon: 'knife', hp: 44, dmg: 10, cd: 0.75, range: 28, speed: 62, scale: 0.98, reward: 3, armor: 0, leak: 30, minWave: 5, weight: 1.5 },
  boss: { name: 'Big Red', weapon: 'smg', hp: 900, dmg: 4, cd: 0.16, range: 240, speed: 22, scale: 1.8, reward: 25, armor: 0.15, leak: 250, minWave: 999, weight: 0 },
};

/** Stats of one rabbit soldier: a weapon (with its level) carried by a rabbit (with its level). */
export function rabbitStats(weapon: WeaponId, wLevel: number, rLevel: number) {
  const w = WEAPONS[weapon];
  const dmg = w.dmg * BAL.dmgPerWeaponLevel ** (wLevel - 1) * (1 + BAL.dmgPerRabbitLevel * (rLevel - 1));
  const hp = BAL.rabbitHp * w.hpMul * BAL.hpPerRabbitLevel ** (rLevel - 1) * BAL.hpPerWeaponLevel ** (wLevel - 1);
  return { dmg, hp, w };
}

/** Army strength of one squad, boosts and squad size included (the number on the power tab). */
export function slotPower(s: SlotStats) {
  const b = rabbitStats(s.weapon, s.wLevel, s.rLevel);
  const dps = (b.dmg * s.dmgMul * (1 + b.w.aoe / 60) * s.rate * (b.w.pw ?? 1)) / b.w.cd;
  const hp = b.hp * s.hpMul * (1 + s.regen * 10);
  return Math.round(((dps * 2 + hp / 5) * (BAL.squad + s.extra)) / BAL.squad);
}
