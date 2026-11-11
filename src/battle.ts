import { sfx, type SoundName } from './audio';
import { AWAKEN_LEVEL, BAL, FOXES, STREETS, WEAPONS, rabbitStats, recommendedPower, streetOf, waveFoxCount, type EvoTrait, type FoxKind, type ProjKind, type WeaponId } from './data';
import {
  STEP_EJECT,
  STEP_FROZEN,
  atkFx,
  blastFx,
  boltFx,
  bulletHit,
  coolFx,
  dashEnd,
  dashHit,
  dashStart,
  dashTrail,
  freezeOn,
  fxBody,
  fxHostStep,
  fxStep,
  gunFire,
  hurtFx,
  landFx,
  meleeHit,
  meleeSwing,
  meleeWhiff,
  projFx,
  punch,
  railDone,
  railHit,
  rocketTrail,
  shellTrail,
  shotDodged,
  sweepHit,
  throwFx,
  toss,
  waveFx,
  windFx,
  windTick,
  type FxBody,
  type KillHow,
  type ProjFx,
} from './attackfx';
import { BARREL, GUN_HAND, ROCKET_HAND, SHOULDER } from './draw/characters';
import { Effects, type BlastStyle, type BodySnap } from './effects';
import { ICON_RABBIT, foxStyle, rabbitStyle, type Style } from './looks';
import type { Slot } from './inventory';
import { COLOR, EVO, L, W } from './theme';
import { clamp, frand, lerp, pick, rand } from './util';

export type Side = 'rabbit' | 'fox';
/**
 * prep: before a wave, the player manages the grid and opens cases; the wave starts only when they tap START.
 * fight: the wave (grid locked). cleared: the wave clear animation. victory: the stage clear party.
 * travel: the sprint to the next street. defeat: carrots stolen.
 */
export type Phase = 'prep' | 'fight' | 'cleared' | 'victory' | 'travel' | 'defeat';

/** Seconds of the wave clear animation. */
export const CLEAR_DUR = 2;

/**
 * The sprint to the next street: crouch until `launch`, reach top speed in `ramp`, hold it until `brake`,
 * skid to a stop at `stop`, catch breath until `dur`. `screens` streets fly past (keep it 1 more than a
 * multiple of the 3 streets, so the last one is the next street); `km` is what the distance counter shows.
 */
export const TRAVEL = { launch: 0.45, ramp: 0.12, brake: 2.2, stop: 2.65, dur: 3.05, screens: 10, km: 19 };
const TRAVEL_AREA = 0.5 * TRAVEL.ramp + (TRAVEL.brake - TRAVEL.launch - TRAVEL.ramp) + 0.5 * (TRAVEL.stop - TRAVEL.brake);

/** Share of the trip done t seconds in (speed ramps up fast, holds, then brakes). */
export function travelFrac(t: number) {
  const { launch: a, ramp, brake: c, stop: d } = TRAVEL;
  const b = a + ramp;
  let s: number;
  if (t <= a) return 0;
  if (t < b) s = (0.5 * (t - a) ** 2) / ramp;
  else if (t < c) s = 0.5 * ramp + (t - b);
  else if (t < d) s = 0.5 * ramp + (c - b) + (t - c) - (0.5 * (t - c) ** 2) / (d - c);
  else return 1;
  return s / TRAVEL_AREA;
}

/** Speed 0..1 of the trip t seconds in. */
export function travelVel(t: number) {
  const { launch: a, ramp, brake: c, stop: d } = TRAVEL;
  if (t <= a || t >= d) return 0;
  if (t < a + ramp) return (t - a) / ramp;
  if (t < c) return 1;
  return 1 - (t - c) / (d - c);
}

/** Shooters stay on the left half of the road; melee rabbits (knife, shield, paws and their supers) can charge anywhere. */
export const RANGED_LINE = W / 2 - 10;

const FIREWORK_COLORS = ['#ff6b6b', '#ffd84a', '#5ad66c', '#5aa8ff', '#c48bff', '#ff9f43', '#ff7af5'];

export interface Econ {
  cash: number;
  gems: number;
}

/** A fox was knocked out here (the game turns this into a bill flying to the cash counter). */
export interface KillEvent {
  x: number;
  y: number;
  reward: number;
}

/**
 * What a soldier does in the fight. Rabbits: tank (shield, paws) holds the front and intercepts, flank (knife)
 * hunts gunmen round the side, line (pistol, SMG, grenade) and back (rifle, rocket, ...) shoot from the formation.
 * Foxes use melee / gun from their weapon and their pack.
 */
export type Role = 'tank' | 'flank' | 'line' | 'back';
/** advance: marching in a pack; gather: a melee pack waiting to charge together; charge; engage; retreat: hurt, falling back; hold: in formation. */
export type UnitState = 'hold' | 'advance' | 'gather' | 'charge' | 'engage' | 'retreat';
/** A little bubble over the head: '!' spotted / charging, 'sweat' falling back hurt. */
export type Emote = '' | '!' | 'sweat';

/** Where each rabbit role stands in the formation (x), from the back line to the front. */
const FORMATION_X: Record<Role, number> = { back: 104, line: 162, flank: 206, tank: 238 };

interface Brain {
  gx: number; // where to go
  gy: number;
  attack: boolean;
  move: boolean; // keep moving while attacking (back-pedalling shooters)
  aim: number; // 0..1 raise the weapon
  speed: number; // multiplier
  face: number; // 1 / -1, or 0 = face the target
  tol?: number; // how far off its goal it may be pushed before it walks back (default 3)
}

/** What each fox can do besides walking and attacking. Cooldowns in seconds; dodge is a chance per incoming shot. */
interface FoxSkill {
  dodge: number;
  sprintCd?: number; // bursts of speed at a target
  blinkCd?: number; // teleports in a puff of smoke
  rushCd?: number; // bull rush that bowls rabbits over
  smokeCd?: number; // smoke bomb cover
  rallyCd?: number; // war cry: the whole gang moves and attacks faster
}

const FOX_SKILLS: Record<FoxKind, FoxSkill> = {
  thug: { dodge: 0.12, sprintCd: 5 },
  gunner: { dodge: 0.1, blinkCd: 7 },
  sprayer: { dodge: 0.15 },
  brute: { dodge: 0, rushCd: 6 },
  bomber: { dodge: 0.08, smokeCd: 11 },
  boss: { dodge: 0, blinkCd: 9, rallyCd: 14 },
  runner: { dodge: 0.3, sprintCd: 3 },
  ninja: { dodge: 0.32, blinkCd: 3.5, smokeCd: 12 },
};
/** Foxes that never march in a pack: they go their own way at their own speed. */
const LONERS = new Set<FoxKind | 'rabbit'>(['runner', 'ninja']);
/** How far apart a role's ranks stand. */
const RANK_GAP: Record<Role, number> = { back: 26, line: 28, flank: 26, tank: 24 };
const RALLY = { time: 4, speed: 1.35, rate: 0.75 };
/**
 * A brute plants its feet this long before a bull rush, so the rabbits in its row can dive out of the way
 * (u.windT counts it down; the rush runs along u.dashY at u.windTarget).
 */
export const RUSH_WINDUP = 0.35;
/**
 * Fox gunmen back away from knives only so much: never past maxX, and for at most `budget` seconds that refill
 * over `window` seconds. Otherwise the last gunman of a wave could keep backing out of the shooters' reach forever.
 */
const BACK_AWAY = { maxX: 470, budget: 1.5, window: 6 };
/**
 * The foxes left stop hanging back and press in after STALL_T seconds without a fox going down, or once every fox
 * of the wave is on the road and the wave has lasted LATE_T seconds (no endless long-range firefights).
 */
const STALL_T = 20;
const LATE_T = 55;
/** Knives and shields never chase further up the road than this: past it is the fox gunmen's killing zone. */
const MELEE_REACH_CAP = 400;
/** How hard a fox hits per second (blasts count extra: they hit several rabbits), for the rabbits' threat ranking. */
const foxDps = (u: Unit) => (FOXES[u.kind as FoxKind].dmg / FOXES[u.kind as FoxKind].cd) * (u.aoe ? 2.5 : 1);
const THUG_DPS = FOXES.thug.dmg / FOXES.thug.cd;

export interface Smoke {
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
}

/**
 * A soldier on the road. The attack animation state it carries (wind-up pose, lunge and squash springs, hit-stop,
 * flinch, tumble: attackfx FxBody) is draw only: nothing in the fight reads it.
 */
export interface Unit extends FxBody {
  id: number;
  side: Side;
  kind: FoxKind | 'rabbit';
  x: number;
  y: number;
  laneY: number;
  face: number;
  hp: number;
  maxHp: number;
  hpShown: number; // lags behind hp for the white "chip" on the health bar
  armor: number;
  weapon: WeaponId;
  level: number;
  rLevel: number;
  dmg: number;
  cd: number;
  cdLeft: number;
  range: number;
  speed: number;
  melee: boolean;
  proj?: ProjKind;
  projSpeed: number;
  aoe: number;
  spread: number;
  scale: number;
  radius: number;
  slotKey: number;
  target: Unit | null;
  retarget: number;
  walk: number;
  moving: boolean;
  atk: number;
  flash: number;
  aim: number;
  aimAngle: number;
  blinkT: number;
  kx: number; // knockback speed
  z: number; // height above the road (explosions, cheering)
  vz: number;
  cheer: number;
  dustT: number;
  stepN: number; // half-strides walked: a foot lands each time it ticks over
  style: Style; // its own fur, clothes, hat and accessory
  dead: boolean;
  reward: number;
  leak: number;
  rallyX: number;
  regen: number; // share of max HP healed per second (med kit)
  healT: number;
  scoped: boolean; // has a scope boost: draws a laser sight
  // super weapons
  evo?: EvoTrait;
  awake: boolean; // Awakened (Lv5) super
  swings: number; // attack counter (gunblade waves, gatling flash thinning)
  spin: number; // gatling spin-up 0..1
  spinPhase: number; // gatling barrel animation
  dash: number; // riot ram: seconds of charge left
  dashCd: number;
  dashDir: number; // direction locked when the charge starts
  dashY: number; // row of the fox it charged at (it steers onto it)
  hitIds: Set<number> | null; // foxes already bowled over in this charge
  sprint: number; // running to the next street: > 0 leaning into the sprint (1 = full speed, legs a blur), < 0 skidding
  // tactics
  role: Role;
  state: UnitState;
  stateT: number;
  homeX: number; // rabbits: their spot in the formation
  homeY: number;
  jitter: number; // a small fixed offset so the formation does not look ruled
  flankSide: number; // knife rabbits: which side they swing round
  retreatCd: number;
  retreated: boolean; // foxes fall back once
  pack: number; // foxes: the pack they arrived with
  leader: Unit | null;
  packDx: number; // place in the pack's wedge, from the leader
  packDy: number;
  packSpeed: number; // the pack marches at its slowest member's pace
  packMelee: boolean; // the pack gathers before it charges
  gatherX: number;
  charged: boolean;
  emote: Emote;
  emoteT: number;
  // smooth movement and personality
  parked: boolean; // standing on its spot: small pushes do not make it walk back
  moveT: number; // keeps the walk going through tiny pauses (no flickering legs)
  tempo: number; // its own idle rhythm
  lean: number; // its own posture
  kneel: boolean; // kneels to aim (rifles, rockets and some other shooters)
  crouch: number; // 0..1 how far down it is right now
  jitterY: number;
  fidget: number; // seconds to the next idle fidget
  lookT: number; // looking back over its shoulder
  aimT: number; // checking its weapon
  calmT: number; // knife rabbits: regrouping after a fox ran out of reach (no chasing far meanwhile)
  // fox skills
  blinkCd: number;
  boostT: number; // sprinting
  boostCd: number;
  rushCd: number;
  smokeCd: number;
  rallyCd: number;
  dodgeCd: number;
  dodgeT: number; // mid side-step
  dodgeDir: number;
  stun: number; // bowled over by a bull rush: dizzy, cannot act
  unanswered: number; // fox gunman: seconds that no rabbit could hit it back where it stands
  planted: boolean; // fox gunman: has stopped to shoot here
  backT: number; // backing away from a knife
  backBudget: number; // fox gunman: seconds of backing away it has left (refills slowly, so it cannot back off forever)
  sideY: number; // a row it has committed to (detour round a shield, strafing, backing off)
  sideT: number;
  summoned: boolean; // the boss called its runners in
  windT: number; // brute: feet planted, winding up a bull rush (the rabbits in its row see it coming)
  windTarget: Unit | null;
  // rabbit squad tactics
  evadeT: number; // stepping out of a blast or a bull rush row: committed to (evadeX, evadeY) at evadeS for a moment
  evadeX: number;
  evadeY: number;
  evadeS: number;
  kiteT: number; // shooter: hopping back and sideways from a brawler to (kiteX, kiteY), still shooting
  kiteX: number;
  kiteY: number;
  commitT: number; // melee rabbit: just picked this fox, so only a much better one makes it switch
  fwd: number; // shooter: how far it has stepped up from its spot to answer foxes just out of reach
}

/** A bullet, rocket, grenade, wave or shell in flight. ProjFx (the gun that fired it) only changes how it is drawn. */
export interface Projectile extends ProjFx {
  kind: ProjKind;
  side: Side;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  target: Unit | null;
  speed: number;
  dmg: number;
  aoe: number;
  level: number;
  offset: number;
  t: number;
  dur: number;
  angle: number;
  dead: boolean;
  trailT: number;
  crit: boolean;
  hits?: Set<number>; // piercing shots: foxes already hit
  cluster?: number; // barrage rocket: bomblets to release on impact
  mini?: boolean; // small bomblet / light gatling round
  echo?: boolean; // awakened cannon: bounce for a second blast
  bounce?: boolean; // that second blast: drawn as the bouncing carrot, not a grenade
  salvo?: Salvo; // a barrage rocket and its bomblets share one, to count their knock-outs together
}

/** One cluster barrage shot: its knock-outs so far (rocket plus bomblets), for its BOOM-BOOM! (cosmetic only). */
interface Salvo {
  kills: number;
  said: boolean;
}

/** How far off its row a fox can be for the riot ram to charge at it (and hit it); also a bull rush's row. */
export const RAM_ROW = 30;
/** How far a kneeling rabbit's body drops (drawn the same in characters.ts). */
export const CROUCH = 7;

export interface Banner {
  text: string;
  sub: string;
  t: number;
  color: string;
  /** The stage banner also shows the stage's recommended power. */
  rec?: number;
}

interface Member {
  unit: Unit | null;
  respawn: number;
}

interface SlotEntry {
  slot: Slot;
  members: Member[];
}

const GUN_SOUND: Partial<Record<WeaponId, SoundName>> = {
  pistol: 'pistol',
  smg: 'smg',
  rifle: 'rifle',
  rocket: 'rocket',
  gatling: 'gatling',
  railgun: 'rail',
  barrage: 'rocket',
  cannon: 'cannon',
};
/** What each melee weapon sounds like when it lands. */
const MELEE_SOUND: Partial<Record<WeaponId, SoundName>> = {
  fist: 'punch',
  knife: 'slash',
  bat: 'whack',
  shield: 'bash',
  gunblade: 'slash',
  ram: 'bash',
};

let uid = 1;

/** Where a weapon stands in the formation. */
function roleOf(weapon: WeaponId): Role {
  const w = WEAPONS[weapon];
  if (weapon === 'knife' || weapon === 'bat' || weapon === 'gunblade') return 'flank';
  if (w.melee) return 'tank';
  return w.range > 250 || w.proj === 'rocket' || w.proj === 'shell' ? 'back' : 'line';
}

/** Enough about a unit to draw it after it is gone (knocked out, or the afterimage of a teleport). */
function snapOf(u: Unit): BodySnap {
  return { side: u.side, kind: u.kind, style: u.style, weapon: u.weapon, level: u.level, rLevel: u.rLevel, scale: u.scale, face: u.face };
}

function makeUnit(side: Side, kind: FoxKind | 'rabbit', x: number, y: number): Unit {
  return {
    id: uid++,
    side,
    kind,
    x,
    y,
    laneY: y,
    face: side === 'rabbit' ? 1 : -1,
    hp: 1,
    maxHp: 1,
    hpShown: 1,
    armor: 0,
    weapon: 'fist',
    level: 1,
    rLevel: 1,
    dmg: 1,
    cd: 1,
    cdLeft: rand(0.1, 0.6),
    range: 24,
    speed: 50,
    melee: true,
    proj: undefined,
    projSpeed: 0,
    aoe: 0,
    spread: 0,
    scale: 1,
    radius: 13,
    slotKey: -1,
    target: null,
    retarget: 0,
    walk: rand(0, 6),
    moving: false,
    atk: 0,
    flash: 0,
    aim: 0,
    aimAngle: 0,
    blinkT: rand(1, 4),
    kx: 0,
    z: 0,
    vz: 0,
    cheer: 0,
    dustT: rand(0, 0.3),
    stepN: -1, // set on its first frame, so a new soldier does not stamp a step at once
    style: ICON_RABBIT,
    dead: false,
    reward: 0,
    leak: 0,
    rallyX: 0,
    regen: 0,
    healT: 0,
    scoped: false,
    evo: undefined,
    awake: false,
    swings: 0,
    spin: 0,
    spinPhase: 0,
    dash: 0,
    dashCd: 1,
    dashDir: 1,
    dashY: y,
    hitIds: null,
    sprint: 0,
    role: 'line',
    state: side === 'rabbit' ? 'hold' : 'advance',
    stateT: 0,
    homeX: x,
    homeY: y,
    jitter: rand(-9, 9),
    flankSide: Math.random() < 0.5 ? -1 : 1,
    retreatCd: 0,
    retreated: false,
    pack: 0,
    leader: null,
    packDx: 0,
    packDy: 0,
    packSpeed: 50,
    parked: false,
    moveT: 0,
    tempo: rand(0.8, 1.25),
    lean: rand(-0.05, 0.05),
    kneel: false,
    crouch: 0,
    jitterY: rand(-6, 6),
    fidget: rand(2, 7),
    lookT: 0,
    aimT: 0,
    calmT: 0,
    blinkCd: rand(1.5, 3),
    boostT: 0,
    boostCd: rand(0.5, 2),
    rushCd: rand(1.5, 3),
    smokeCd: rand(2, 5),
    rallyCd: 5,
    dodgeCd: 0,
    dodgeT: 0,
    dodgeDir: 1,
    stun: 0,
    unanswered: 0,
    planted: false,
    backT: 0,
    backBudget: BACK_AWAY.budget,
    sideY: y,
    sideT: 0,
    summoned: false,
    windT: 0,
    windTarget: null,
    evadeT: 0,
    evadeX: x,
    evadeY: y,
    evadeS: 1,
    kiteT: 0,
    kiteX: x,
    kiteY: y,
    commitT: 0,
    fwd: 0,
    packMelee: false,
    gatherX: 0,
    charged: true,
    emote: '',
    emoteT: 0,
    ...fxBody(),
  };
}

/** Everything about a squad's stats; when it changes, living soldiers are upgraded in place. */
const slotSig = (s: Slot) => [s.weapon, s.wLevel, s.rLevel, s.rate, s.dmgMul, s.rangeMul, s.hpMul, s.regen].join('|');

/** Everything that happens on the road: rabbits, foxes, bullets, waves, combos and the carrot airstrike. */
export class Battle {
  units: Unit[] = [];
  projs: Projectile[] = [];
  fx = new Effects();
  slots = new Map<number, SlotEntry>();
  /** Smoke bombs on the road: foxes inside are hard to hit and hard to pick out. */
  smokes: Smoke[] = [];
  /** The boss's war cry: seconds left of the whole gang moving and attacking faster. */
  rallyT = 0;
  events: KillEvent[] = [];
  baseMax = BAL.baseHp;
  baseHp = BAL.baseHp;
  baseShown = BAL.baseHp;
  leakFlash = 0;
  stage = 1;
  wave = 1;
  /**
   * Kilometres run this game, the goal: BAL.kmPerWave for each wave cleared (once: a wave replayed after a defeat
   * pays nothing) and TRAVEL.km for the sprint to the next street, counted up live while it runs.
   */
  km = 0;
  /** The highest wave of this stage that has paid its kilometres, and what the last clear paid (for the ribbon). */
  kmWave = 0;
  clearKm = 0;
  private travelFromKm = 0;
  phase: Phase = 'prep';
  /** cleared, victory, travel: seconds since it began. */
  phaseT = 0;
  /** Seconds since prep began (the START button pops in with it). */
  prepAge = 0;
  /** The wave just cleared and its bonus, for the wave clear animation. */
  clearedWave = 0;
  clearBonus = 0;
  /** White flash over the road (the sprint launch). */
  flash = 0;
  queue: FoxKind[] = [];
  spawnT = 0;
  waveTotal = 1;
  waveKilled = 0;
  shake = 0;
  /** Camera punch (px): a directional jolt on top of the random shake, from big guns and slams. It settles fast. */
  kickX = 0;
  kickY = 0;
  /**
   * Hit-stop: seconds every body and particle is held still on a big hit, and the cooldown until the next one.
   * Draw only: the fight itself keeps running underneath.
   */
  hitStop = 0;
  hitStopCd = 0;
  banner: Banner | null = null;
  boss: Unit | null = null;
  lastReward = 0;
  combo = 0;
  comboT = 0;
  comboPulse = 0;
  bestCombo = 0;
  /** Seconds of slow motion left; the game counts it down in real time. */
  slowmo = 0;
  bombCd = 0;
  bombUses = 0;
  /** Explosions this frame, for the street (trees whip, birds scatter). The street empties it. */
  blasts: { x: number; y: number; r: number }[] = [];
  /** Stars earned for the last stage cleared (carrots left), and its stats. */
  stars = 0;
  /** Gems won by the last stage clear, added to the counter when they fly into it (the game does that). */
  pendingGems = 0;
  stageKos = 0;
  stageBest = 0;
  private fwT = 0;
  private packSeq = 0;
  /** Each rabbit squad's shooters fire at the same fox (focus fire). */
  private squadFocus = new Map<number, Unit>();
  /** Seconds of this wave since a fox last went down (past STALL_T the foxes left press in), and the count it saw. */
  private quietT = 0;
  private lastDown = 0;
  /** Seconds since this wave started. */
  private waveT = 0;

  constructor(private econ: Econ) {
    this.showStageBanner();
  }

  get isBossWave() {
    return this.wave === BAL.wavesPerStage;
  }

  /** Recommended power for the current (or next) wave, and for the whole stage (its boss wave). */
  get waveRec() {
    return recommendedPower(this.stage, Math.min(this.wave, BAL.wavesPerStage));
  }

  get stageRec() {
    return recommendedPower(this.stage, BAL.wavesPerStage);
  }

  get globalWave() {
    return (this.stage - 1) * BAL.wavesPerStage + this.wave;
  }

  get progress() {
    if (this.phase === 'fight') return this.waveKilled / Math.max(1, this.waveTotal);
    if (this.phase === 'cleared' || this.phase === 'victory') return 1;
    return 0;
  }

  get over() {
    return this.phase === 'victory' || this.phase === 'defeat';
  }

  get bombReady() {
    return this.bombCd <= 0 && this.phase === 'fight';
  }

  /** 0..1 share of the trip to the next street done. */
  get travelK() {
    return this.phase === 'travel' ? travelFrac(this.phaseT) : 0;
  }

  /** How far the streets have scrolled (TRAVEL.screens screens; the last is the next street). */
  get travelOffset() {
    return this.travelK * TRAVEL.screens * W;
  }

  /** 0..1 how fast the street is scrolling right now. */
  get travelSpeed() {
    return this.phase === 'travel' ? travelVel(this.phaseT) : 0;
  }

  // ---------- army from the grid ----------

  syncRoster(list: Slot[]) {
    const keys = new Set(list.map((s) => s.key));
    for (const [key, e] of this.slots) {
      if (keys.has(key)) continue;
      for (const m of e.members) this.retire(m);
      this.slots.delete(key);
    }
    let i = 0;
    for (const s of list) {
      let e = this.slots.get(s.key);
      if (!e) {
        e = { slot: s, members: [] };
        this.slots.set(s.key, e);
      }
      const changed = slotSig(e.slot) !== slotSig(s);
      e.slot = s;
      // squad size follows war banners
      const size = BAL.squad + s.extra;
      while (e.members.length < size) e.members.push({ unit: null, respawn: 0.3 + i++ * 0.15 });
      while (e.members.length > size) this.retire(e.members.pop()!);
      if (!changed) continue;
      for (const m of e.members) {
        if (!m.unit || m.unit.dead) continue;
        this.applySlot(m.unit, s);
        m.unit.hp = m.unit.hpShown = m.unit.maxHp;
        m.unit.vz = 150;
        this.fx.burst(m.unit.x, m.unit.y - 30, COLOR.toast, 10);
      }
    }
  }

  private retire(m: Member) {
    if (m.unit && !m.unit.dead) {
      m.unit.dead = true;
      this.fx.puff(m.unit.x, m.unit.y);
    }
  }

  private applySlot(u: Unit, s: Slot) {
    const st = rabbitStats(s.weapon, s.wLevel, s.rLevel);
    const w = st.w;
    const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    if (u.weapon !== s.weapon) {
      u.spin = 0;
      u.swings = 0;
      u.dash = 0;
      u.dashCd = 1;
    }
    u.evo = w.evo;
    u.awake = !!w.evo && s.wLevel >= AWAKEN_LEVEL;
    u.weapon = s.weapon;
    u.level = s.wLevel;
    u.rLevel = s.rLevel;
    u.maxHp = st.hp * s.hpMul;
    u.hp = u.maxHp * ratio;
    u.hpShown = u.hp;
    u.dmg = st.dmg * s.dmgMul;
    u.cd = w.cd / s.rate;
    u.range = w.range * s.rangeMul;
    u.regen = s.regen;
    u.scoped = s.dmgMul > 1 && !w.melee;
    u.armor = w.armor;
    u.speed = BAL.rabbitSpeed * w.speedMul;
    u.melee = w.melee;
    u.role = roleOf(s.weapon);
    u.proj = w.proj;
    u.projSpeed = w.projSpeed;
    u.aoe = w.aoe;
    u.spread = w.spread;
    u.rallyX = (w.melee ? L.rallyMelee : w.range > 250 ? L.rallyRanged - 50 : L.rallyRanged) + rand(-30, 30);
  }

  private spawnRabbit(e: SlotEntry, m: Member) {
    const u = makeUnit('rabbit', 'rabbit', rand(-50, -20), rand(L.laneTop + 4, L.laneBottom - 4));
    u.scale = BAL.unitScale;
    u.radius = 13 * u.scale;
    u.style = rabbitStyle();
    u.slotKey = e.slot.key;
    this.applySlot(u, e.slot);
    u.hp = u.hpShown = u.maxHp;
    u.kneel = !u.melee && (u.range > 250 || Math.random() < 0.4);
    this.units.push(u);
    m.unit = u;
  }

  /** A new pack: shared id and pace, wedge places, and (if it has melee foxes) a line where it gathers before charging. */
  private formPack(pack: Unit[]) {
    const id = ++this.packSeq;
    const slow = Math.min(...pack.map((u) => u.speed));
    const melee = pack.length > 1 && pack.some((u) => u.melee && u.kind !== 'boss');
    const gatherX = rand(452, 480); // just outside the reach of rabbit rifles at the back of the formation
    for (const u of pack) {
      u.pack = id;
      u.packSpeed = slow;
      u.packMelee = melee;
      u.charged = !melee;
      u.gatherX = gatherX + (u.x - pack[0].x) * 0.5;
    }
  }

  /** A fox on its own: its own pace, no gathering, it fights as soon as it sees a rabbit. */
  private lone(u: Unit) {
    u.pack = ++this.packSeq;
    u.leader = null;
    u.packSpeed = u.speed;
    u.packMelee = false;
    u.charged = true;
  }

  private spawnFox(kind: FoxKind, leader: Unit | null = null, index = 0): Unit {
    const d = FOXES[kind];
    const w = WEAPONS[d.weapon];
    const g = this.globalWave;
    // pack members take their place in a wedge behind the leader: alternately above and below, a step further back each
    const dx = leader ? 22 * Math.ceil(index / 2) + 6 : 0;
    const dy = leader ? (index % 2 ? -1 : 1) * 26 * Math.ceil(index / 2) : 0;
    const y = kind === 'boss' ? (L.laneTop + L.laneBottom) / 2 : leader ? clamp(leader.y + dy, L.laneTop, L.laneBottom) : rand(L.laneTop + 20, L.laneBottom - 20);
    const u = makeUnit('fox', kind, leader ? leader.x + dx : W + (kind === 'boss' ? 70 : rand(18, 60)), y);
    u.leader = leader;
    u.packDx = dx;
    u.packDy = y - (leader ? leader.y : y);
    u.style = foxStyle(kind);
    u.hp = u.maxHp = u.hpShown = d.hp * BAL.foxHp * BAL.foxHpGrowth ** (g - 1);
    u.armor = d.armor;
    u.weapon = d.weapon;
    u.level = clamp(1 + Math.floor((g - 1) / 4), 1, 5);
    u.dmg = d.dmg * BAL.foxDmgGrowth ** (g - 1);
    u.cd = d.cd;
    u.range = d.range;
    u.speed = d.speed * rand(0.92, 1.08);
    u.melee = w.melee;
    u.proj = w.proj;
    u.projSpeed = w.projSpeed;
    u.aoe = w.aoe;
    u.spread = kind === 'boss' ? 16 : w.spread;
    u.scale = d.scale * BAL.unitScale;
    u.radius = 13 * u.scale;
    u.reward = d.reward;
    u.leak = d.leak;
    this.units.push(u);
    if (kind === 'boss') {
      this.boss = u;
      this.shake = 6;
      sfx.play('boss');
    }
    return u;
  }

  // ---------- waves ----------

  private showStageBanner() {
    this.banner = { text: `STAGE ${this.stage}`, sub: STREETS[streetOf(this.stage)], t: 0, color: COLOR.white, rec: this.stageRec };
  }

  /** The START button (or the prep countdown). Returns false when it is not prep time. */
  startWave(): boolean {
    if (this.phase !== 'prep') return false;
    this.banner = { text: this.isBossWave ? 'BOSS WAVE' : `WAVE ${this.wave}`, sub: 'FIGHT!', t: 0, color: this.isBossWave ? COLOR.bannerBoss : COLOR.white };
    this.spawnQueue();
    return true;
  }

  private spawnQueue() {
    const g = this.globalWave;
    const count = waveFoxCount(this.stage, this.wave);
    const pool = (Object.keys(FOXES) as FoxKind[]).filter((k) => FOXES[k].minWave <= g);
    const total = pool.reduce((a, k) => a + FOXES[k].weight, 0);
    this.queue = [];
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total;
      let chosen = pool[pool.length - 1];
      for (const k of pool) {
        r -= FOXES[k].weight;
        if (r <= 0) {
          chosen = k;
          break;
        }
      }
      this.queue.push(chosen);
    }
    if (this.isBossWave) this.queue.splice(Math.floor(count / 3), 0, 'boss');
    this.waveTotal = this.queue.length;
    this.waveKilled = 0;
    this.lastDown = 0;
    this.quietT = 0;
    this.waveT = 0;
    this.spawnT = 0.2;
    this.phase = 'fight';
    sfx.play('wave');
  }

  private waveCleared() {
    const bonus = 2 + Math.floor(this.wave / 2);
    this.econ.cash += bonus;
    // the squads run on a little: kilometres, the first time this wave of this stage is cleared
    this.clearKm = this.wave > this.kmWave ? BAL.kmPerWave : 0;
    this.km += this.clearKm;
    this.kmWave = Math.max(this.kmWave, this.wave);
    for (const u of this.units) if (u.side === 'rabbit') u.cheer = rand(0.9, 1.3);
    this.fx.confetti(W / 2, L.roadTop + 20);
    if (this.wave >= BAL.wavesPerStage) {
      // stage clear: stars for the carrots kept, gems, then a fireworks party (the game shows the stamp and the reward panel)
      const kept = this.baseHp / this.baseMax;
      this.stars = kept >= 0.8 ? 3 : kept >= 0.4 ? 2 : 1;
      const gems = 3 + this.stage + this.stars;
      this.pendingGems += gems;
      this.lastReward = gems;
      this.phase = 'victory';
      this.projs = this.projs.filter((p) => p.side === 'rabbit'); // fox shots still in the air cannot hurt the party
      this.phaseT = 0;
      this.fwT = 0;
      this.banner = null;
      this.slowmo = 0;
      this.shake = 8;
      this.fx.confetti(W * 0.25, L.roadTop + 10, 50);
      this.fx.confetti(W * 0.75, L.roadTop + 10, 50);
      sfx.play('stageClear');
      return;
    }
    // wave clear: the game draws the ribbon animation; then prep time for the next wave
    sfx.play('clear');
    this.banner = null;
    this.clearedWave = this.wave;
    this.clearBonus = bonus;
    this.phase = 'cleared';
    this.phaseT = 0;
    this.fx.confetti(30, L.roadBottom - 10, 40);
    this.fx.confetti(W - 30, L.roadBottom - 10, 40);
  }

  /** keepRabbits: the squads that just ran here stay on the road (healed); everyone else respawns. */
  private resetField(keepRabbits = false) {
    const keep = new Set(keepRabbits ? this.units.filter((u) => u.side === 'rabbit' && !u.dead) : []);
    this.units = [...keep];
    for (const u of keep) {
      u.hp = u.hpShown = u.maxHp;
      u.sprint = 0;
      u.target = null;
      u.kx = 0;
      u.laneY = u.y;
    }
    this.projs = [];
    this.boss = null;
    let i = 0;
    for (const e of this.slots.values()) {
      for (const m of e.members) {
        if (m.unit && keep.has(m.unit)) continue;
        m.unit = null;
        m.respawn = 0.3 + i++ * 0.1;
      }
    }
    this.stageKos = 0;
    this.stageBest = 0;
    this.baseHp = this.baseShown = this.baseMax;
    this.wave = 1;
    this.phase = 'prep';
    this.phaseT = 0;
    this.prepAge = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bombCd = 0;
    this.showStageBanner();
  }

  retry() {
    this.resetField();
  }

  nextStage() {
    this.stage++;
    this.kmWave = 0;
    this.resetField();
  }

  /** "NEXT STREET": the squads crouch, blast off, and the streets fly past at hyperspeed until they skid to a stop on the next one. */
  startTravel() {
    if (this.phase !== 'victory') return;
    this.phase = 'travel';
    this.phaseT = 0;
    this.travelFromKm = this.km;
    this.projs = [];
    this.banner = null;
    this.fx.list = this.fx.list.filter((p) => p.layer !== 0); // scorch marks would stay put while the road scrolls
    for (const e of this.slots.values()) {
      for (const m of e.members) if (!m.unit || m.unit.dead) this.spawnRabbit(e, m); // the whole army runs
    }
    for (const u of this.units) {
      u.laneY = clamp(u.y, L.laneTop + 10, L.laneBottom - 10);
      u.target = null;
    }
    sfx.play('charge');
  }

  private updateTravel(dt: number) {
    const prev = this.phaseT;
    this.phaseT += dt;
    const T = this.phaseT;
    const at = (x: number) => prev < x && T >= x;
    const fast = this.travelSpeed;
    const rabbits = this.units.filter((u) => u.side === 'rabbit' && !u.dead);
    if (at(TRAVEL.launch)) {
      // blast off: a flash, a shock ring and a dust explosion under every rabbit
      this.flash = 1;
      this.shake = 14;
      for (const u of rabbits) {
        this.fx.shock(u.x, u.y - 12, 80, '#ffffff');
        this.fx.puff(u.x - 14, u.y, 1.4);
        for (let i = 0; i < 6; i++) this.fx.add({ kind: 'dust', x: u.x - 8, y: u.y - 2, vx: -rand(200, 600), vy: -rand(10, 90), life: 0.6, size: rand(6, 11), layer: 0 });
      }
      sfx.play('boom');
      sfx.play('run');
    }
    if (at(TRAVEL.brake)) sfx.play('skid');
    if (at(TRAVEL.stop)) {
      this.shake = 7;
      for (const u of rabbits) {
        this.fx.puff(u.x + 10, u.y, 1.2);
        u.vz = rand(140, 200);
      }
      sfx.play('land');
    }
    for (const u of rabbits) {
      u.face = 1;
      u.target = null;
      u.aim = 0;
      u.atk = 0;
      const line = u.melee ? W - 60 : RANGED_LINE;
      let goal = u.rallyX;
      if (T < TRAVEL.launch) {
        // crouch: legs spinning up in place, leaning back a little
        u.sprint = 0.6;
        u.moving = true;
        u.walk += dt * 40 * (T / TRAVEL.launch);
        goal = u.rallyX - 16;
        if (Math.random() < dt * 14) this.fx.dust(u.x - 8 * u.scale, u.y);
      } else if (T < TRAVEL.brake) {
        // hyperspeed: legs are a wheel, the body bobs, dust and wind rip off behind
        u.sprint = 1;
        u.moving = true;
        u.walk += dt * 60;
        goal = Math.min(u.rallyX + 70, line);
        u.z = Math.abs(Math.sin(T * 26 + u.id)) * 3;
        if (Math.random() < dt * 30 * fast) this.fx.add({ kind: 'dust', x: u.x - 10, y: u.y - 2, vx: -rand(600, 1000), vy: -rand(0, 40), life: 0.35, size: rand(4, 8), layer: 0 });
        if (Math.random() < dt * 18 * fast) {
          this.fx.add({ kind: 'spark', x: u.x - 18 * u.scale, y: u.y - rand(8, 50) * u.scale, vx: -rand(900, 1500), vy: 0, life: 0.16, size: 1.8, color: 'rgba(255,255,255,0.9)' });
        }
      } else if (T < TRAVEL.stop) {
        // skid: leaning back, heels down, sparks and long dust trails
        u.sprint = -1;
        u.moving = false;
        u.z = 0;
        goal = Math.min(u.rallyX + 110, line);
        if (Math.random() < dt * 40) this.fx.add({ kind: 'spark', x: u.x + 6, y: u.y - 1, vx: -rand(150, 400), vy: -rand(40, 160), grav: 600, life: 0.3, size: 2, color: '#ffd36b' });
        if (Math.random() < dt * 30) this.fx.add({ kind: 'dust', x: u.x + 4, y: u.y - 2, vx: -rand(150, 350), vy: -rand(5, 40), life: 0.5, size: rand(5, 9), layer: 0 });
      } else {
        u.sprint = 0;
        u.moving = Math.abs(u.x - u.rallyX) > 4;
        u.walk += dt * 11;
      }
      u.x += (Math.min(goal, line) - u.x) * Math.min(1, dt * (T < TRAVEL.brake ? 6 : 3));
      u.y += (u.laneY - u.y) * Math.min(1, dt * 2);
      if ((T < TRAVEL.launch || T >= TRAVEL.stop) && (u.z > 0 || u.vz > 0)) {
        u.vz -= 900 * dt;
        u.z = Math.max(0, u.z + u.vz * dt);
        if (u.z === 0) u.vz = 0;
      }
    }
    this.units = this.units.filter((u) => !u.dead);
    this.km = this.travelFromKm + TRAVEL.km * this.travelK;
    if (T >= TRAVEL.dur) {
      this.km = this.travelFromKm + TRAVEL.km;
      this.kmWave = 0;
      this.stage++;
      this.resetField(true);
      for (const u of this.units) u.cheer = rand(0.4, 0.8);
    }
  }

  /** Stage clear party: rabbits jump for joy under fireworks. */
  private updateVictory(dt: number) {
    this.phaseT += dt;
    this.fwT -= dt;
    if (this.fwT <= 0) {
      this.fwT = this.phaseT < 2.4 ? rand(0.14, 0.26) : rand(0.5, 0.9);
      const fwx = rand(40, W - 40);
      this.fx.firework(fwx, L.roadTop + rand(-10, 40), pick(FIREWORK_COLORS));
      sfx.play('launch', 0, { x: fwx });
    }
    this.formation();
    for (const u of this.units) {
      if (u.dead || u.side !== 'rabbit') continue;
      if (u.z === 0 && Math.random() < dt * 2.2) u.vz = rand(150, 250);
      this.updateUnit(u, dt);
    }
    this.separate(dt);
    for (const p of this.projs) this.updateProj(p, dt);
    this.projs = this.projs.filter((p) => !p.dead);
    this.units = this.units.filter((u) => !u.dead); // squads retired from the grid leave
  }

  // ---------- carrot airstrike ----------

  /** Tap on the road: a giant carrot falls there and explodes. Returns false while recharging. */
  dropBomb(x: number, y: number): boolean {
    if (!this.bombReady) return false;
    const ty = clamp(y, L.laneTop, L.laneBottom);
    this.bombCd = BAL.bombCooldown;
    this.bombUses++;
    const dmg = BAL.bombDmg * BAL.foxHp * BAL.foxHpGrowth ** (this.globalWave - 1);
    this.projs.push({
      kind: 'bomb',
      side: 'rabbit',
      x,
      y: ty - 380,
      sx: x,
      sy: ty - 380,
      tx: x,
      ty,
      target: null,
      speed: 0,
      dmg,
      aoe: BAL.bombAoe,
      level: 5,
      offset: 0,
      t: 0,
      dur: 0.5,
      angle: 0,
      dead: false,
      trailT: 0,
      crit: false,
    });
    sfx.play('bomb', 0, { x });
    return true;
  }

  // ---------- simulation ----------

  update(dt: number) {
    if (this.hitStop > 0) {
      // a hit-stop: every particle hangs in the air and every body is held where it stood, for a few hundredths
      // of a second. Only the drawing stops (the fight runs on underneath and the bodies catch up after), so it
      // never changes how a battle goes.
      this.hitStop = Math.max(0, this.hitStop - dt);
      for (const u of this.units) freezeOn(u, this.hitStop, u.x);
    } else this.fx.update(dt);
    fxHostStep(this, dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2.2) this.banner = null;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.leakFlash = Math.max(0, this.leakFlash - dt);
    this.baseShown = Math.max(this.baseHp, this.baseShown - this.baseMax * dt * 0.5);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 5);
    const wasCd = this.bombCd;
    this.bombCd = Math.max(0, this.bombCd - dt);
    if (wasCd > 0 && this.bombCd <= 0 && this.phase === 'fight') sfx.play('bombReady');
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.rallyT = Math.max(0, this.rallyT - dt);
    for (const sm of this.smokes) sm.t += dt;
    this.smokes = this.smokes.filter((sm) => sm.t < sm.life && this.phase === 'fight');
    if (this.phase === 'victory') return this.updateVictory(dt);
    if (this.phase === 'travel') return this.updateTravel(dt);
    if (this.over) return;

    const calm = this.phase === 'prep' || this.phase === 'cleared';
    if (this.phase === 'cleared') {
      if (this.banner) this.banner.t = 0; // an evolution banner waits for the WAVE CLEAR ribbon
      this.phaseT += dt;
      if (this.phaseT >= CLEAR_DUR) {
        this.wave++;
        this.phase = 'prep';
        this.phaseT = 0;
        this.prepAge = 0;
      }
    } else if (this.phase === 'prep') {
      // no countdown: the next wave waits until the player taps START
      this.prepAge += dt;
    } else if (this.phase === 'fight') {
      // the stall clock: time since a fox last went down (knocked out or got away with carrots)
      this.waveT += dt;
      if (this.waveKilled !== this.lastDown) {
        this.lastDown = this.waveKilled;
        this.quietT = 0;
      } else this.quietT += dt;
      if (this.queue.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          let group = 1;
          if (Math.random() < 0.25 + this.wave * 0.04) group++;
          if (Math.random() < this.wave * 0.03) group++;
          // foxes arrive in packs that march in a wedge behind a leader
          const pack: Unit[] = [];
          for (let i = 0; i < group && this.queue.length; i++) {
            const kind = this.queue.shift()!;
            if (LONERS.has(kind)) this.lone(this.spawnFox(kind));
            else pack.push(this.spawnFox(kind, pack[0] ?? null, pack.length));
          }
          if (pack.length) this.formPack(pack);
          this.spawnT = Math.max(0.5, 1.35 - this.wave * 0.07) * rand(0.7, 1.3);
        }
      } else if (!this.units.some((u) => u.side === 'fox' && !u.dead)) {
        this.waveCleared();
      }
    }

    for (const e of this.slots.values()) {
      for (const m of e.members) {
        if (m.unit && !m.unit.dead) continue;
        m.respawn -= dt * (calm ? 4 : 1); // between waves the squads fill up quickly
        if (m.respawn <= 0) {
          this.spawnRabbit(e, m);
          m.respawn = BAL.respawn;
        }
      }
    }

    this.formation();
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    this.separate(dt);
    for (const u of this.units) if (!u.dead && u.side === 'fox' && u.x < L.exitX) this.leak(u);
    for (const p of this.projs) this.updateProj(p, dt);
    this.projs = this.projs.filter((p) => !p.dead);
    this.units = this.units.filter((u) => !u.dead);
    if (this.boss?.dead) this.boss = null;
  }

  // ---------- tactics ----------

  /**
   * The rabbits' formation: every role has its own ranks (shields in front, knives behind them, pistols and SMGs
   * in the middle, rifles and rockets at the back). A big group stands in two or three staggered ranks, each rank
   * bowing forward a little in the middle, and every rabbit keeps a small personal offset, so it looks like a
   * squad and not a ruled line. Every squad member keeps its own spot, even while it waits to respawn, so nobody
   * shuffles round when a rabbit falls.
   */
  private formation() {
    const byRole = new Map<Role, (Unit | null)[]>();
    for (const key of [...this.slots.keys()].sort((a, b) => a - b)) {
      const e = this.slots.get(key)!;
      const role = roleOf(e.slot.weapon);
      let list = byRole.get(role);
      if (!list) byRole.set(role, (list = []));
      for (const m of e.members) list.push(m.unit && !m.unit.dead ? m.unit : null);
    }
    const top = L.laneTop + 16;
    const span = L.laneBottom - L.laneTop - 32;
    for (const [role, list] of byRole) {
      const n = list.length;
      const ranks = role === 'tank' ? Math.min(2, Math.ceil(n / 5)) : n <= 3 ? 1 : n <= 8 ? 2 : 3;
      const per = Math.ceil(n / ranks);
      const gap = span / per;
      list.forEach((u, i) => {
        if (!u) return;
        const rank = i % ranks;
        const idx = Math.floor(i / ranks);
        const t = per > 1 ? idx / (per - 1) : 0.5;
        const bow = 10 * (1 - (2 * t - 1) ** 2);
        const stagger = ranks > 1 ? (rank % 2 ? gap * 0.25 : -gap * 0.25) : 0;
        u.homeY = clamp(top + gap * (idx + 0.5) + stagger + u.jitterY, L.laneTop + 6, L.laneBottom - 6);
        // a shooter that stepped up to answer foxes just out of its reach stands that much further forward
        const x = FORMATION_X[role] - rank * RANK_GAP[role] + bow + u.jitter;
        u.homeX = u.melee ? Math.min(W, x) : Math.min(RANGED_LINE, x + u.fwd);
      });
    }
  }

  private emote(u: Unit, e: Emote) {
    u.emote = e;
    u.emoteT = 1.1;
  }

  /** In weapon reach of o (k = 1: right now; more: nearly). */
  private inRange(u: Unit, o: Unit, k = 1) {
    const dy = o.y - u.y;
    return Math.hypot(o.x - u.x, u.melee ? dy : dy * 0.5) <= (u.range + o.radius) * k;
  }

  /** How far past its formation spot a melee rabbit will go after a fox. */
  private leash(u: Unit) {
    return u.role === 'flank' ? 260 : 150;
  }

  /**
   * How far up the road a melee rabbit really goes after a fox: its leash (shorter while it regroups), and never
   * out into the killing zone between the lines. Target picks, giving up a chase and answerable() all use this.
   */
  private meleeReachX(u: Unit) {
    // during the boss's war cry the melee rabbits hold the line in front of the shooters
    const k = Math.min(u.calmT > 0 ? 0.4 : 1, this.rallyT > 0 ? 0.6 : 1);
    return Math.min(MELEE_REACH_CAP, u.homeX + this.leash(u) * k);
  }

  /**
   * Whether some rabbit can hit back at a fox gunman standing here. While the army has a shooter on the road only
   * the shooters count (from where they stand), so a gunman never plants out of their reach to pick off the knives
   * that come for it; with no shooter, a melee rabbit counts where it would really go, or when it is already coming.
   */
  private answerable(f: Unit) {
    let shooters = false;
    for (const r of this.units) {
      if (r.dead || r.side !== 'rabbit' || r.melee) continue;
      shooters = true;
      if (this.inRange(r, f, 0.95)) return true;
    }
    if (shooters) return false;
    for (const r of this.units) {
      if (r.dead || r.side !== 'rabbit' || r.state === 'retreat') continue;
      if (r.target === f) return true;
      if (r.calmT <= 0 && f.x <= this.meleeReachX(r) - 12 && Math.abs(f.y - r.homeY) <= 150) return true;
    }
    return false;
  }

  /** Damage the rabbits' bullets already in the air will do to fox o (blasts not counted). */
  private incoming(o: Unit) {
    let n = 0;
    for (const p of this.projs) if (!p.dead && p.side === 'rabbit' && p.target === o && !p.aoe) n += p.dmg * (1 - o.armor);
    return n;
  }

  /** Whether fox o is hitting a rabbit right now (its target is in its reach). */
  private hitting(o: Unit) {
    const t = o.target;
    return !!t && t.side === 'rabbit' && !t.dead && this.inRange(o, t);
  }

  /** The rabbit shooter a melee fox is carving up (within wx by wy of it), or null. */
  private brawlerOn(o: Unit, wx = 70, wy = 45): Unit | null {
    if (!o.melee || o.side !== 'fox') return null;
    for (const r of this.units) if (!r.dead && r.side === 'rabbit' && !r.melee && Math.abs(r.x - o.x) < wx && Math.abs(r.y - o.y) < wy) return r;
    return null;
  }

  /** How many melee rabbits other than `except` are going for fox o. */
  private meleeOn(o: Unit, except: Unit) {
    let n = 0;
    for (const r of this.units) if (!r.dead && r.side === 'rabbit' && r.melee && r !== except && r.target === o) n++;
    return n;
  }

  /** The other living soldier of u's squad (knives hunt in pairs). */
  private partnerOf(u: Unit): Unit | null {
    const e = this.slots.get(u.slotKey);
    if (!e) return null;
    for (const m of e.members) if (m.unit && m.unit !== u && !m.unit.dead) return m.unit;
    return null;
  }

  /**
   * How urgent fox o is for rabbit shooter u: about to grab carrots, inside our lines, a runner, hitting one of us
   * right now (the harder it hits the more), carving up a shooter or u itself, nearly down, in reach. Blasts go
   * where foxes are bunched or into smoke (they ignore its dodge); bullets avoid smoke and a fox the shots already
   * in the air will finish.
   */
  private threat(u: Unit, o: Unit) {
    let s = (W - o.x) * 0.6;
    if (o.x < RANGED_LINE) s += (RANGED_LINE - o.x) * 0.5;
    if (o.x < 150) s += 80;
    if (o.kind === 'runner') s += o.x < 330 ? 220 : 140;
    if (o.kind === 'boss') s += 40;
    if (this.hitting(o)) s += 60 * clamp(foxDps(o) / THUG_DPS, 0.6, 2.2);
    if (o.melee && this.brawlerOn(o)) s += 120;
    if (o.melee && Math.hypot(o.x - u.x, o.y - u.y) < 70) s += 200;
    s += 90 * (1 - o.hp / o.maxHp);
    if (this.inRange(u, o)) s += 100;
    const smoked = this.inSmoke(o);
    if (u.aoe > 0) {
      let n = 0;
      for (const q of this.units) if (q !== o && !q.dead && q.side === 'fox' && Math.hypot(q.x - o.x, q.y - o.y) < u.aoe) n++;
      s += 50 * Math.min(3, n) + (smoked ? 70 : 0);
    } else if (smoked) s -= 150;
    if (!u.aoe && this.incoming(o) >= o.hp) s -= 260;
    return s;
  }

  /**
   * How much melee rabbit u wants fox o (null: not a candidate). Bodyguards peel back for a fox carving up a
   * shooter, cut off runners and jump on anything that got past them, even off the leash. Otherwise they stay
   * within their real reach, leave a melee pack alone until it charges, hunt gunmen only out of a crossfire,
   * go in pairs and never dive alone into a pack or dog-pile one fox.
   */
  private meleeScore(u: Unit, o: Unit, partner: Unit | null): number | null {
    // the fox it is already guarding against stays 'guarded' in a wider box, so it does not flicker on and off
    const guarded = !!(o === u.target ? this.brawlerOn(o, 100, 60) : this.brawlerOn(o));
    const runner = o.kind === 'runner' && o.x < u.homeX + 200;
    const behind = o.x < u.homeX + 10;
    const special = guarded || runner || behind;
    if (!special) {
      if (o.x > this.meleeReachX(u) || Math.abs(o.y - u.homeY) > 150) return null;
      // poking a pack that is still gathering up the road only makes the whole pack charge
      if ((o.state === 'gather' || o.state === 'advance') && o.packMelee && !o.charged && o.x > u.homeX + 90) return null;
    }
    let score = -Math.hypot(o.x - u.x, (o.y - u.y) * 1.3);
    if (u.role === 'flank' && !o.melee) {
      let guns = 0;
      for (const f of this.units) if (f !== o && !f.dead && f.side === 'fox' && !f.melee && Math.abs(f.x - o.x) < 150 && Math.abs(f.y - o.y) < 150) guns++;
      score += guns > 1 ? 40 : 120;
    } else score += (W - o.x) * 0.3;
    if (guarded) score += 320;
    if (runner) score += 220;
    if (o.x < 120) score += 150;
    if (behind) score += 140 + (o.kind === 'brute' ? 60 : 0);
    score -= 90 * Math.max(0, this.meleeOn(o, u) - (partner && partner.target === o ? 1 : 0) - 1);
    if (partner) {
      if (partner.target === o) score += 80;
      else if (!special) {
        let pack = 0;
        for (const f of this.units) if (f !== o && !f.dead && f.side === 'fox' && Math.abs(f.x - o.x) < 70 && Math.abs(f.y - o.y) < 50) pack++;
        score -= 55 * pack;
      }
    }
    return score;
  }

  /**
   * Rabbit target. Shooters rank every fox in reach by threat() and focus fire with their squad, keeping the
   * squad's fox unless another is clearly more urgent (no flicking between two) or the shots in the air will
   * finish it anyway. Melee rabbits take the best meleeScore() and stick with a fox once they go for it.
   */
  private pickRabbitTarget(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestScore = -Infinity;
    if (!u.melee) {
      const focus = this.squadFocus.get(u.slotKey);
      const keep = !!focus && !focus.dead && this.inRange(u, focus) && (u.aoe > 0 || this.incoming(focus) < focus.hp);
      let focusScore = -Infinity;
      for (const o of this.units) {
        if (o.dead || o.side === 'rabbit' || o.x > W - 8 || o.x < L.exitX || !this.inRange(u, o, 1.15)) continue;
        const s = this.threat(u, o);
        if (o === focus) focusScore = s;
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      if (keep && focusScore + 70 >= bestScore) best = focus;
      if (best) this.squadFocus.set(u.slotKey, best);
      return best;
    }
    const partner = u.role === 'flank' ? this.partnerOf(u) : null;
    const cur = u.target && !u.target.dead ? u.target : null;
    let curScore = -Infinity;
    for (const o of this.units) {
      if (o.dead || o.side === 'rabbit' || o.x > W - 8 || o.x < L.exitX) continue;
      const s = this.meleeScore(u, o, partner);
      if (s === null) continue;
      if (o === cur) curScore = s;
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    // commit: no turning round mid-dash for a slightly better fox; for a moment after picking one it takes a much
    // better one (a brawler on a shooter, a runner) to switch
    if (cur && curScore > -Infinity && curScore + (u.commitT > 0 ? 160 : 70) >= bestScore) best = cur;
    if (best && best !== cur) u.commitT = 0.8;
    return best;
  }

  private rabbitBrain(u: Unit, dt: number): Brain {
    // tol: a rabbit on its spot only walks back when pushed well off it (no shuffling on the spot)
    const b: Brain = { gx: u.homeX, gy: u.homeY, attack: false, move: false, aim: 0, speed: 1, face: 0, tol: 14 };
    u.retreatCd -= dt;
    u.calmT -= dt;
    u.evadeT -= dt;
    u.kiteT -= dt;
    u.commitT -= dt;
    const fight = this.phase === 'fight';
    if (!u.melee) this.stepUp(u, fight, dt);
    // badly hurt: fall back behind the line and catch a breath (shooters keep firing as they go); a little earlier
    // during the boss's war cry; shields never leave the line
    const hurt = this.rallyT > 0 ? 0.35 : 0.25;
    if (u.state !== 'retreat' && fight && u.hp < u.maxHp * hurt && u.retreatCd <= 0 && u.role !== 'tank') {
      u.state = 'retreat';
      u.stateT = 2;
      u.retreatCd = 9;
      this.emote(u, 'sweat');
    }
    const retreating = u.state === 'retreat';
    if (retreating) {
      u.stateT -= dt;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.06 * dt);
      if (u.stateT <= 0) u.state = 'hold';
      b.gx = Math.max(20, u.homeX - 80);
      b.speed = 1.2;
      b.tol = 3;
      if (u.melee) {
        u.target = null;
        b.face = -1;
        const ev = fight ? this.evade(u) : null;
        if (ev) Object.assign(b, ev);
        return b;
      }
    }
    u.retarget -= dt;
    const t0 = u.target;
    // a bodyguard going for a fox on a shooter, a runner or a fox that got past it never gives up at the leash
    const special = !!t0 && (!!this.brawlerOn(t0) || t0.kind === 'runner' || t0.x < u.homeX + 10);
    const offLeash = !!t0 && u.melee && !special && t0.x > this.meleeReachX(u) + 60;
    if (offLeash) u.calmT = 1.2; // it got away: regroup before chasing again (no back and forth at the leash)
    if (u.retarget > 0.05 && !retreating) {
      // look again right now: the shots in the air will finish this fox, or a runner is coming into reach
      if (!u.melee && t0 && !t0.dead && !u.aoe && this.incoming(t0) >= t0.hp) u.retarget = 0;
      else if (!(t0 && t0.kind === 'runner')) {
        for (const o of this.units) {
          if (o.dead || o.side !== 'fox' || o.kind !== 'runner' || o.x > 330 || o.x < L.exitX) continue;
          if (u.melee ? Math.hypot(o.x - u.x, o.y - u.y) < 140 : this.inRange(u, o, 1.1)) {
            u.retarget = 0;
            break;
          }
        }
      }
    }
    if (u.retarget <= 0 || !t0 || t0.dead || offLeash) {
      u.target = this.pickRabbitTarget(u);
      u.retarget = u.melee ? 0.25 + Math.random() * 0.1 : 0.35 + Math.random() * 0.2;
      // '!' when it spots a fox, or when a bodyguard turns round for a fox on one of the shooters
      if (u.target && u.target !== t0 && (!t0 || (u.melee && this.brawlerOn(u.target))) && frand(0, 1) < 0.3) this.emote(u, '!');
    }
    const evade = fight ? this.evade(u) : null;
    const t = u.target;
    // reinforcements jog in from the left edge to their spot
    const jog = !retreating && u.x < u.homeX - 40 && (!t || !this.inRange(u, t)) ? 1.6 : 1;
    if (!t) {
      if (!retreating) {
        u.state = 'hold';
        b.speed = jog;
      }
      if (evade) return Object.assign(b, evade);
      this.idle(u, b, dt);
      return b;
    }
    if (!retreating) u.state = 'engage';
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = u.melee ? Math.hypot(dx, dy) : Math.hypot(dx, dy * 0.5);
    const reach = u.range + t.radius;
    if (d <= reach + 40) b.aim = 1;
    if (u.melee) {
      // no swings while diving out of a blast or a bull rush
      if (d <= reach && !evade) b.attack = true;
      else {
        b.gx = t.x;
        b.gy = t.y;
        b.tol = 3;
        // cut a runner off where it is going instead of chasing its tail
        if (t.kind === 'runner' && t.x > u.x - 20) b.gx = t.x - 40;
        if (u.role === 'flank') {
          // knives swing round the side to get at the gunmen: the further off, the wider the curve (no zig-zag)
          const k = clamp((Math.abs(dx) - 30) / 90, 0, 1);
          b.gy = clamp(t.y + u.flankSide * 38 * k, L.laneTop, L.laneBottom);
          b.speed = 1.15;
        }
      }
      if (evade) Object.assign(b, evade);
      return b;
    }
    if (!retreating) b.speed = jog;
    if (d <= reach) {
      // shooters fire from their place in the formation, and only walk back onto it when pushed well off it
      b.attack = true;
      b.move = retreating || !u.parked;
      // the shots already in the air will finish it: hold fire and pick the next fox at once
      if (!u.aoe && this.incoming(t) >= t.hp) {
        b.attack = false;
        u.retarget = 0;
      }
    }
    if (!retreating) this.kite(u, b);
    // stepping out of a blast or a rush row, still shooting
    if (evade) {
      Object.assign(b, evade);
      b.move = true;
    }
    return b;
  }

  /**
   * Shooters step forward (never past RANGED_LINE) while foxes hit squadmates from just beyond their reach, hold
   * there while they are firing, and drift back to their spot once it is quiet. formation() adds u.fwd to the spot.
   */
  private stepUp(u: Unit, fight: boolean, dt: number) {
    if (!fight) {
      u.fwd = 0;
      return;
    }
    const t = u.target;
    const engaged = !!t && !t.dead && this.inRange(u, t);
    let want = false;
    if (!engaged && u.state !== 'retreat') {
      for (const o of this.units) {
        if (!o.dead && o.side === 'fox' && o.x < W - 8 && o.x - u.x < u.range + 140 && this.hitting(o)) {
          want = true;
          break;
        }
      }
    }
    const base = u.homeX - u.fwd;
    u.fwd = clamp(u.fwd + (want ? 55 : engaged ? 0 : -30) * dt, 0, Math.max(0, RANGED_LINE - base));
  }

  /** A pistol or SMG rabbit with a brawler on top of it hops back and sideways while it keeps shooting. */
  private kite(u: Unit, b: Brain) {
    let mf: Unit | null = null;
    let md = 58;
    for (const f of this.units) {
      if (f.dead || f.side !== 'fox' || !f.melee || f.stun > 0) continue;
      const fd = Math.hypot(f.x - u.x, f.y - u.y);
      if (fd < md && (f.target === u || fd < 40)) {
        md = fd;
        mf = f;
      }
    }
    if (mf && u.kiteT <= 0) {
      u.kiteT = 0.4;
      u.kiteX = clamp(u.x - 30, 50, RANGED_LINE);
      u.kiteY = clamp(u.y + (u.y >= mf.y ? 36 : -36), L.laneTop, L.laneBottom);
    }
    if (u.kiteT > 0) {
      b.gx = u.kiteX;
      b.gy = u.kiteY;
      b.speed = 1.15;
      b.tol = 3;
      b.move = true;
    }
  }

  /**
   * Where rabbit u should step right now: out of the blast circle of a fox rocket about to land (the rabbit a homing
   * rocket is locked on stays put: it cannot outrun it), or out of the row a brute is winding up or rushing down
   * (shields hold and block it). It commits to the step for a moment, so it does not jitter.
   */
  private evade(u: Unit): Pick<Brain, 'gx' | 'gy' | 'speed' | 'tol' | 'move'> | null {
    if (u.evadeT > 0) return { gx: u.evadeX, gy: u.evadeY, speed: u.evadeS, tol: 2, move: true };
    let goal: { gx: number; gy: number; speed: number; tol: number; move: boolean } | null = null;
    for (const p of this.projs) {
      if (p.side !== 'fox' || !p.aoe || p.dead) continue;
      const homing = p.kind === 'rocket' && !!p.target && !p.target.dead;
      const ix = homing ? p.target!.x : p.tx;
      const iy = homing ? p.target!.y : p.ty;
      const left = p.kind === 'grenade' ? (1 - p.t) * p.dur : Math.hypot(p.tx - p.x, p.ty - p.y) / Math.max(1, p.speed);
      if (left > 0.75) continue;
      const r = p.aoe + u.radius + 12;
      const ex = u.x - ix;
      const ey = (u.y - iy) * 1.2;
      const ed = Math.hypot(ex, ey);
      if (ed >= r || (homing && p.target === u)) continue;
      const nx = ed > 1 ? ex / ed : 0;
      const ny = ed > 1 ? ey / ed : u.y > (L.laneTop + L.laneBottom) / 2 ? -1 : 1;
      goal = { gx: clamp(ix + nx * r, -20, u.melee ? W - 22 : RANGED_LINE), gy: clamp(iy + (ny * r) / 1.2, L.laneTop, L.laneBottom), speed: 1.9, tol: 2, move: true };
      break;
    }
    if (!goal) {
      for (const f of this.units) {
        if (f.dead || f.side !== 'fox' || !(f.dash > 0 || f.windT > 0)) continue;
        const ahead = f.x - u.x;
        if (ahead < 20 || ahead > 260 || Math.abs(u.y - f.dashY) > RAM_ROW + 6) continue;
        if (u.armor >= 0.3) return null; // a shield braces and blocks it
        const dir = u.y >= f.dashY ? 1 : -1;
        let gy = clamp(f.dashY + dir * (RAM_ROW + 16), L.laneTop, L.laneBottom);
        if (Math.abs(gy - u.y) < 4 || Math.abs(gy - f.dashY) < RAM_ROW) gy = clamp(f.dashY - dir * (RAM_ROW + 16), L.laneTop, L.laneBottom);
        goal = { gx: u.x, gy, speed: 2.2, tol: 2, move: true };
        break;
      }
    }
    if (goal) {
      u.evadeT = 0.3;
      u.evadeX = goal.gx;
      u.evadeY = goal.gy;
      u.evadeS = goal.speed;
    }
    return goal;
  }

  /**
   * A rabbit with nothing to shoot. While foxes are on the road it faces them with its weapon half up and only
   * checks it now and then (no hops, never a look over its shoulder at a pack massing up the road). Otherwise,
   * now and then a little hop, a look over its shoulder, a check of its weapon.
   */
  private idle(u: Unit, b: Brain, dt: number) {
    u.fidget -= dt;
    u.lookT -= dt;
    u.aimT -= dt;
    if (this.phase === 'fight' && this.units.some((o) => !o.dead && o.side === 'fox' && o.x < W - 10)) {
      u.lookT = 0;
      if (u.fidget <= 0) {
        // its own rhythm (no dice: this is only for show)
        u.fidget = 3 * u.tempo;
        u.aimT = 0.7 * u.tempo;
      }
      b.face = 1;
      b.aim = u.aimT > 0 ? 0.8 : 0.4;
      return;
    }
    if (u.fidget <= 0) {
      u.fidget = rand(3, 8);
      const r = Math.random();
      if (r < 0.35 && u.z === 0 && u.parked) u.vz = rand(110, 160);
      else if (r < 0.65) u.lookT = rand(0.6, 1.2);
      else if (r < 0.85) u.aimT = rand(0.5, 0.9);
    }
    if (u.lookT > 0 && u.parked) b.face = -1;
    if (u.aimT > 0) b.aim = 0.8;
  }

  private nearestRabbit(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const o of this.units) {
      if (o.dead || o.side !== 'rabbit' || o.x < -10) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** The whole pack charges together. */
  private packCharge(pack: number) {
    let first: Unit | null = null;
    for (const o of this.units) {
      if (o.dead || o.side !== 'fox' || o.pack !== pack || o.charged) continue;
      o.charged = true;
      first ??= o;
      if (o.state === 'advance' || o.state === 'gather') o.state = 'charge';
      this.emote(o, '!');
    }
    if (first) sfx.play('yell', 0, { x: first.x });
  }

  /**
   * Fox target: thugs go for the rabbit shooters, bombers aim where rabbits are bunched up,
   * everyone else takes one of the three nearest rabbits (mostly the nearest), so fire spreads.
   */
  private pickFoxTarget(u: Unit): Unit | null {
    const near: { o: Unit; d: number }[] = [];
    for (const o of this.units) {
      if (o.dead || o.side === 'fox' || o.x > W - 8 || o.x < -10) continue;
      const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y) * (u.melee ? 1.3 : 0.6);
      if (d > Math.max(300, u.range + 60)) continue;
      near.push({ o, d });
    }
    if (!near.length) return null;
    if (u.kind === 'thug') {
      near.sort((a, b) => a.d - (a.o.melee ? 0 : 90) - (b.d - (b.o.melee ? 0 : 90)));
      return near[0].o;
    }
    if (u.kind === 'bomber') {
      let best = near[0].o;
      let bestN = -1;
      for (const { o, d } of near) {
        const n = near.filter((q) => Math.hypot(q.o.x - o.x, q.o.y - o.y) < 70).length * 100 - d * 0.2;
        if (n > bestN) {
          bestN = n;
          best = o;
        }
      }
      return best;
    }
    near.sort((a, b) => a.d - b.d);
    const r = Math.random();
    const i = u.melee || near.length === 1 ? 0 : r < 0.6 ? 0 : r < 0.85 || near.length === 2 ? 1 : 2;
    return near[Math.min(i, near.length - 1)].o;
  }

  private foxBrain(u: Unit, dt: number): Brain {
    if (u.windT > 0) {
      // a brute winding up a bull rush: feet planted, pawing the ground, locked on its row; then it goes
      u.windT -= dt;
      u.dustT -= dt;
      if (u.dustT <= 0) {
        u.dustT = 0.07;
        this.fx.dust(u.x + 8, u.y);
      }
      if (u.windT <= 0) {
        const t = u.windTarget;
        u.windTarget = null;
        if (t && !t.dead) this.startRush(u, t);
      }
      return { gx: u.x, gy: u.y, attack: false, move: false, aim: 1, speed: 1, face: -1 };
    }
    const b: Brain = { gx: L.exitX - 60, gy: u.laneY, attack: false, move: false, aim: 0, speed: 1, face: -1 };
    const sk = FOX_SKILLS[u.kind as FoxKind];
    u.blinkCd -= dt;
    u.boostCd -= dt;
    u.rushCd -= dt;
    u.smokeCd -= dt;
    u.rallyCd -= dt;
    u.backT -= dt;
    u.sideT -= dt;
    u.backBudget = Math.min(BACK_AWAY.budget, u.backBudget + (dt * BACK_AWAY.budget) / BACK_AWAY.window);
    // nothing has gone down for a long while, or the wave drags on: the foxes left stop hanging back
    const press = this.quietT > STALL_T || (this.waveT > LATE_T && !this.queue.length);
    if (press && !u.charged) this.packCharge(u.pack);
    // badly hurt: run back out of the fight for a moment (bosses and brutes never do); a shadow vanishes instead
    if (u.state !== 'retreat' && !u.retreated && u.kind !== 'boss' && u.kind !== 'brute' && u.hp < u.maxHp * 0.25 && u.target) {
      u.retreated = true;
      if (sk.blinkCd && u.kind === 'ninja') {
        this.dropSmoke(u.x, u.y, 60);
        this.blink(u, u.x + rand(120, 170), u.y + rand(-60, 60));
        u.blinkCd = sk.blinkCd;
      }
      u.state = 'retreat';
      u.stateT = 1.3;
      u.target = null;
      this.emote(u, 'sweat');
    }
    if (u.state === 'retreat') {
      u.stateT -= dt;
      if (u.stateT <= 0) u.state = 'engage';
      b.gx = Math.min(W - 25, u.x + 80);
      b.speed = 1.2;
      b.face = 1;
      return b;
    }
    if (u.state === 'advance' || u.state === 'gather') {
      // marching in the pack: a gunman starts shooting once a rabbit is in reach; any fox fights back up close;
      // a melee fox that has charged (or came alone) goes for any rabbit within sight
      const near = this.nearestRabbit(u);
      const nd = near ? Math.hypot(near.x - u.x, near.y - u.y) : Infinity;
      const go = nd < 80 || (near && !u.melee && this.inRange(u, near, 1.1)) || (u.melee && u.charged && nd < 300);
      if (go) u.state = u.charged && u.melee && u.state !== 'gather' && u.packMelee ? 'charge' : 'engage';
      else {
        const lead = u.leader && !u.leader.dead ? u.leader : u;
        if (lead !== u && (lead.state === 'advance' || lead.state === 'gather')) {
          const sx = lead.x + u.packDx;
          const sy = clamp(lead.y + u.packDy, L.laneTop, L.laneBottom);
          if (lead.state === 'gather') {
            b.gx = sx;
            b.gy = sy;
            b.aim = 1;
            return b;
          }
          // march with the leader: aim a little past the place in the wedge so it never stops and starts,
          // at the pack's pace, a bit quicker when it has fallen behind and slower when it is ahead
          b.gx = sx - 24;
          b.gy = sy;
          b.speed = clamp((u.packSpeed + (u.x - sx) * 1.6) / u.speed, 0.35, 1.35);
          return b;
        }
        // the leader sets the pace; a melee pack stops at its line and waits for everyone, then charges
        if (u.state === 'advance' && u.packMelee && !u.charged && u.x <= u.gatherX) {
          u.state = 'gather';
          u.stateT = 2;
        }
        if (u.state === 'gather') {
          // a menacing moment: weapons up, waiting for the stragglers (at least 0.8 s, at most 2 s)
          u.stateT -= dt;
          b.gx = u.x;
          b.gy = u.y;
          b.aim = 1;
          const ready = this.units.every((m) => m.dead || m.pack !== u.pack || m === u || m.state !== 'advance' || Math.hypot(m.x - (u.x + m.packDx), m.y - (u.y + m.packDy)) < 24);
          if ((ready && u.stateT <= 1.2) || u.stateT <= 0) this.packCharge(u.pack);
          return b;
        }
        b.speed = Math.min(1, u.packSpeed / u.speed);
        return b;
      }
    }
    if (u.kind === 'boss') this.bossSkills(u);
    u.retarget -= dt;
    if (u.retarget <= 0 || !u.target || u.target.dead) {
      u.target = this.pickFoxTarget(u);
      u.retarget = u.melee ? 0.3 + Math.random() * 0.1 : 0.6 + Math.random() * 0.4;
    }
    const t = u.target;
    if (u.kind === 'runner') return this.runnerBrain(u, b, t, sk);
    if (!t) {
      // nobody in the way: run for the carrots
      if (u.state === 'charge') b.speed = 1.3;
      return b;
    }
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = u.melee ? Math.hypot(dx, dy) : Math.hypot(dx, dy * 0.5);
    const reach = u.range + t.radius;
    if (this.foxSkills(u, t, d, reach, sk)) return b; // it teleported or started a rush: think again next frame
    // no sniping from out of reach: a fox gunman only stops to shoot where a rabbit shooter can hit back,
    // and once it has stopped it stays unless it is out of reach for a while (no stop-and-go);
    // in a stand-off it walks in to the middle of the road before it stops
    if (!u.melee) u.unanswered = this.answerable(u) ? 0 : u.unanswered + dt;
    const closeIn = !u.melee && (u.unanswered > (u.planted ? 0.8 : 0) || (press && u.x > RANGED_LINE + 100));
    if (d <= reach + 40) b.aim = 1;
    b.face = dx >= 0 ? 1 : -1;
    if (d <= reach && !closeIn) {
      b.attack = true;
      b.gx = u.x;
      b.gy = u.y;
      u.planted = !u.melee;
      if (u.state === 'charge') u.state = 'engage';
      if (!u.melee && u.kind !== 'boss') {
        // gunmen back away from a knife rabbit closing in, still shooting (and commit to it for a moment);
        // only a few steps, and never in a stand-off, so it cannot back out of every rabbit's reach for good
        const threat = this.units.find((o) => !o.dead && o.side === 'rabbit' && o.melee && Math.abs(o.x - u.x) < 70 && Math.abs(o.y - u.y) < 40);
        if (threat && u.backT <= 0 && u.backBudget > 0.35 && !press) {
          u.backT = Math.min(0.7, u.backBudget);
          u.sideY = clamp(u.y + (u.y >= threat.y ? 30 : -30), L.laneTop, L.laneBottom);
        }
        if (u.backT > 0 && (u.x >= BACK_AWAY.maxX || press)) u.backT = 0;
        if (u.backT > 0) {
          u.backBudget -= dt;
          b.move = true;
          b.gx = Math.min(BACK_AWAY.maxX, u.x + 60);
          b.gy = u.sideY;
          b.speed = 0.85;
        } else if (u.kind === 'sprayer') {
          // sprayers strafe up and down the road while they spray: harder to hit
          if (u.sideT <= 0) {
            u.sideT = rand(1.2, 2);
            u.sideY = clamp(u.laneY + rand(-40, 40), L.laneTop, L.laneBottom);
          }
          b.move = true;
          b.gx = u.x;
          b.gy = u.sideY;
          b.speed = 0.6;
        }
      }
    } else {
      u.planted = false;
      b.gx = t.x;
      b.gy = u.melee ? t.y : lerp(u.laneY, t.y, 0.2);
      // thugs go round the rabbits' shields to reach the shooters behind them (committing to the detour)
      if (u.melee && u.kind === 'thug') {
        const wall = this.units.find((o) => !o.dead && o.side === 'rabbit' && o.role === 'tank' && o !== t && o.x < u.x && o.x > t.x - 10 && Math.abs(o.y - u.y) < 34);
        if (wall && u.sideT <= 0) {
          u.sideT = 0.6;
          u.sideY = clamp(wall.y + (u.y >= wall.y ? 52 : -52), L.laneTop, L.laneBottom);
        }
        if (u.sideT > 0) b.gy = u.sideY;
      }
      if (u.state === 'charge') b.speed = 1.3;
    }
    return b;
  }

  /** Rabbits aiming at this fox (focus fire makes it reach for a trick). */
  private focusOn(u: Unit) {
    let n = 0;
    for (const o of this.units) if (!o.dead && o.side === 'rabbit' && !o.melee && o.target === u) n++;
    return n;
  }

  /** Sprints, teleports, bull rushes and smoke bombs. Returns true when it did something that takes this moment. */
  private foxSkills(u: Unit, t: Unit, d: number, reach: number, sk: FoxSkill): boolean {
    if (u.x > W - 30 || u.stun > 0) return false; // not on the road yet
    // a burst of speed at a rabbit still some way off
    if (sk.sprintCd && u.melee && u.boostCd <= 0 && d > 90) {
      u.boostT = 0.9;
      u.boostCd = sk.sprintCd;
      sfx.play('sprint', 0, { x: u.x });
    }
    // brutes: a bull rush at a rabbit lined up ahead (never from inside the formation or at one by the carrots),
    // after a short wind-up that shows it coming
    if (sk.rushCd && u.rushCd <= 0 && u.z === 0 && u.dash <= 0) {
      const ahead = u.x - t.x;
      if (ahead > 40 && ahead < 180 && Math.abs(t.y - u.y) < 30 && t.x >= 90 && u.x >= 200) {
        u.rushCd = sk.rushCd;
        u.windT = RUSH_WINDUP;
        u.windTarget = t;
        u.dashY = t.y;
        this.emote(u, '!');
        this.fx.dust(u.x + 10, u.y);
        return true;
      }
    }
    if (sk.blinkCd && u.blinkCd <= 0) {
      if (u.kind === 'ninja') {
        // a shadow appears right next to a rabbit shooter, past the shields
        let prey: Unit | null = null;
        for (const o of this.units) if (!o.dead && o.side === 'rabbit' && !o.melee && (!prey || o.dmg / o.cd > prey.dmg / prey.cd)) prey = o;
        if (prey && Math.abs(prey.x - u.x) > 80) {
          this.blink(u, prey.x + 30, prey.y + rand(-10, 10));
          u.target = prey;
          u.state = 'engage';
          u.blinkCd = sk.blinkCd;
          return true;
        }
      } else if (u.kind === 'gunner' && (this.focusOn(u) >= 2 || u.hp < u.maxHp * 0.5)) {
        // a gunman under fire flicks out of the line of fire
        const mid = (L.laneTop + L.laneBottom) / 2;
        this.blink(u, u.x + rand(-30, 20), u.y + (u.y > mid ? -1 : 1) * rand(60, 110));
        u.blinkCd = sk.blinkCd;
        return true;
      } else if (u.kind === 'boss' && d > reach * 0.7) {
        this.blink(u, Math.max(RANGED_LINE + 60, u.x - rand(70, 110)), t.y);
        u.blinkCd = sk.blinkCd;
        return true;
      }
    }
    // bombers (and shadows) throw down smoke when the rabbits gang up on them
    if (sk.smokeCd && u.smokeCd <= 0 && (this.focusOn(u) >= 2 || u.hp < u.maxHp * 0.6)) {
      u.smokeCd = sk.smokeCd;
      this.dropSmoke(u.x - 10, u.y, 70);
    }
    return false;
  }

  /** Runners slip past: weaving round the rabbits towards the carrots, fighting only what blocks the way. */
  private runnerBrain(u: Unit, b: Brain, t: Unit | null, sk: FoxSkill): Brain {
    if (u.x < W - 30 && sk.sprintCd && u.boostCd <= 0) {
      u.boostT = 1.3;
      u.boostCd = sk.sprintCd;
      sfx.play('sprint', 0, { x: u.x });
    }
    const block = t && Math.abs(t.x - u.x) < 46 && Math.abs(t.y - u.y) < 30 ? t : null;
    if (block) {
      // cornered: stab its way through
      b.face = block.x >= u.x ? 1 : -1;
      b.aim = 1;
      if (Math.hypot(block.x - u.x, block.y - u.y) <= u.range + block.radius) {
        b.attack = true;
        b.gx = u.x;
        b.gy = u.y;
      } else {
        b.gx = block.x;
        b.gy = block.y;
      }
      return b;
    }
    // steer round the nearest rabbit ahead
    let threat: Unit | null = null;
    let best = Infinity;
    for (const o of this.units) {
      if (o.dead || o.side !== 'rabbit') continue;
      const ahead = u.x - o.x;
      if (ahead < -10 || ahead > 140 || Math.abs(o.y - u.y) > 60) continue;
      if (ahead < best) {
        best = ahead;
        threat = o;
      }
    }
    if (threat && u.sideT <= 0) {
      u.sideT = 0.5;
      u.sideY = clamp(threat.y + (u.y >= threat.y ? 70 : -70), L.laneTop, L.laneBottom);
    }
    b.gy = u.sideT > 0 ? u.sideY : u.laneY;
    return b;
  }

  /** Big Red: a war cry that speeds the whole gang up, and runners called in once it is badly hurt. */
  private bossSkills(u: Unit) {
    const sk = FOX_SKILLS.boss;
    if (u.rallyCd <= 0 && u.x < W - 40) {
      u.rallyCd = sk.rallyCd ?? 14;
      this.rallyT = RALLY.time;
      this.shake = Math.max(this.shake, 5);
      this.fx.shock(u.x, u.y - 40 * u.scale, 170, '#ff5a4f');
      sfx.play('roar', 0, { x: u.x });
      for (const o of this.units) if (!o.dead && o.side === 'fox') this.emote(o, '!');
      // the rabbits flinch and raise their weapons (melee rabbits hold the line meanwhile: see meleeReachX)
      for (const o of this.units) {
        if (o.dead || o.side !== 'rabbit') continue;
        this.emote(o, '!');
        o.aim = 1;
      }
    }
    if (!u.summoned && u.hp < u.maxHp * 0.5) {
      u.summoned = true;
      for (const side of [-1, 1]) {
        const r = this.spawnFox('runner');
        r.x = Math.min(W - 30, u.x + 30);
        r.y = r.laneY = clamp(u.y + side * 50, L.laneTop, L.laneBottom);
        this.lone(r);
        this.fx.puff(r.x, r.y, 1);
      }
      this.waveTotal += 2;
      sfx.play('blink', 0, { x: u.x });
    }
  }

  /** Vanish in a puff of smoke and reappear somewhere else, leaving a fading afterimage. */
  private blink(u: Unit, x: number, y: number) {
    this.fx.ghost(u.x, u.y, snapOf(u));
    this.fx.puff(u.x, u.y, u.scale * 0.9);
    u.x = clamp(x, 20, W - 30);
    u.y = u.laneY = clamp(y, L.laneTop, L.laneBottom);
    u.kx = 0;
    u.parked = false;
    u.planted = false;
    u.unanswered = 0;
    u.dodgeT = 0;
    if (u.side === 'fox') {
      // shots in the air fly on past the spot it left, and the rabbits aiming at it look for it again
      for (const p of this.projs) if (p.target === u) p.target = null;
      for (const o of this.units) if (o.side === 'rabbit' && o.target === u) o.retarget = Math.min(o.retarget, 0.15);
    }
    this.fx.puff(u.x, u.y, u.scale * 0.9);
    this.fx.shock(u.x, u.y - 22 * u.scale, 54, '#d6c8ff');
    sfx.play('blink', 0, { x: u.x });
  }

  /**
   * A brute lowers its head and charges along the row (the same charge as the riot ram). It is a tackle, not a
   * free trip past the army: it stops 40 px past the rabbit it charged at, and never past x 60.
   */
  private startRush(u: Unit, t: Unit) {
    u.dash = clamp(Math.min(u.x - t.x + 40, u.x - 60) / 400, 0.05, 0.55);
    u.dashDir = -1;
    u.dashY = t.y;
    u.hitIds = new Set();
    this.emote(u, '!');
    this.fx.dust(u.x + 10, u.y);
    sfx.play('rush', 0, { x: u.x });
    dashStart(this, u);
  }

  private dropSmoke(x: number, y: number, r: number) {
    this.smokes.push({ x, y, r, t: 0, life: 4 });
    for (let i = 0; i < 3; i++) this.fx.puff(x + rand(-r, r) * 0.5, y + rand(-10, 10), 1.4);
    sfx.play('smoke', 0, { x });
  }

  inSmoke(u: Unit) {
    for (const sm of this.smokes) if (Math.hypot(u.x - sm.x, (u.y - sm.y) * 1.4) < sm.r) return true;
    return false;
  }

  /** A fox side-steps a shot or a slash (k scales its chance). Returns true when it got out of the way. */
  private dodge(u: Unit, k = 1): boolean {
    if (u.side !== 'fox' || u.dead || u.stun > 0 || u.dash > 0 || u.dodgeCd > 0) return false;
    const chance = (FOX_SKILLS[u.kind as FoxKind].dodge + (this.inSmoke(u) ? 0.45 : 0)) * k;
    if (chance <= 0 || Math.random() >= chance) return false;
    u.dodgeCd = 0.55;
    u.dodgeT = 0.2;
    const mid = (L.laneTop + L.laneBottom) / 2;
    u.dodgeDir = Math.abs(u.y - mid) > 70 ? (u.y > mid ? -1 : 1) : Math.random() < 0.5 ? -1 : 1;
    if (u.z === 0) u.vz = 120;
    this.fx.ghost(u.x, u.y, snapOf(u));
    this.fx.text(u.x, u.y - u.z - 74 * u.scale, 'MISS', '#d6dcff', 15, 0.55);
    sfx.play('dodge', 0, { x: u.x });
    return true;
  }

  private updateUnit(u: Unit, dt: number) {
    // the drawn body's springs and timers (lunge, squash, tilt, flinch, tumble): cosmetic, so they run first
    const st = fxStep(u, dt);
    u.cdLeft -= dt;
    if (u.evo?.dash) u.dashCd -= dt;
    if (!(st & STEP_FROZEN)) u.atk = Math.max(0, u.atk - dt * 5); // a held hit keeps the arm on its contact frame
    if (st & STEP_EJECT) boltFx(this, u);
    u.flash -= dt;
    u.blinkT -= dt;
    if (u.blinkT < -0.12) u.blinkT = rand(1.5, 4.5);
    u.hpShown = Math.max(u.hp, u.hpShown - u.maxHp * dt * 0.8);
    if (u.regen > 0 && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.regen * dt);
      u.healT -= dt;
      if (u.healT <= 0) {
        u.healT = 0.9;
        this.fx.text(u.x + rand(-6, 6), u.y - u.z - 60 * u.scale, '+', COLOR.hpGood, 18, 0.5);
      }
    }

    // knockback, bounce and cheering hops
    if (u.kx !== 0) {
      u.x += u.kx * dt;
      u.kx *= Math.exp(-dt * 9);
      if (Math.abs(u.kx) < 2) u.kx = 0;
    }
    if (u.z > 0 || u.vz > 0) {
      u.vz -= 900 * dt;
      u.z += u.vz * dt;
      if (u.z <= 0) {
        if (u.vz < -200) landFx(this, u); // a hard landing from a blast or a charge: squash and dust
        u.z = 0;
        u.vz = 0;
      }
    }
    if (u.cheer > 0) {
      u.cheer -= dt;
      if (u.z === 0 && u.cheer > 0.2) u.vz = 170;
    }

    u.emoteT = Math.max(0, u.emoteT - dt);
    u.dodgeCd -= dt;
    u.boostT -= dt;
    if (u.dodgeT > 0) {
      // a quick side-step (a dodge)
      u.dodgeT -= dt;
      u.y = clamp(u.y + u.dodgeDir * 190 * dt, L.laneTop, L.laneBottom);
      u.x += 30 * dt;
    }
    if (u.stun > 0) {
      // bowled over: dizzy for a moment (a brute knocked out of its wind-up loses the rush)
      u.stun -= dt;
      u.windT = 0;
      u.windTarget = null;
      u.windupT = 0;
      u.moving = false;
      u.moveT = 0;
      u.aim *= Math.max(0, 1 - dt * 6);
      u.walk += dt * 3;
      u.y = clamp(u.y, L.laneTop, L.laneBottom);
      return;
    }
    const brain = u.side === 'rabbit' ? this.rabbitBrain(u, dt) : this.foxBrain(u, dt);
    const t = u.target;
    if (t) {
      const dx = t.x - u.x;
      u.face = brain.face || (dx >= 0 ? 1 : -1);
      const ang = clamp(Math.atan2(t.y - 20 * t.scale - (u.y - 19 * u.scale), Math.max(8, Math.abs(dx))), -0.8, 0.8);
      u.aimAngle += (ang - u.aimAngle) * Math.min(1, dt * 10);
    } else u.face = brain.face || (u.side === 'rabbit' ? 1 : -1);
    u.aim += (brain.aim - u.aim) * Math.min(1, dt * 8);
    if (!t) u.aimAngle *= Math.max(0, 1 - dt * 5);
    const attack = brain.attack && !!t;

    // gatling: spin winds down out of the fight; the barrels turn with the spin
    if (u.evo?.spinMax) {
      if (!attack) {
        u.spin = Math.max(0, u.spin - dt * 0.7);
        coolFx(this, u, dt); // smoke curls off the hot barrels
      }
      u.spinPhase += dt * (4 + 30 * u.spin);
    }
    // riot ram: charge through the fox line when one is lined up ahead
    if (u.dash > 0) {
      u.windupT = 0;
      this.dashStep(u, dt);
    } else if (u.evo?.dash && t && u.dashCd <= 0 && u.z === 0) {
      const ahead = (t.x - u.x) * u.face;
      if (ahead > 0 && ahead < 170 && Math.abs(t.y - u.y) < RAM_ROW) this.startDash(u, t);
    }

    const fast = this.speedMul(u);
    if (u.dash <= 0) {
      let moved = false;
      if (!attack || brain.move) {
        const dx = brain.gx - u.x;
        const dy = brain.gy - u.y;
        const d = Math.hypot(dx, dy);
        // once on its spot it stays put until pushed well off it (tol), then walks all the way back
        if (u.parked && d <= (brain.tol ?? 3)) {
          /* holding its ground */
        } else if (d > 2) {
          u.parked = false;
          const sp = Math.min(u.speed * brain.speed * fast * dt, d);
          u.x += (dx / d) * sp;
          u.y += (dy / d) * sp * 0.8;
          moved = sp > 0.05;
        } else u.parked = true;
      }
      // the walk keeps going through split-second pauses, so legs never flicker between walking and standing
      u.moveT = moved ? 0.14 : u.moveT - dt;
      u.moving = u.moveT > 0;
      if (attack && t && u.z < 6) {
        // the wind-up pose plays in the last part of the cooldown, so the blow still lands on the same frame
        windFx(this, u, windTick(u, atkFx(u), true), dt);
        if (u.cdLeft <= 0) {
          u.windupT = 0;
          this.attack(u, t);
        }
      } else u.windupT = 0;
    }
    // kneeling shooters drop to one knee while they aim
    u.crouch += ((u.kneel && !u.melee && u.aim > 0.5 && !u.moving ? 1 : 0) - u.crouch) * Math.min(1, dt * 7);
    u.walk += dt * (u.moving ? 11 * Math.min(1.6, fast) : 3 * u.tempo);
    // footsteps: a rabbit kicks up a little dust cloud and leaves a paw print each time a foot lands (twice a
    // stride, when the walk's bob touches down); foxes just scuff up some dust now and then
    const stepN = Math.floor(u.walk / Math.PI);
    if (u.side === 'rabbit') {
      if (u.moving && u.z === 0 && u.stepN >= 0 && stepN !== u.stepN) this.fx.step(u.x - u.face * 3 * u.scale, u.y, u.face, u.scale, (stepN & 1) === 1);
    } else if (u.moving && u.z === 0) {
      u.dustT -= dt;
      if (u.dustT <= 0) {
        u.dustT = 0.32;
        if (Math.random() < 0.6) this.fx.dust(u.x - u.face * 7 * u.scale, u.y);
      }
    }
    u.stepN = stepN;
    u.y = clamp(u.y, L.laneTop, L.laneBottom);
    if (u.side === 'rabbit') u.x = clamp(u.x, -60, u.melee ? W - 22 : RANGED_LINE);
  }

  /** Sprinting foxes, and the whole gang during the boss's war cry. */
  private speedMul(u: Unit) {
    if (u.side !== 'fox') return 1;
    return (u.boostT > 0 ? (u.kind === 'runner' ? 1.6 : 1.9) : 1) * (this.rallyT > 0 ? RALLY.speed : 1);
  }

  /** Push overlapping units apart so crowds spread out. */
  private separate(dt: number) {
    const us = this.units;
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const min = (a.radius + b.radius) * (a.side === b.side ? 0.8 : 0.9);
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 2;
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= min) continue;
        const push = (min - d) * 0.5 * k;
        const nx = dx / d;
        const ny = dy / d;
        const wa = a.kind === 'boss' ? 0.1 : 1;
        const wb = b.kind === 'boss' ? 0.1 : 1;
        a.x -= nx * push * wa;
        a.y -= ny * push * 0.5 * wa;
        b.x += nx * push * wb;
        b.y += ny * push * 0.5 * wb;
      }
    }
  }

  private startDash(u: Unit, t: Unit) {
    u.dash = 0.3;
    u.dashDir = u.face; // locked: the ram runs straight through, it does not turn at its target
    u.dashY = t.y;
    u.hitIds = new Set();
    dashStart(this, u); // digs in, kicks dust back, whooshes off
  }

  /**
   * Riot Ram charge: every fox it runs through takes 3x damage and flies like a bowling pin. A brute's bull rush
   * is the same charge, but a riot shield (or ram) on its feet stops it dead, and it bowls at most two rabbits.
   */
  private dashStep(u: Unit, dt: number) {
    const fox = u.side === 'fox';
    if (fox) {
      const wall = this.units.find((o) => !o.dead && o.side === 'rabbit' && o.armor >= 0.3 && o.stun <= 0 && Math.abs(o.x - u.x) < o.radius + 16 && Math.abs(o.y - u.y) < RAM_ROW);
      if (wall) {
        // BLOCK: the brute bounces off the shield and sits dazed for a moment
        u.dash = 0;
        u.hitIds = null;
        u.cdLeft = 0.4;
        u.stun = 0.6;
        u.kx = 160;
        wall.kx = -60;
        // the shield's face takes the blow: a slab flash and sparks thrown back at the brute, both held for a beat
        this.fx.impact(wall.x + 12 * wall.scale, wall.y - wall.z - 24 * wall.scale, 'bash', false, 1, true, u.style.fur, u.scale, { tint: '#ffffff', ground: wall.y });
        this.fx.shock(wall.x + 10, wall.y - 24, 40, '#ffffff');
        this.fx.text(wall.x, wall.y - 70, 'BLOCK!', '#ffffff', 18, 0.7);
        freezeOn(wall, 0.07, wall.x);
        freezeOn(u, 0.07, u.x);
        punch(this, 3, 0);
        this.shake = Math.max(this.shake, 3);
        sfx.play('bash', 0, { x: wall.x });
        return;
      }
    }
    u.dash -= dt;
    u.face = u.dashDir;
    dashTrail(this, u, dt); // afterimages behind the charge
    u.x = clamp(u.x + u.dashDir * (fox ? 400 : 560) * dt, -60, W - 22);
    u.y += clamp(u.dashY - u.y, -140 * dt, 140 * dt); // steer onto the row it charged at
    u.moving = true;
    if (Math.random() < 0.5) this.fx.dust(u.x - u.dashDir * 10 * u.scale, u.y);
    const hit = u.hitIds ?? (u.hitIds = new Set());
    for (const o of this.units) {
      if (o.dead || o.side === u.side || hit.has(o.id)) continue;
      if (Math.abs(o.x - u.x) >= o.radius + 16 || Math.abs(o.y - u.y) >= RAM_ROW) continue;
      hit.add(o.id);
      this.damage(o, u.dmg * (fox ? 1.6 : 3), u.x, 2.4, false, 'bowl');
      if (!o.dead && fox) {
        o.vz = 180;
        o.stun = 0.8;
      } else if (!o.dead) o.vz = o.kind === 'boss' ? 60 : 290;
      dashHit(this, u, o, u.dashDir); // a bash mark, and the one bowled over flips in the air
      this.fx.burst(o.x, o.y - 30, fox ? '#ffb347' : EVO.accent.ram, 6);
      sfx.play('bonk', hit.size, { x: u.x });
    }
    if (fox && hit.size >= 2) u.dash = 0; // a bull rush bowls two rabbits at most
    if (u.dash <= 0) {
      u.dash = 0;
      if (!fox) u.dashCd = u.awake ? 2 : (u.evo?.dash ?? 3.2);
      u.cdLeft = 0.4;
      dashEnd(this, u, hit.size); // skids to a stop: a crack in the road, STRIKE! for three or more
      u.hitIds = null;
    }
  }

  /** Gunblade: a crescent shock wave down the lane, hitting every fox it passes once. */
  private shockWave(u: Unit, t: Unit, dmg: number, crit: boolean) {
    const x = u.x + u.face * 16 * u.scale;
    const y = u.y - u.z - 20 * u.scale;
    const p = this.makeProj('wave', u, x, y, x, y, t, dmg, crit);
    p.target = null;
    p.speed = 520;
    p.angle = u.face > 0 ? 0 : Math.PI;
    p.dur = (u.awake ? 240 : 170) / 520;
    p.hits = new Set([t.id]);
    this.projs.push(p);
    sfx.play('shock', 0, { x: u.x });
    waveFx(this, u); // the trigger fires at the blade tip and the arm kicks back
  }

  /** Railgun: instant beam through the target and beyond, piercing foxes in line with falling damage. */
  private rail(u: Unit, t: Unit, dmg: number, crit: boolean, mx: number, my: number) {
    let nx = t.x - mx;
    let ny = t.y - t.z - 20 * t.scale - my;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const len = u.range * 1.15;
    const inLine: { o: Unit; along: number }[] = [];
    for (const o of this.units) {
      if (o.dead || o.side === u.side) continue;
      const cx = o.x - mx;
      const cy = o.y - o.z - 20 * o.scale - my;
      const along = cx * nx + cy * ny;
      if (along < 0 || along > len) continue;
      if (Math.abs(cx * ny - cy * nx) < o.radius + 8) inLine.push({ o, along });
    }
    inLine.sort((a, b) => a.along - b.along);
    const max = (u.evo?.pierce ?? 5) + (u.awake ? 2 : 0);
    inLine.slice(0, max).forEach(({ o }, i) => {
      railHit(this, o, i, crit && i === 0, nx); // a zap on each fox, each one a note higher
      this.damage(o, dmg * 0.85 ** i, mx, 1.6, crit && i === 0, 'zap');
    });
    this.fx.beam(mx, my, mx + nx * len, my + ny * len, EVO.accent.railgun, 10);
    railDone(this, mx, my, mx + nx * len, my + ny * len, Math.min(inLine.length, max), crit);
    this.fx.shock(mx, my, 26, EVO.accent.railgun);
    this.shake = Math.max(this.shake, 2);
  }

  /** A super just evolved: a burst on its soldiers, a hop, and an instant first shot during the slow motion. */
  evolveSquad(key: number, color: string, awake: boolean, slow: number): boolean {
    const e = this.slots.get(key);
    if (!e) return false;
    for (const m of e.members) {
      const u = m.unit;
      if (!u || u.dead) continue;
      this.fx.burst(u.x, u.y - 30, color, 10);
      this.fx.shock(u.x, u.y - 20, 60, color);
      u.vz = 220;
      u.cdLeft = 0;
      u.dashCd = 0;
    }
    if (awake) for (const u of this.units) if (u.side === 'rabbit') u.cheer = rand(0.9, 1.3);
    this.slowmo = Math.max(this.slowmo, slow);
    this.shake = Math.max(this.shake, slow < 1 ? 2 : 6);
    return true;
  }

  announce(text: string, sub: string, color: string) {
    if (this.phase === 'victory') return; // the STAGE CLEAR stamp owns the screen
    this.banner = { text, sub, t: 0, color };
  }

  private attack(u: Unit, t: Unit) {
    u.cdLeft = u.cd * rand(0.9, 1.1) * (u.side === 'fox' && this.rallyT > 0 ? RALLY.rate : 1);
    u.atk = 1;
    if (u.evo?.spinMax) {
      // gatling: each shot spins it up; the next shot comes sooner
      u.spin = Math.min(1, u.spin + 0.1);
      u.cdLeft /= 1 + (u.evo.spinMax - 1 + (u.awake ? 1 : 0)) * u.spin;
    }
    const crit = u.side === 'rabbit' && Math.random() < BAL.critChance;
    const dmg = u.dmg * (crit ? 2 : 1);
    if (u.melee) {
      // the swing (lunge, arm on its contact frame) shows whether it lands or not; a dodged one only whooshes
      const f = meleeSwing(this, u);
      if (this.dodge(t, 0.6)) return meleeWhiff(this, u, t, f);
      this.damage(t, dmg, u.x, crit ? 1.8 : 1, crit, f.kill);
      meleeHit(this, u, t, f, crit); // the weapon's own impact mark, fur tufts, a short hold on both
      sfx.play(MELEE_SOUND[u.weapon] ?? 'slash', 0, { x: u.x, fox: u.side === 'fox' });
      if (u.evo?.waveEvery && ++u.swings % (u.awake ? 2 : u.evo.waveEvery) === 0) this.shockWave(u, t, dmg * 0.8, crit);
      return;
    }
    if (u.proj === 'grenade') {
      const sx = u.x + u.face * 8 * u.scale;
      const sy = u.y - u.z - 34 * u.scale;
      const tx = t.x + rand(-6, 6);
      const p = this.makeProj('grenade', u, sx, sy, tx, t.y, t, dmg, crit);
      p.dur = clamp(Math.hypot(tx - sx, t.y - sy) / u.projSpeed, 0.35, 0.9);
      this.projs.push(p);
      sfx.play('throw', 0, { x: u.x, fox: u.side === 'fox' });
      throwFx(u); // the overhand throw: the arm starts at its release frame
      return;
    }
    this.fire(u, t, dmg, crit);
  }

  private makeProj(kind: ProjKind, u: Unit, x: number, y: number, tx: number, ty: number, t: Unit, dmg: number, crit: boolean): Projectile {
    const offset = u.spread ? rand(-u.spread, u.spread) : 0;
    return {
      kind,
      side: u.side,
      x,
      y,
      sx: x,
      sy: y,
      tx,
      ty: ty + (kind === 'grenade' ? 0 : offset),
      target: t,
      speed: u.projSpeed,
      dmg,
      aoe: u.aoe,
      level: u.level,
      offset,
      t: 0,
      dur: 0,
      angle: 0,
      dead: false,
      trailT: 0,
      crit,
    };
  }

  /** Guns: the gun's own muzzle flash at the real barrel tip, recoil and brass, then the bullet or rocket. */
  private fire(u: Unit, t: Unit, dmg: number, crit: boolean) {
    const hand = SHOULDER.has(u.weapon) ? ROCKET_HAND : GUN_HAND;
    const len = BARREL[u.weapon] ?? 20;
    const a = u.aimAngle;
    const s = u.scale;
    const mx = u.x + u.face * (hand.x + Math.cos(a) * len) * s;
    const my = u.y - u.z + (hand.y + Math.sin(a) * len + u.crouch * CROUCH) * s;
    const worldAng = u.face > 0 ? a : Math.PI - a;
    // the gatling fires so fast that its rounds are light (and it flashes only every 2nd shot)
    const lite = u.weapon === 'gatling';
    // flash, smoke, brass, recoil, camera kick (and the rifle's beam). It is handed the one Math.random() roll the
    // casing always drew here, so the fight's random sequence is exactly what it was before these effects.
    gunFire(this, u, t, mx, my, worldAng, crit, Math.random());
    const snd = GUN_SOUND[u.weapon];
    if (snd) sfx.play(snd, 0, { x: u.x, fox: u.side === 'fox' });
    if (u.evo?.pierce) return this.rail(u, t, dmg, crit, mx, my);

    const ty = t.y - t.z - 20 * t.scale;
    const p = this.makeProj(u.proj ?? 'bullet', u, mx, my, t.x, ty, t, dmg, crit);
    projFx(p, u); // the tracer, rocket or shell is drawn after the gun that fired it
    if (u.evo?.cluster) {
      p.cluster = u.evo.cluster + (u.awake ? 2 : 0);
      p.salvo = { kills: 0, said: false };
    }
    if (u.evo?.shell) {
      // carrot shell: no homing, flies at the target's feet, piercing on the way
      p.hits = new Set();
      p.target = null;
      p.tx = t.x;
      p.ty = t.y - 10;
      p.echo = u.awake;
    }
    if (lite) p.mini = true;
    this.projs.push(p);
  }

  /** Gunblade waves and carrot shells: pierce through foxes (each hit once), shells explode on landing. */
  private updateSweep(p: Projectile, dt: number) {
    const step = p.speed * dt;
    if (p.kind === 'wave') {
      p.x += Math.cos(p.angle) * step;
      p.y += Math.sin(p.angle) * step;
      p.t += dt;
      this.sweep(p, 1);
      if (p.t >= p.dur || p.x < -40 || p.x > W + 40) p.dead = true;
      return;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) p.angle = Math.atan2(dy, dx);
    p.trailT -= dt;
    if (p.trailT <= 0) {
      shellTrail(this.fx, p); // smoke, and now and then a carrot leaf dropping off
      p.trailT = 0.03;
    }
    if (d <= step + 4) {
      p.x = p.tx;
      p.y = p.ty;
      p.dead = true;
      this.explode(p.x, p.y, p.aoe, p.dmg, p.side, p.y + 10, false, 'carrot');
      this.shake = Math.max(this.shake, 8);
      // awakened: the carrot bounces back up and lands again for a second blast
      if (p.echo) this.projs.push({ ...p, kind: 'grenade', sx: p.x, sy: p.y, t: 0, dur: 0.35, dmg: p.dmg * 0.6, echo: false, bounce: true, hits: undefined, target: null, dead: false });
      return;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    this.sweep(p, 0.5);
  }

  private sweep(p: Projectile, mul: number) {
    const hits = p.hits ?? (p.hits = new Set());
    for (const o of this.units) {
      if (o.dead || o.side === p.side || hits.has(o.id)) continue;
      const chest = o.y - o.z - 20 * o.scale;
      if (Math.abs(o.x - p.x) >= o.radius + 14 || Math.abs(chest - p.y) >= 26) continue;
      hits.add(o.id);
      sweepHit(this, p, o); // a blade mark for the wave, a round's mark for the passing carrot
      this.damage(o, p.dmg * mul, p.x - Math.cos(p.angle) * 20, 1.3, p.crit, p.kind === 'wave' ? 'slice' : 'blast');
    }
  }

  private updateProj(p: Projectile, dt: number) {
    if (p.kind === 'wave' || p.kind === 'shell') return this.updateSweep(p, dt);
    if (p.kind === 'bomb') {
      p.t += dt / p.dur;
      const k = Math.min(1, p.t);
      p.y = lerp(p.sy, p.ty, k * k);
      p.trailT -= dt;
      if (p.trailT <= 0) {
        this.fx.trail(p.x + rand(-3, 3), p.y - 26);
        p.trailT = 0.03;
      }
      if (p.t >= 1) {
        this.explode(p.tx, p.ty - 8, p.aoe, p.dmg, 'rabbit', p.ty, false, 'carrot', 'KA-BOOM!');
        this.shake = 10;
        p.dead = true;
      }
      return;
    }
    if (p.kind === 'grenade') {
      p.t += dt / p.dur;
      const k = Math.min(1, p.t);
      p.x = lerp(p.sx, p.tx, k);
      p.y = lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * (p.mini ? 35 : 70);
      if (p.bounce) {
        if (Math.random() < 0.5) this.fx.trail(p.x, p.y);
      } else {
        p.angle += dt * 12;
        if (Math.random() < (p.mini ? 0.2 : 0.5)) this.fx.fuse(p.x + 5, p.y - 8);
      }
      if (p.t >= 1) {
        // a grenade throws up dirt; the awakened cannon's bouncing carrot goes off as a carrot again
        const kills = this.explode(p.tx, p.ty - 6, p.aoe, p.dmg, p.side, p.ty, p.mini, p.bounce ? 'carrot' : 'dirt', p.bounce ? 'BOOM!' : undefined);
        this.salvoKills(p, kills);
        p.dead = true;
      }
      return;
    }
    if (p.target && !p.target.dead) {
      p.tx = p.target.x;
      p.ty = p.target.y - p.target.z - 20 * p.target.scale + p.offset;
    } else if (p.target) {
      p.target = null; // target fell mid-flight: keep flying to the last point and fizzle
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d > 0.01) p.angle = Math.atan2(dy, dx);
    if (d <= step + 4) {
      p.x = p.tx;
      p.y = p.ty;
      p.dead = true;
      if (p.kind === 'rocket') {
        // a rabbit rocket bursts clean; the bomber's homemade one goes up in dirty fire and dark smoke
        const kills = this.explode(p.x, p.y, p.aoe, p.dmg, p.side, p.y + 20, false, p.side === 'fox' ? 'dirty' : 'clean');
        this.salvoKills(p, kills);
        // cluster barrage: bomblets hop out of the blast and pop around it
        for (let i = 0; i < (p.cluster ?? 0); i++) {
          this.projs.push({
            ...p,
            kind: 'grenade',
            sx: p.x,
            sy: p.y,
            tx: p.x + rand(-70, 70),
            ty: clamp(p.y + 20 + rand(-28, 28), L.laneTop, L.laneBottom),
            target: null,
            t: 0,
            dur: rand(0.25, 0.45),
            dmg: p.dmg * 0.4,
            aoe: 40,
            mini: true,
            cluster: 0,
            hits: undefined,
            dead: false,
          });
        }
      } else if (p.target && this.dodge(p.target)) {
        shotDodged(this, p, p.target); // side-stepped: the shot glances off the road with a whine
      } else if (p.target) {
        this.damage(p.target, p.dmg, p.sx, p.crit ? 1.8 : 1, p.crit);
        bulletHit(this, p, p.target); // the gun's own impact mark and sound; a riot shield throws sparks back
      }
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
    if (p.kind === 'rocket') {
      p.trailT -= dt;
      if (p.trailT <= 0) {
        rocketTrail(this.fx, p);
        p.trailT = 0.025;
      }
    }
  }

  /** A cluster barrage rocket and its bomblets count their knock-outs together: three or more get a BOOM-BOOM!. */
  private salvoKills(p: Projectile, kills: number) {
    const s = p.salvo;
    if (!s || kills <= 0 || s.said) return;
    s.kills += kills;
    if (s.kills < 3) return;
    s.said = true;
    this.fx.pow(p.x, p.y - 60, 'BOOM-BOOM!', false, 30);
  }

  /**
   * A blast: hurts everything of the other side in reach, tossing the survivors. style is only its look (clean
   * rabbit rocket, dirty fox rocket, grenade dirt, carrot); word is a comic word to show over it. Returns the kills.
   */
  private explode(x: number, y: number, r: number, dmg: number, side: Side, ground: number, mini = false, style: BlastStyle = 'clean', word?: string) {
    if (this.blasts.length < 24) this.blasts.push({ x, y, r: mini ? r * 0.5 : r });
    let kills = 0;
    for (const u of this.units) {
      if (u.dead || u.side === side) continue;
      const cy = u.y - u.z - 18 * u.scale;
      const d = Math.hypot(u.x - x, (cy - y) * 1.2);
      if (d >= r + u.radius) continue;
      const k = 1 - Math.min(1, d / (r + u.radius));
      this.damage(u, dmg * (0.5 + 0.5 * k), x, 2.2, false, 'blast');
      if (u.dead) kills++;
      else if (u.kind !== 'boss') {
        u.vz = Math.max(u.vz, 120 + 140 * k);
        toss(u, Math.sign(u.x - x) || 1); // a big toss flips it once in the air, a small one rocks it
      }
    }
    if (mini) {
      this.fx.miniBlast(x, y, r, ground);
      sfx.play('pop', 0, { x });
    } else {
      this.fx.explosion(x, y, r, ground, style);
      this.shake = Math.min(9, this.shake + r / 14);
      sfx.play('boom', 0, { x });
      blastFx(this, x, y, r, side, kills, style, word); // camera bump, KA-BOOM! for multi-kills, a beat of hit-stop
    }
    if (side === 'rabbit' && kills >= 3) {
      this.econ.cash += kills;
      this.fx.text(x, y - 70, `MULTI KILL x${kills}!  +${kills}`, '#ffd84a', 24, 1.3);
      this.slowmo = Math.max(this.slowmo, 0.3);
    }
    return kills;
  }

  /** how: the knock-out style if this hit is the last (sliced, bonked, blasted...), only for the look. */
  private damage(u: Unit, amount: number, fromX: number, push = 1, crit = false, how: KillHow = 'pop') {
    if (u.dead) return;
    const armor = u.dash > 0 ? Math.max(u.armor, 0.7) : u.armor; // a charging ram shrugs off hits
    const dealt = amount * (1 - armor);
    u.hp -= dealt;
    u.flash = 0.09;
    if (u.side === 'fox' && !u.charged) this.packCharge(u.pack); // they are shooting at us: go!
    // rabbit hits always shove foxes back up the road, never on toward the carrots
    const dir = u.side === 'fox' ? 1 : Math.sign(u.x - fromX) || -u.face;
    hurtFx(this, u, dealt, crit, push, dir); // the flinch: squint, pinned ears, a squash; red numbers on rabbits
    // a real shove only for crits, explosions and charges; ordinary hits just make it flinch (no sliding about)
    const heavy = crit || push > 1.5;
    const kick = heavy ? Math.min(150, 30 + dealt * 2.5) * push : Math.min(20, 6 + dealt * 0.8);
    const brace = u.kind === 'boss' ? 0.1 : u.kind === 'brute' ? 0.5 : u.side === 'rabbit' && !u.melee ? 0.35 : 1;
    u.kx += dir * kick * brace;
    if (u.side === 'fox') {
      const hx = u.x + rand(-8, 8);
      const hy = u.y - u.z - 64 * u.scale;
      if (crit) {
        this.fx.text(hx, hy - 6, `${Math.round(dealt)}!`, '#ffd84a', Math.min(32, 20 + dealt / 10), 0.75);
        this.shake = Math.max(this.shake, 2);
        sfx.play('crit', 0, { x: u.x });
      } else if (dealt >= 9) {
        this.fx.text(hx, hy, String(Math.round(dealt)), COLOR.white, Math.min(22, 13 + dealt / 12), 0.55);
      }
    }
    if (u.hp <= 0) this.kill(u, dir, how);
  }

  private kill(u: Unit, dir: number, how: KillHow = 'pop') {
    u.dead = true;
    u.hp = 0;
    const snap = snapOf(u);
    this.fx.death(u.x, u.y - u.z, snap, dir, how);
    if (u.side === 'fox') {
      this.waveKilled++;
      this.stageKos++;
      this.econ.cash += u.reward;
      this.events.push({ x: u.x, y: u.y - 30 * u.scale, reward: u.reward });
      this.fx.text(u.x, u.y - 72 * u.scale, `+${u.reward}`, COLOR.cash, u.kind === 'boss' ? 30 : 18, 0.8);
      // kill combo: knock-outs close together build it up; every 10 pays a bonus
      this.combo = this.comboT > 0 ? this.combo + 1 : 1;
      this.comboT = BAL.comboWindow;
      this.comboPulse = 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.stageBest = Math.max(this.stageBest, this.combo);
      sfx.play('ko', this.combo, { x: u.x });
      if (this.combo >= 2) sfx.play('combo', this.combo);
      if (this.combo % 10 === 0) {
        sfx.play('comboBig');
        const bonus = (this.combo / 10) * 2;
        this.econ.cash += bonus;
        this.fx.text(W / 2, 226, `COMBO x${this.combo}!  +${bonus}`, COLOR.toast, 28, 1.3);
        this.fx.burst(W / 2, 226, COLOR.toast, 18);
      }
      if (u.kind === 'boss') {
        this.econ.gems += 3;
        this.fx.explosion(u.x, u.y - 30, 90, u.y);
        if (this.blasts.length < 24) this.blasts.push({ x: u.x, y: u.y, r: 120 });
        this.fx.confetti(u.x, u.y - 40, 40);
        this.fx.text(u.x, u.y - 110, '+3 gems', COLOR.gemLight, 26, 1.4);
        this.shake = 12;
        this.slowmo = 0.9;
        sfx.play('bossDown');
      }
    } else {
      sfx.play('down', 0, { x: u.x });
      const m = this.slots.get(u.slotKey)?.members.find((mm) => mm.unit === u);
      if (m) m.respawn = BAL.respawn;
    }
  }

  /** A fox got past the rabbits: it runs off with carrots. */
  private leak(u: Unit) {
    u.dead = true;
    this.waveKilled++;
    const dmg = Math.round(u.leak * (1 + 0.06 * (this.globalWave - 1)));
    this.baseHp = Math.max(0, this.baseHp - dmg);
    this.leakFlash = 0.5;
    this.shake = Math.max(this.shake, 4);
    this.fx.text(30, u.y - 40, `-${dmg}`, COLOR.hpBad, 22, 0.9);
    sfx.play('leak', 0, { x: 20 });
    if (this.baseHp <= 0) {
      this.phase = 'defeat';
      sfx.play('defeat');
      this.shake = 10;
    }
  }
}
