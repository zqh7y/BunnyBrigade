import { sfx } from './audio';
import { FOXES, isSuper, type FoxKind, type WeaponId } from './data';
import { BARREL, CROUCH, GUN_HAND, ROCKET_HAND, SHOULDER } from './draw/characters';
import type { BodySnap, Effects } from './effects';
import { EVO, FX, TIER } from './theme';
import { clamp, fchance, fpick, frand } from './util';

/*
 * How every attack looks and feels, weapon by weapon (and fox by fox), so each one can be told apart with the
 * bodies hidden: its wind-up, its strike (lunge or recoil, squash, a short hold), its flash, tracer, impact mark,
 * comic word and knock-out style. One table drives it all, so the battle code stays generic.
 *
 * Everything here is cosmetic. The wind-up plays inside the last part of the existing cooldown (the strike lands
 * on the same tick as before), the springs and holds only move the drawing, and all randomness is frand, so the
 * seeded simulator gives the same fight with or without these effects.
 *
 * The functions at the bottom (fxStep, windTick, meleeSwing, gunFire, bulletHit...) are the battle's hooks: the
 * WIRING notes at the end of this file say exactly where each one is called from battle.ts.
 */

/** The mark a hit leaves, by material: pellets, bullets, heavy rounds, blades, punctures, blunt, paws, shields, zaps. */
export type ImpactKind = 'pellet' | 'bullet' | 'heavy' | 'blade' | 'stab' | 'shadow' | 'blunt' | 'punch' | 'bash' | 'zap' | 'blast';
/** How a knocked-out unit leaves: the classic pop, sliced, bonked far, blasted (charred), fried, bowled along the road. */
export type KillHow = 'pop' | 'slice' | 'bonk' | 'blast' | 'zap' | 'bowl';

export interface AtkFx {
  wind: number; // seconds of wind-up shown before the strike (inside the cooldown)
  contact: number; // arm progress of the contact frame (melee; 0 = guns)
  lunge: number; // px the body moves along its facing at the strike (negative = recoil)
  sq: number; // squash at the strike (+ squash, - stretch)
  tilt: number; // body rotation kick at the strike (+ forward)
  lean: number; // lean back during the wind-up (rad; negative leans into it)
  wsq: number; // squash held during the wind-up (+ crouch, - tense stretch)
  hold: number; // seconds both fighters freeze at contact (hit-stop, draw only)
  shake: number; // screen shake
  kick: number; // camera punch in px (guns: backward)
  impact: ImpactKind;
  slash?: number; // slash particle shape for blade impacts
  words: readonly string[]; // comic words (rabbits: crits and heavy kills; brute and bomber: every hit)
  kill: KillHow;
}

const row = (
  wind: number,
  contact: number,
  lunge: number,
  sq: number,
  tilt: number,
  lean: number,
  wsq: number,
  hold: number,
  shake: number,
  kick: number,
  impact: ImpactKind,
  slash: number | undefined,
  words: string[],
  kill: KillHow,
): AtkFx => ({ wind, contact, lunge, sq, tilt, lean, wsq, hold, shake, kick, impact, slash, words, kill });

/** Per weapon (rabbits, and the base for foxes). */
export const ATK: Record<WeaponId, AtkFx> = {
  fist: row(0.08, 0.25, 4, -0.08, 0.08, 0.04, 0, 0.04, 0, 0, 'punch', undefined, ['POW!', 'BAM!'], 'bonk'),
  knife: row(0.07, 0.3, 5, -0.06, 0.1, 0.03, 0, 0.035, 0, 0, 'blade', 1, ['SLASH!', 'SHING!'], 'slice'),
  bat: row(0.22, 0.22, 6, 0.2, 0.18, 0.12, -0.08, 0.09, 3, 3, 'blunt', undefined, ['WHAM!', 'BAM!', 'THUD!'], 'bonk'),
  shield: row(0.12, 0.2, 7, 0.12, 0.12, -0.05, 0.08, 0.06, 1, 0, 'bash', undefined, ['CLANG!', 'BASH!'], 'bonk'),
  pistol: row(0.04, 0, -1, 0, -0.03, 0, 0, 0.02, 0, 0, 'bullet', undefined, ['BANG!'], 'pop'),
  smg: row(0, 0, -0.6, 0, 0, 0, 0, 0, 0, 0, 'pellet', undefined, ['RAT-TAT!'], 'pop'),
  rifle: row(0.14, 0, -3, 0.06, -0.07, 0, 0, 0.05, 1.5, 1, 'heavy', undefined, ['CRACK!'], 'pop'),
  rocket: row(0.2, 0, -4.5, 0.12, -0.1, 0.06, -0.04, 0, 1, 2, 'blast', undefined, ['KA-BOOM!'], 'blast'),
  grenade: row(0.16, 0.3, 3, -0.08, 0.14, 0.08, 0, 0, 0, 0, 'blast', undefined, ['BOOM!'], 'blast'),
  gunblade: row(0.08, 0.28, 7, -0.1, 0.12, 0.04, 0, 0.05, 0.5, 0, 'blade', 6, ['SHING!', 'SLASH!'], 'slice'),
  gatling: row(0, 0, -0.4, 0, 0, 0, 0, 0, 0, 0, 'pellet', undefined, ['BRRRT!'], 'pop'),
  railgun: row(0.4, 0, -4, 0.1, -0.08, 0.03, -0.06, 0.06, 2, 3, 'zap', undefined, ['ZAP!', 'ZZAK!'], 'zap'),
  ram: row(0.12, 0.2, 7, 0.2, 0.16, -0.06, 0.08, 0.05, 2, 0, 'bash', undefined, ['STRIKE!', 'BONK!'], 'bowl'),
  barrage: row(0.22, 0, -4, 0.1, -0.08, 0.06, -0.04, 0, 1, 2, 'blast', undefined, ['BOOM-BOOM!'], 'blast'),
  cannon: row(0.3, 0, -6, 0.25, -0.12, 0.08, -0.05, 0, 4, 4, 'blast', undefined, ['KA-BOOM!'], 'blast'),
};

/** Each fox kind's own move, on top of its weapon's row. */
const FOX_OVERRIDE: Partial<Record<FoxKind, Partial<AtkFx>>> = {
  thug: { wind: 0.1, contact: 0.25, lunge: 6, lean: -0.06, impact: 'stab', slash: undefined, words: ['STAB!'] }, // a hunched shank thrust
  runner: { wind: 0, contact: 0.3, lunge: 3, impact: 'blade', slash: 2, hold: 0, words: [] }, // a low swipe in passing, no stopping
  ninja: { wind: 0.05, contact: 0.2, lunge: 12, wsq: 0.1, impact: 'shadow', slash: 5, words: [] }, // a shadow dash-slash
  brute: { wind: 0.3 }, // the big overhead club slam
  bomber: { wind: 0.35, lunge: -3.5 }, // lights the fuse of a homemade rocket
  boss: { lunge: -0.8, shake: 0.3 }, // a red-hot SMG that shakes him
};

/** Fox rows, merged once (no allocation per attack). */
export const FOX_FX = Object.fromEntries((Object.keys(FOXES) as FoxKind[]).map((k) => [k, { ...ATK[FOXES[k].weapon], ...FOX_OVERRIDE[k] }])) as Record<FoxKind, AtkFx>;

/** The effects row for a unit: its fox kind, or its weapon for rabbits. */
export const atkFx = (u: { side: 'rabbit' | 'fox'; kind: FoxKind | 'rabbit'; weapon: WeaponId }): AtkFx => (u.side === 'fox' ? FOX_FX[u.kind as FoxKind] ?? ATK[u.weapon] : ATK[u.weapon]);

/** Swing smear / slash colour: tier or super accent for rabbits, the fox kind's signature colour for foxes. */
export function smearOf(u: { side: 'rabbit' | 'fox'; kind: FoxKind | 'rabbit'; weapon: WeaponId; level: number }): string {
  if (u.side === 'fox') return (FX.kind as Record<string, string>)[u.kind] ?? FX.fox.slash;
  return isSuper(u.weapon) ? EVO.accent[u.weapon] : TIER.metalLight[clamp(u.level, 1, TIER.metal.length) - 1];
}

// ------------------------------------------------------------------ per-gun flash, casing and tracer shapes

/**
 * Muzzle flash per gun. shape: 0 cross (pistol), 1 fork (SMG, gatling), 2 spear with brake vents (rifle),
 * 3 lens ring (railgun), 4 puff (rockets), 5 flower (cannon), 6 the plain 6-point star, 7 a vertical slab.
 * smoke = expected wisps (the fraction is a chance of one more); glow = glow radius.
 */
export const MUZZLE: Partial<Record<WeaponId, { shape: number; size: number; stretch: number; life: number; smoke: number; glow: number }>> = {
  pistol: { shape: 0, size: 9, stretch: 1.3, life: 0.06, smoke: 1, glow: 22 },
  smg: { shape: 1, size: 7, stretch: 1.6, life: 0.045, smoke: 0.3, glow: 16 },
  gatling: { shape: 1, size: 6, stretch: 1.4, life: 0.04, smoke: 0.2, glow: 14 },
  rifle: { shape: 2, size: 12, stretch: 2.8, life: 0.08, smoke: 2, glow: 30 },
  railgun: { shape: 3, size: 14, stretch: 1, life: 0.12, smoke: 0, glow: 34 },
  rocket: { shape: 4, size: 13, stretch: 1.2, life: 0.09, smoke: 5, glow: 36 },
  barrage: { shape: 4, size: 12, stretch: 1.2, life: 0.09, smoke: 4, glow: 34 },
  cannon: { shape: 5, size: 20, stretch: 1.1, life: 0.12, smoke: 8, glow: 50 },
  gunblade: { shape: 0, size: 7, stretch: 1.3, life: 0.06, smoke: 0.5, glow: 18 }, // the trigger pull of a wave swing
};

/** Spent brass per gun (w x h px), its chance per shot and launch speed. The rifle's comes out with the bolt. */
export const CASING: Partial<Record<WeaponId | 'boss', { chance: number; w: number; h: number; color: string; vy: number }>> = {
  pistol: { chance: 1, w: 5, h: 2.4, color: FX.rabbit.casing, vy: -170 },
  smg: { chance: 0.5, w: 4, h: 2, color: FX.rabbit.casing, vy: -160 },
  boss: { chance: 0.7, w: 4, h: 2, color: FX.fox.casing, vy: -170 },
  gatling: { chance: 0.25, w: 3, h: 3, color: FX.hit.link, vy: -150 }, // belt links
  rifle: { chance: 1, w: 7, h: 2.6, color: FX.rabbit.casing, vy: -240 },
};

export interface Tracer {
  len: number;
  w: number;
  head: number;
  body?: string; // a fixed body colour (else the tier colour, or fox orange)
}
/** Bullet tracers per gun: length, width and head size. */
export const TRACER: Record<'pistol' | 'smg' | 'gatling' | 'gatlingTracer' | 'rifle' | 'boss' | 'other', Tracer> = {
  pistol: { len: 26, w: 5, head: 3.2 },
  smg: { len: 14, w: 3.6, head: 2.2 },
  gatling: { len: 10, w: 3, head: 1.8 },
  gatlingTracer: { len: 34, w: 4, head: 2.4, body: EVO.accent.gatling },
  rifle: { len: 60, w: 4, head: 2.6 },
  boss: { len: 20, w: 5, head: 3.4, body: FX.kind.boss },
  other: { len: 24, w: 4.5, head: 3 },
};

/** Body flight per knock-out style: [vx, vy, spin] multipliers and how bouncy it lands. */
export const KILL_FLIGHT: Record<KillHow, { vx: number; vy: number; vr: number; bounce: number }> = {
  pop: { vx: 1, vy: 1, vr: 1, bounce: 0.32 },
  slice: { vx: 0.8, vy: 0.7, vr: 0.6, bounce: 0.32 },
  bonk: { vx: 1.8, vy: 1.35, vr: 1.6, bounce: 0.55 },
  blast: { vx: 1.2, vy: 1.6, vr: 1.3, bounce: 0.32 },
  zap: { vx: 0.3, vy: 0.6, vr: 0.3, bounce: 0.2 },
  bowl: { vx: 2.4, vy: 0.35, vr: 1.2, bounce: 0.2 },
};

// ------------------------------------------------------------------ draw-only body state

/**
 * What each unit carries for its attack animation. Battle's Unit gets all of these (interface Unit extends
 * FxBody, and makeUnit spreads fxBody()). None of it changes the fight.
 */
export interface FxBody {
  windupT: number; // seconds of wind-up left (0 = not winding up)
  windupMax: number; // how long this wind-up is
  lunge: number; // px forward along the facing (negative = recoil), a spring
  lungeV: number;
  sq: number; // squash (+) / stretch (-), a spring, area-preserving when drawn
  sqV: number;
  tilt: number; // body rotation (+ forward), a spring
  tiltV: number;
  hurtT: number; // flinch time left (squint eyes, pinned ears)
  freeze: number; // hit-stop: seconds this unit is drawn held at freezeX
  freezeX: number;
  roll: number; // airborne flip (world rotation), one full turn by landing
  rollV: number;
  strikeN: number; // strikes so far (forehand / backhand, one-two, alternate tubes, tracer rounds)
  cycleT: number; // rifle bolt / railgun vent timer
  trigT: number; // gunblade trigger kick
  smokeT: number; // a timer for trailing effects (cooling smoke, rail charge sparks, ram ghosts)
  cueD: number; // a one-shot cue during the wind-up has played
}

export const fxBody = (): FxBody => ({
  windupT: 0,
  windupMax: 0,
  lunge: 0,
  lungeV: 0,
  sq: 0,
  sqV: 0,
  tilt: 0,
  tiltV: 0,
  hurtT: 0,
  freeze: 0,
  freezeX: 0,
  roll: 0,
  rollV: 0,
  strikeN: 0,
  cycleT: 0,
  trigT: 0,
  smokeT: 0,
  cueD: 0,
});

/** What the projectile drawing needs to know about the gun that fired it (Battle's Projectile gets these). */
export interface ProjFx {
  weapon?: WeaponId;
  boss?: boolean; // Big Red's red-hot slugs
  tracer?: boolean; // a gatling tracer round
}

/** The parts of a unit the hooks read. Battle's Unit has all of them once it extends FxBody. */
export interface FxUnit extends FxBody {
  side: 'rabbit' | 'fox';
  kind: FoxKind | 'rabbit';
  weapon: WeaponId;
  level: number;
  rLevel: number;
  x: number;
  y: number;
  z: number;
  vz: number;
  scale: number;
  face: number;
  aimAngle: number;
  crouch: number;
  cd: number;
  cdLeft: number;
  maxHp: number;
  spin: number;
  dead: boolean;
  style: BodySnap['style'];
}

export interface FxProj extends ProjFx {
  side: 'rabbit' | 'fox';
  x: number;
  y: number;
  sx: number;
  angle: number;
  crit: boolean;
  mini?: boolean;
}

/** What the hooks need from the Battle: its effects, its shake, the camera kick and the global hit-stop. */
export interface FxHost {
  fx: Effects;
  shake: number;
  slowmo: number;
  kickX: number;
  kickY: number;
  hitStop: number;
  hitStopCd: number;
}

// ------------------------------------------------------------------ springs, wind-up, poses

/** fxStep result flags. */
export const STEP_FROZEN = 1; // held in a hit-stop: skip the atk decay this frame
export const STEP_EJECT = 2; // the rifle bolt (or railgun vent) cycles now: call boltFx
const EJECT_AT = 0.13;

/**
 * The draw-only springs and timers, once per frame at the very top of updateUnit (before the stun early return).
 * Lunge is critically damped (peaks 58 ms after a kick), squash overshoots once, tilt wobbles a little.
 */
export function fxStep(u: FxBody & { z: number }, dt: number): number {
  let out = 0;
  u.hurtT = Math.max(0, u.hurtT - dt);
  u.trigT = Math.max(0, u.trigT - dt);
  if (u.cycleT > 0) {
    const prev = u.cycleT;
    u.cycleT = Math.max(0, prev - dt);
    if (prev > EJECT_AT && u.cycleT <= EJECT_AT) out |= STEP_EJECT;
  }
  if (u.z > 0) u.roll += u.rollV * dt;
  else u.roll = u.rollV = 0;
  if (u.freeze > 0) {
    u.freeze -= dt;
    return out | STEP_FROZEN;
  }
  u.lungeV += (-300 * u.lunge - 34.6 * u.lungeV) * dt;
  u.lunge += u.lungeV * dt;
  u.sqV += (-260 * u.sq - 16 * u.sqV) * dt;
  u.sq += u.sqV * dt;
  u.tiltV += (-200 * u.tilt - 14 * u.tiltV) * dt;
  u.tilt += u.tiltV * dt;
  return out;
}

/**
 * The wind-up: shown during the last `wind` seconds of the cooldown (at most 45% of it), so the strike still
 * lands when cdLeft reaches 0, exactly as before. A unit that comes into range with its cooldown already done
 * strikes at once with no wind-up. Call it after the cooldown has counted down this frame. Returns true on the
 * frame a wind-up starts (for its cue).
 */
export function windTick(u: FxBody & { cd: number; cdLeft: number }, f: AtkFx, engaged: boolean): boolean {
  if (!engaged) {
    u.windupT = 0;
    return false;
  }
  if (u.windupT > 0) {
    // it follows the cooldown exactly, so the pose holds right up to the strike frame
    u.windupT = Math.max(0, u.cdLeft);
    return false;
  }
  const w = Math.min(f.wind, u.cd * 0.45);
  if (w <= 0 || u.cdLeft <= 0 || u.cdLeft > w) return false;
  u.windupT = u.windupMax = u.cdLeft;
  return true;
}

/** The strike's body motion: lunge (or recoil), squash or stretch, tilt. Big and kneeling bodies move less. */
export function strikePose(u: FxBody & { kind: FoxKind | 'rabbit'; crouch: number }, f: AtkFx) {
  const k = u.kind === 'boss' ? 0.4 : u.kind === 'brute' ? 0.7 : u.crouch > 0.5 ? 0.5 : 1;
  u.lungeV += f.lunge * k * 47; // 47 = omega * e, so the peak offset equals f.lunge
  u.sq = clamp(u.sq + f.sq * k, -0.3, 0.3);
  u.tilt += f.tilt * k;
  u.strikeN++;
}

/** A victim flinches: squints, pins its ears, squashes and rocks with the hit (dir = the way it is pushed). */
export function hurtPose(u: FxBody & { kind: FoxKind | 'rabbit'; face: number }, heavy: boolean, dir: number) {
  const b = u.kind === 'boss' ? 0.25 : u.kind === 'brute' ? 0.5 : 1;
  u.hurtT = Math.max(u.hurtT, heavy ? 0.26 : 0.16);
  u.sq = Math.max(u.sq, (heavy ? 0.28 : 0.14) * b);
  u.tilt += (dir === u.face ? 0.12 : -0.18) * (heavy ? 1.6 : 1) * b;
}

/** Hold a unit still for s seconds at x (drawn there, jittering if hurt; it catches up when the hold ends). */
export function freezeOn(u: FxBody, s: number, x: number) {
  if (s <= 0) return;
  if (u.freeze <= 0) u.freezeX = x;
  u.freeze = Math.max(u.freeze, s);
}

/** A tossed unit (vz just set) flips once in the air, landing upright; small tosses just rock it. pushDir: world +1 = right. */
export function toss(u: FxBody & { kind: FoxKind | 'rabbit'; vz: number; face: number }, pushDir: number) {
  if (u.kind !== 'boss' && u.vz >= 200) u.rollV = (pushDir * 2 * Math.PI) / ((2 * u.vz) / 900);
  else {
    u.rollV = 0;
    u.tilt += pushDir * u.face * 0.3;
  }
}

/** A point along a unit's gun, `along` body units from the grip (default: the muzzle), where it is drawn now. */
export function gunPoint(u: FxUnit, along = BARREL[u.weapon] ?? 20) {
  const hand = SHOULDER.has(u.weapon) ? ROCKET_HAND : GUN_HAND;
  return {
    x: u.x + u.face * (u.lunge + hand.x + Math.cos(u.aimAngle) * along) * u.scale,
    y: u.y - u.z + (hand.y + Math.sin(u.aimAngle) * along + u.crouch * CROUCH) * u.scale,
  };
}

const snapOf = (u: FxUnit): BodySnap => ({ side: u.side, kind: u.kind, style: u.style, weapon: u.weapon, level: u.level, rLevel: u.rLevel, scale: u.scale, face: u.face });
const chestY = (u: FxUnit) => u.y - u.z - 20 * u.scale;

// ------------------------------------------------------------------ battle hooks

/** Camera punch: a directional jolt on top of the random shake (decays in fxHostStep). */
export function punch(b: FxHost, dx: number, dy: number) {
  b.kickX += dx;
  b.kickY += dy;
}

/** A rare whole-screen hit-stop for big moments (rate-limited, never in slow motion or under heavy effects load). */
export function freezeFrame(b: FxHost, s: number) {
  if (b.hitStopCd > 0 || b.slowmo > 0 || b.fx.load > 0.8) return;
  b.hitStop = s;
  b.hitStopCd = 0.6;
}

/** Once per Battle.update: the camera kick settles and the hit-stop cooldown runs out. */
export function fxHostStep(b: FxHost, dt: number) {
  const k = Math.exp(-dt * 18);
  b.kickX *= k;
  b.kickY *= k;
  if (Math.abs(b.kickX) < 0.05) b.kickX = 0;
  if (Math.abs(b.kickY) < 0.05) b.kickY = 0;
  b.hitStopCd = Math.max(0, b.hitStopCd - dt);
}

/** During a wind-up (after windTick): the grenade pin, the bomber's lit fuse, rail charge sparks, the club's whoosh. */
export function windFx(b: FxHost, u: FxUnit, started: boolean, dt: number) {
  if (u.windupT <= 0) return;
  const fox = u.side === 'fox';
  if (started) {
    u.cueD = 0;
    u.smokeT = 0;
    if (u.weapon === 'grenade' && !fox) {
      b.fx.pin(u.x + u.face * 8 * u.scale, u.y - u.z - 34 * u.scale, u.face);
      sfx.play('pin', 0, { x: u.x });
    }
    if (u.kind === 'bomber') sfx.play('fizz', 0, { x: u.x, fox: true });
  }
  if (u.kind === 'bomber' && fchance(0.6)) {
    const p = gunPoint(u, -17); // the back of the tube
    b.fx.fuse(p.x, p.y);
  }
  if (u.weapon === 'railgun') {
    u.smokeT -= dt;
    if (u.smokeT <= 0) {
      u.smokeT = 0.08;
      const m = gunPoint(u);
      b.fx.suck(m.x, m.y);
    }
  }
  if (u.kind === 'brute' && !u.cueD && u.windupT < 0.05) {
    u.cueD = 1;
    sfx.play('swoosh', 0, { x: u.x, fox: true });
  }
}

/**
 * A melee swing starts (before the dodge roll): the body lunges, the arm jumps to its contact frame.
 * The ninja leaves an afterimage where it stood. Returns the unit's effects row.
 */
export function meleeSwing(b: FxHost, u: FxUnit & { atk: number }): AtkFx {
  const f = atkFx(u);
  if (u.kind === 'ninja') {
    b.fx.ghost(u.x, u.y, snapOf(u));
    b.fx.dust(u.x, u.y);
    sfx.play('swoosh', 0, { x: u.x, fox: true });
  }
  strikePose(u, f);
  u.atk = 1 - f.contact;
  return f;
}

/** A grenade throw (attack()'s grenade branch): the overhand body motion, the arm starting at its release frame. */
export function throwFx(u: FxUnit & { atk: number }) {
  const f = atkFx(u);
  strikePose(u, f);
  u.atk = 1 - f.contact;
}

/** The swing missed (the fox side-stepped): a whoosh and a faint slash, no impact. */
export function meleeWhiff(b: FxHost, u: FxUnit, t: FxUnit, f: AtkFx) {
  sfx.play('swoosh', 0, { x: u.x, fox: u.side === 'fox' });
  if (f.impact === 'blade' || f.impact === 'shadow' || f.impact === 'stab') b.fx.whiff(t.x - u.face * 4, chestY(t), u.face, smearOf(u), f.slash ?? 0, (u.strikeN & 1) === 1);
}

/** A melee hit landed (after damage()): the impact mark, tufts of the victim's fur, the hold, words and shake. */
export function meleeHit(b: FxHost, u: FxUnit, t: FxUnit, f: AtkFx, crit: boolean) {
  const fox = u.side === 'fox';
  const cx = t.x - u.face * 4;
  const cy = chestY(t);
  const tint = u.weapon === 'ram' ? EVO.accent.ram : smearOf(u);
  b.fx.impact(cx, cy, f.impact, fox, u.face, crit, t.style.fur, t.scale, { tint, slash: f.slash, alt: (u.strikeN & 1) === 1, ground: t.y });
  const h = f.hold * (crit ? 1.6 : 1);
  freezeOn(u, h, u.x);
  freezeOn(t, h, t.x);
  if (f.shake) b.shake = Math.max(b.shake, f.shake);
  if (u.kind === 'brute') {
    // the brute's signature: a slam word on every hit, the camera knocked down, the road cracked
    b.fx.powAt(t, fpick(f.words), true);
    punch(b, 0, 3);
    sfx.play('land', 0, { x: u.x, fox: true });
  } else if (!fox && t.dead && f.kill === 'bonk') {
    b.fx.powAt(t, f.words[f.words.length - 1], false);
    freezeFrame(b, 0.06);
  } else if (!fox && crit && f.words.length) b.fx.powAt(t, fpick(f.words), false);
}

/**
 * A gun fires (replaces the muzzle and casing lines in fire()): its own flash, smoke and brass, recoil, camera
 * kick, the rifle's beam and vapour. roll: the Math.random() the casing used to draw (pass it, so the gameplay
 * random sequence stays exactly as it was).
 */
export function gunFire(b: FxHost, u: FxUnit, t: FxUnit, mx: number, my: number, ang: number, crit: boolean, roll: number) {
  const f = atkFx(u);
  const w = u.weapon;
  const fox = u.side === 'fox';
  const boss = u.kind === 'boss';
  const s = u.scale;
  // the barrage fires its two tubes in turn
  const fy = w === 'barrage' ? my + ((u.strikeN & 1 ? -4.5 : 4.5) * s) : my;
  if (w !== 'gatling' || u.strikeN % 2 === 0) b.fx.muzzle(mx, fy, ang, w, TIER.metalLight[clamp(u.level, 1, 7) - 1], fox, boss);
  strikePose(u, f);
  const c = CASING[boss ? 'boss' : w];
  if (c && w !== 'rifle' && roll < c.chance) b.fx.casing(u.x + u.face * 10 * s, u.y - u.z - 22 * s, u.face, u.y, c.w, c.h, fox && !boss ? FX.fox.casing : c.color, c.vy);
  if (w === 'rifle') u.cycleT = 0.45; // the bolt ejects the brass a beat later (with the chk-chk in its sound)
  if (w === 'railgun') u.cycleT = 0.33; // the coils vent steam
  if (f.kick) punch(b, -u.face * f.kick, 0);
  if (f.shake && (w !== 'rifle' || crit)) b.shake = Math.max(b.shake, f.shake);
  if (w === 'rocket' || w === 'barrage' || w === 'cannon') for (let i = 0; i < 2; i++) b.fx.dust(u.x - u.face * 14 * s, u.y);
  const ty = chestY(t);
  if (w === 'rifle') {
    b.fx.beam(mx, my, t.x, ty, TIER.metal[clamp(u.level, 1, 7) - 1], 2.5, 0.18);
    b.fx.vapour(mx, my, t.x, ty);
  }
  if (u.kind === 'sprayer' && fchance(0.3)) {
    // spray and pray: some rounds kick up the road round its target
    b.fx.decal(t.x + frand(-14, 14), t.y + frand(-4, 4), 0, 3);
    b.fx.dust(t.x + frand(-14, 14), t.y);
  }
  if (boss && u.strikeN % 8 === 0) b.fx.pow(mx, my - 26, 'BRRRT!', true, 20);
}

/** Every fired projectile learns its gun (call on the object makeProj returns, or set the fields inside it). */
export function projFx(p: ProjFx, u: FxUnit) {
  p.weapon = u.weapon;
  p.boss = u.kind === 'boss';
  p.tracer = u.weapon === 'gatling' && u.strikeN % 3 === 0;
}

/** A bullet hit its target (after damage()): the impact by gun, the hold, the sound, a shield's ricochet. */
export function bulletHit(b: FxHost, p: FxProj, t: FxUnit) {
  const fox = p.side === 'fox';
  const w = p.weapon ?? 'pistol';
  const dir = Math.cos(p.angle) >= 0 ? 1 : -1;
  const light = p.mini || p.boss || w === 'smg' || w === 'gatling';
  const kind: ImpactKind = w === 'rifle' ? 'heavy' : light ? (p.crit && !fox ? 'bullet' : 'pellet') : 'bullet';
  b.fx.impact(p.x, p.y, kind, fox, dir, p.crit, t.style.fur, p.boss ? 1.4 : 1, { ang: p.angle, ground: t.y, cheap: p.mini && !p.tracer });
  if (!light) freezeOn(t, w === 'rifle' ? 0.05 : 0.02, t.x);
  sfx.play(w === 'rifle' ? 'thwack' : 'hit', 0, { x: p.x, fox });
  if ((t.weapon === 'shield' || t.weapon === 'ram') && Math.sign(p.sx - t.x) === t.face) {
    // a riot shield takes it on the face: sparks glance back toward the shooter
    b.fx.deflect(t.x + t.face * 14 * t.scale, chestY(t), t.face, fox);
    sfx.play('ricochet', 0, { x: t.x });
  }
  if (p.crit && !fox) {
    const f = ATK[w];
    if (f.words.length) b.fx.powAt(t, fpick(f.words), false);
    if (w === 'rifle') {
      t.tilt *= 2;
      freezeFrame(b, 0.05);
    }
  }
}

/** The target side-stepped a bullet: it glances off the road with a whine. */
export function shotDodged(b: FxHost, p: FxProj, t: FxUnit) {
  b.fx.ricochet(p.x, p.y, p.angle, p.side === 'fox', t.y);
  sfx.play('ricochet', 0, { x: p.x });
}

/** Rocket smoke trail (replaces fx.trail in updateProj): white for rabbits, dark with embers for the bomber's homemade one. */
export function rocketTrail(fx: Effects, p: FxProj) {
  const x = p.x - Math.cos(p.angle) * 12;
  const y = p.y - Math.sin(p.angle) * 12;
  if (p.side === 'fox') {
    fx.trail(x, y, FX.fox.rocketTrail, 5);
    if (fchance(0.3)) fx.ember(x, y);
  } else fx.trail(x, y);
}

/** The carrot shell's trail (replaces fx.trail in updateSweep): smoke, and now and then a leaf dropping off. */
export function shellTrail(fx: Effects, p: FxProj) {
  const x = p.x - Math.cos(p.angle) * 16;
  const y = p.y - Math.sin(p.angle) * 16;
  fx.trail(x, y);
  if (fchance(0.5)) fx.leaf(x, y);
}

/** After an explosion (with its kill count): the camera bump, words for multi-kills, the cannon's KA-BOOM. */
export function blastFx(b: FxHost, x: number, y: number, r: number, side: 'rabbit' | 'fox', kills: number, style: 'clean' | 'dirty' | 'dirt' | 'carrot', word?: string) {
  punch(b, 0, r / 30);
  if (side !== 'rabbit') return;
  const w = word ?? (kills >= 2 ? fpick(['KA-BOOM!', 'BOOM!']) : style === 'carrot' ? 'KA-BOOM!' : '');
  if (w) b.fx.pow(x + frand(-8, 8), y - r * 0.6 - 20, w, false, 26 + Math.min(8, kills * 2));
  if (kills >= 2) freezeFrame(b, 0.05);
}

/** Inside damage(), once dir is known: the flinch, red numbers on rabbits for big hits, a beat on big boss hits. */
export function hurtFx(b: FxHost, u: FxUnit, dealt: number, crit: boolean, push: number, dir: number) {
  const heavy = crit || push > 1.5 || dealt >= u.maxHp * 0.15;
  hurtPose(u, heavy, dir);
  if (u.side === 'rabbit' && dealt >= u.maxHp * 0.12) b.fx.text(u.x + frand(-8, 8), u.y - u.z - 64 * u.scale, '-' + Math.round(dealt), '#ff8a80', 13, 0.5);
  if (u.kind === 'boss' && dealt >= u.maxHp * 0.04) freezeFrame(b, 0.04);
}

/** Railgun: each fox the beam passes through (i = its place in line): a zap, a rising zing, a hold on the first. */
export function railHit(b: FxHost, o: FxUnit, i: number, crit: boolean, nx: number) {
  b.fx.impact(o.x, chestY(o), 'zap', false, nx >= 0 ? 1 : -1, crit, o.style.fur, o.scale);
  sfx.play('zap', i, { x: o.x });
  if (i === 0) freezeOn(o, 0.06, o.x);
}

/** Railgun, after the beam: crackles along it, words for long pierces and crits. */
export function railDone(b: FxHost, x: number, y: number, x2: number, y2: number, pierced: number, crit: boolean) {
  b.fx.zapLine(x, y, x2, y2);
  if (crit) {
    b.fx.pow(x2 - (x2 - x) * 0.4, y2 - (y2 - y) * 0.4 - 40, 'ZZAK!', false, 26);
    freezeFrame(b, 0.05);
  } else if (pierced >= 3) {
    b.fx.pow(x2 - (x2 - x) * 0.4, y2 - (y2 - y) * 0.4 - 40, 'ZAP!', false, 26);
    freezeFrame(b, 0.04);
  }
}

/** Gunblade wave swing: the trigger fires at the blade tip and the arm kicks back. */
export function waveFx(b: FxHost, u: FxUnit) {
  u.trigT = 0.15;
  b.fx.muzzle(u.x + u.face * 34 * u.scale, u.y - u.z - 21 * u.scale, u.face > 0 ? 0 : Math.PI, 'gunblade', EVO.accent.gunblade);
  b.shake = Math.max(b.shake, 1);
}

/** A charge starts (riot ram, or the brute's rush): dig in, kick dust back, whoosh. */
export function dashStart(b: FxHost, u: FxUnit) {
  u.sq = 0.2;
  for (let i = 0; i < 2; i++) b.fx.dust(u.x - u.face * 8, u.y);
  sfx.play('swoosh', 0, { x: u.x, fox: u.side === 'fox' });
}

/** Every frame of a charge: afterimages trail behind. */
export function dashTrail(b: FxHost, u: FxUnit, dt: number) {
  u.smokeT -= dt;
  if (u.smokeT > 0) return;
  u.smokeT = 0.06;
  b.fx.ghost(u.x, u.y, snapOf(u));
}

/** A charge bowls a unit over (after damage() and its vz are set): a bash mark and a flip in the air. */
export function dashHit(b: FxHost, u: FxUnit, o: FxUnit, dir: number) {
  const fox = u.side === 'fox';
  b.fx.impact(o.x - dir * 6, chestY(o), 'bash', fox, dir, false, o.style.fur, o.scale, { tint: fox ? FX.fox.spark : EVO.accent.ram, ground: o.y });
  if (!o.dead) toss(o, dir);
}

/** The charge ends (hits = units bowled over): squash, a crack in the road, and STRIKE! for 3 or more. */
export function dashEnd(b: FxHost, u: FxUnit, hits: number) {
  u.sq = 0.2;
  b.fx.decal(u.x + u.face * 10, u.y, 1, 12);
  for (let i = 0; i < 2; i++) b.fx.dust(u.x + u.face * 6, u.y);
  if (u.side === 'rabbit' && hits >= 3) {
    b.fx.pow(u.x + u.face * 30, u.y - 80 * u.scale, 'STRIKE!', false, 28);
    freezeFrame(b, 0.05);
    b.shake = Math.max(b.shake, 3);
  }
}

/** A gunblade wave or carrot shell passing through a fox (replaces fx.hit in sweep). */
export function sweepHit(b: FxHost, p: FxProj & { kind: string }, o: FxUnit) {
  const dir = Math.cos(p.angle) >= 0 ? 1 : -1;
  if (p.kind === 'wave') b.fx.impact(o.x, chestY(o), 'blade', false, dir, p.crit, o.style.fur, o.scale, { tint: EVO.accent.gunblade, slash: 6 });
  else b.fx.impact(o.x, chestY(o), 'bullet', false, dir, p.crit, o.style.fur, o.scale, { ang: p.angle, ground: o.y });
}

/** The rifle bolt cycles (STEP_EJECT): brass out of the action; the railgun's coils vent steam instead. */
export function boltFx(b: FxHost, u: FxUnit) {
  const s = u.scale;
  if (u.weapon === 'rifle') {
    const c = CASING.rifle!;
    b.fx.casing(u.x + u.face * 8 * s, u.y - u.z - 22 * s, u.face, u.y, c.w, c.h, c.color, c.vy);
  } else if (u.weapon === 'railgun') {
    const p = gunPoint(u, 24);
    b.fx.steam(p.x, p.y);
  }
}

/** Gatling winding down out of the fight: smoke curls off the hot barrels. */
export function coolFx(b: FxHost, u: FxUnit, dt: number) {
  if (u.spin <= 0.5) return;
  u.smokeT -= dt;
  if (u.smokeT > 0) return;
  u.smokeT = 0.1;
  const m = gunPoint(u);
  b.fx.cool(m.x, m.y);
}

/** Landing hard from a toss or a hop (vz < -200 when z reaches 0): squash and a little dust. */
export function landFx(b: FxHost, u: FxUnit) {
  u.sq = 0.25;
  for (let i = 0; i < 2; i++) b.fx.dust(u.x + frand(-6, 6), u.y);
}

/*
 * ===================================================================== WIRING (battle.ts and game.ts)
 *
 * Everything below is cosmetic: none of it may call Math.random (use frand / fpick from util.ts), and every
 * existing Math.random() call stays where it is, so the gameplay random sequence does not move. Steps 1 and 3-12
 * together leave the seeded simulator's output bit-identical; step 2's global hit-stop does not (see there).
 *
 * Names: the wind-up fields are windupT / windupMax. Unit.windT is the brute's bull-rush wind-up (gameplay,
 * battle.ts): do not merge the two. field.ts already draws that rush wind-up (crouch, lean into the charge).
 *
 * imports (battle.ts):
 *   import { STEP_EJECT, STEP_FROZEN, atkFx, blastFx, boltFx, bulletHit, coolFx, dashEnd, dashHit, dashStart,
 *     dashTrail, fxBody, fxHostStep, fxStep, gunFire, hurtFx, landFx, meleeHit, meleeSwing, meleeWhiff, projFx,
 *     railDone, railHit, rocketTrail, shellTrail, shotDodged, sweepHit, throwFx, toss, waveFx, windFx, windTick,
 *     type FxBody, type KillHow, type ProjFx } from './attackfx';
 *   After steps 5 and 6, isSuper (data) and TIER (theme) are no longer used in battle.ts: drop them from the imports.
 *
 * 1. Types
 *   export interface Unit extends FxBody { ...unchanged... }       makeUnit(): add  ...fxBody(),  to the literal
 *   export interface Projectile extends ProjFx { ...unchanged... }
 *   class Battle: add public fields  kickX = 0; kickY = 0; hitStop = 0; hitStopCd = 0;
 *   (Battle then satisfies FxHost: fx, shake, slowmo, kickX, kickY, hitStop, hitStopCd. field.ts already draws
 *   the kick, and reads every new Unit / Projectile field, as soon as they exist.)
 *
 * 2. Battle.update(dt): right after  this.fx.update(dt);   add   fxHostStep(this, dt);
 *    game.ts update(), right before  const slow = this.battle.slowmo > 0;  add
 *      if (this.battle.hitStop > 0) { this.battle.hitStop -= dt; return; }
 *    Whole frames are skipped, so runs stay repeatable, but the simulator's results change (the bot acts on a
 *    frame clock while the battle pauses, and freezeFrame looks at the particle load). Wire it last, or leave it
 *    out, and re-baseline the simulator after it.
 *
 * 3. updateUnit, first lines:
 *      const st = fxStep(u, dt);
 *      u.cdLeft -= dt; ...
 *      if (!(st & STEP_FROZEN)) u.atk = Math.max(0, u.atk - dt * 5);     (replaces the plain atk decay)
 *      if (st & STEP_EJECT) boltFx(this, u);
 *    z block, where z reaches 0:   if (u.z <= 0) { if (u.vz < -200) landFx(this, u); u.z = 0; u.vz = 0; }
 *    stun branch (before its return):   u.windupT = 0;
 *    gatling wind-down:   if (!attack) { u.spin = Math.max(0, u.spin - dt * 0.7); coolFx(this, u, dt); }
 *
 * 4. updateUnit, the attack line  `if (attack && t && u.cdLeft <= 0 && u.z < 6) this.attack(u, t);`  becomes
 *      if (attack && t && u.z < 6) {
 *        windFx(this, u, windTick(u, atkFx(u), true), dt);
 *        if (u.cdLeft <= 0) {
 *          u.windupT = 0;
 *          this.attack(u, t);
 *        }
 *      } else u.windupT = 0;
 *    and while dashing:   if (u.dash > 0) { u.windupT = 0; this.dashStep(u, dt); } else if ...
 *
 * 5. attack(), melee: replace the dodge check and the melee block with
 *      if (u.melee) {
 *        const f = meleeSwing(this, u);
 *        if (this.dodge(t, 0.6)) return meleeWhiff(this, u, t, f);
 *        this.damage(t, dmg, u.x, crit ? 1.8 : 1, crit, f.kill);
 *        meleeHit(this, u, t, f, crit);
 *        sfx.play(MELEE_SOUND[u.weapon] ?? 'slash', 0, { x: u.x, fox: u.side === 'fox' });
 *        if (u.evo?.waveEvery && ++u.swings % (u.awake ? 2 : u.evo.waveEvery) === 0) this.shockWave(u, t, dmg * 0.8, crit);
 *        return;
 *      }
 *    (meleeSwing sets u.atk to the contact frame and does the lunge; dodge() is still called exactly once.)
 *    attack(), grenade branch: add  throwFx(u);  next to its sfx 'throw'.
 *
 * 6. fire(): replace the two lines `if (!lite || u.swings++ ...) this.fx.muzzle(...)` and
 *    `const casing = ...; if (Math.random() < casing) this.fx.casing(...)` with
 *      gunFire(this, u, t, mx, my, worldAng, crit, Math.random());
 *    and delete `if (u.weapon === 'rifle') this.fx.beam(...)` (gunFire draws the rifle beam and vapour).
 *    The `lite` const stays for `if (lite) p.mini = true`. After makeProj:  projFx(p, u);
 *    (or put  weapon: u.weapon, boss: u.kind === 'boss', tracer: u.weapon === 'gatling' && u.strikeN % 3 === 0  in makeProj)
 *
 * 7. updateProj, bullet branch:
 *      } else if (p.target && this.dodge(p.target)) {
 *        shotDodged(this, p, p.target);
 *      } else if (p.target) {
 *        this.damage(p.target, p.dmg, p.sx, p.crit ? 1.8 : 1, p.crit);
 *        bulletHit(this, p, p.target);          (replaces fx.hit and the 'hit' sound)
 *      }
 *    rocket explode:   this.explode(p.x, p.y, p.aoe, p.dmg, p.side, p.y + 20, false, p.side === 'fox' ? 'dirty' : 'clean');
 *    rocket trail: replace  this.fx.trail(p.x - cos * 12, p.y - sin * 12)  with  rocketTrail(this.fx, p);
 *    grenade landing:  this.explode(p.tx, p.ty - 6, p.aoe, p.dmg, p.side, p.ty, p.mini, p.bounce ? 'carrot' : 'dirt', p.bounce ? 'BOOM!' : undefined);
 *    airstrike bomb:   this.explode(p.tx, p.ty - 8, p.aoe, p.dmg, 'rabbit', p.ty, false, 'carrot', 'KA-BOOM!');
 *
 * 8. explode(x, y, r, dmg, side, ground, mini = false, style: 'clean' | 'dirty' | 'dirt' | 'carrot' = 'clean', word?: string):
 *      damage(u, ..., 2.2, false, 'blast');  then, for a survivor that gets vz:  toss(u, Math.sign(u.x - x) || 1);
 *      this.fx.explosion(x, y, r, ground, style);   (the non-mini branch)
 *      after the kill loop:   if (!mini) blastFx(this, x, y, r, side, kills, style, word);
 *    updateSweep (carrot shell landing):  this.explode(p.x, p.y, p.aoe, p.dmg, p.side, p.y + 10, false, 'carrot');
 *    updateSweep trail: replace  this.fx.trail(...)  with  shellTrail(this.fx, p);
 *    sweep(): replace  this.fx.hit(o.x, chest, ...)  with  sweepHit(this, p, o);
 *
 * 9. damage(u, amount, fromX, push = 1, crit = false, how: KillHow = 'pop'): right after its `const dir = ...`:
 *      hurtFx(this, u, dealt, crit, push, dir);
 *    and at the end   if (u.hp <= 0) this.kill(u, dir, how);
 *    kill(u, dir, how: KillHow = 'pop'):   this.fx.death(u.x, u.y - u.z, snap, dir, how);
 *
 * 10. rail(): in the forEach, replace  this.fx.hit(o.x, ...)  with  railHit(this, o, i, crit && i === 0, nx);
 *     and pass 'zap' to damage:  this.damage(o, dmg * 0.85 ** i, mx, 1.6, crit && i === 0, 'zap');
 *     after the beam:  railDone(this, mx, my, mx + nx * len, my + ny * len, Math.min(inLine.length, max), crit);
 *
 * 11. shockWave(): add  waveFx(this, u);
 *
 * 12. startDash(): replace its sfx 'throw' and fx.dust lines with  dashStart(this, u);
 *     startRush() (the brute): add  dashStart(this, u);  (its 'rush' sound stays)
 *     dashStep(): add  dashTrail(this, u, dt);  after `u.face = u.dashDir;`; damage(o, ..., 2.4, false, 'bowl');
 *       after the vz lines for each unit hit:  dashHit(this, u, o, u.dashDir);   (the burst and 'bonk' stay)
 *       in the `if (u.dash <= 0)` block, before hitIds is cleared:  dashEnd(this, u, hit.size);
 *
 * 13. Optional extras from the design: count a barrage rocket's and its bomblets' kills (tag them with a salvo id)
 *     and call  this.fx.pow(x, y - 60, 'BOOM-BOOM!')  at 3 (cosmetic only). Pausing the aimAngle smoothing while a
 *     rifle winds up would move its muzzle (where the bullet starts), so it changes the fight: left out.
 *
 * Everything the drawing needs is read from those fields by field.ts and characters.ts (Look.wind, lean2, tilt,
 * hurt, smear, alt, heat, cycle ...): no draw code needs touching after the wiring.
 */
