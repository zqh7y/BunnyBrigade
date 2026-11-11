import type { WeaponId } from '../data';
import type { FoxStyle, RabbitStyle } from '../looks';
import { COLOR } from '../theme';
import { circle, easeInOutCubic, ellipse, lerp, poly, rr, starPath, type Ctx } from '../util';
import { drawWeapon } from './weapons';

/*
 * Rabbits and foxes as cartoon characters in a three-quarter view: mostly side-on, with the face turned a
 * little toward the viewer, so both eyes show, the muzzle points forward and the front of the chest is visible.
 * Every soldier is drawn from its own Style (looks.ts): fur, markings, ears, clothes, hat and accessory.
 * Drawn facing right, then mirrored for facing left; (0, 0) is between the feet.
 */

const INK = COLOR.ink;
const OUT = 2.3; // visible outline width
const SHADE = 'rgba(70, 45, 100, 0.14)';
const FLASH_RABBIT = '#ffbcbc';
const FLASH_FOX = '#ffffff';

// ------------------------------------------------------------------ sticker rendering

export type PathFn = (c: Ctx) => void;
interface Overlay {
  path: PathFn;
  color: string;
}
interface Part {
  path: PathFn;
  fill: string;
  over?: Overlay[];
}

/**
 * Draws a group of shapes as one "sticker": a single outline around the whole group,
 * then the flat fills, then overlays clipped to each shape (shading, patterns, clothes).
 * Overlapping parts merge into one clean silhouette with no inner lines.
 */
function sticker(ctx: Ctx, parts: Part[], out = OUT) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = out * 2;
  for (const p of parts) {
    p.path(ctx);
    ctx.stroke();
  }
  for (const p of parts) {
    p.path(ctx);
    ctx.fillStyle = p.fill;
    ctx.fill();
    if (!p.over?.length) continue;
    // one clip per part for all its overlays (clipping is the expensive bit)
    ctx.save();
    ctx.clip();
    for (const o of p.over) {
      o.path(ctx);
      ctx.fillStyle = o.color;
      ctx.fill('evenodd');
    }
    ctx.restore();
  }
}

const box =
  (x: number, y: number, w: number, h: number): PathFn =>
  (c) => {
    c.beginPath();
    c.rect(x, y, w, h);
  };
const oval =
  (x: number, y: number, rx: number, ry: number, rot = 0): PathFn =>
  (c) =>
    ellipse(c, x, y, rx, ry, rot);
const shape =
  (pts: number[]): PathFn =>
  (c) =>
    poly(c, pts);
/** Everything except a circle: clipped to a round part, it shades the side away from the light. */
const crescent =
  (cx: number, cy: number, r: number): PathFn =>
  (c) => {
    c.beginPath();
    c.rect(cx - 80, cy - 80, 160, 160);
    c.moveTo(cx + r, cy);
    c.arc(cx, cy, r, 0, Math.PI * 2);
  };

function stroke(ctx: Ctx, color: string, width: number, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  circle(ctx, x, y, r);
  ctx.fillStyle = color;
  ctx.fill();
}

// ------------------------------------------------------------------ cached bodies

/*
 * A character's body is detailed but barely changes: only its expression (calm / fierce / shouting, knocked out).
 * Each expression of each look is painted once into a small picture at the resolution it is shown at and reused
 * every frame. Ears and tails are pictures of their own, turned live, so they swing smoothly; feet and the weapon
 * arm are drawn live. Short moments (a blink, a hit flash) are painted directly instead of filling the cache.
 */
const SPRITES = new Map<string, HTMLCanvasElement>();
const MAX_SPRITES = 600;
const styleIds = new WeakMap<object, number>();
let nextStyleId = 1;
function idOf(o: object) {
  let id = styleIds.get(o);
  if (!id) {
    id = nextStyleId++;
    styleIds.set(o, id);
  }
  return id;
}

/** Draws paint() (covering x0..x0+w, y0..y0+h in body units) through the picture cache. */
function cached(ctx: Ctx, key: string, x0: number, y0: number, w: number, h: number, paint: (k: Ctx) => void) {
  if (typeof document === 'undefined') return paint(ctx);
  const m = ctx.getTransform();
  const res = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * 2) / 2));
  const full = `${key}|${res}`;
  let img = SPRITES.get(full);
  if (img) {
    // most recently used last, so the oldest picture is the first to go
    SPRITES.delete(full);
    SPRITES.set(full, img);
  } else {
    img = document.createElement('canvas');
    img.width = Math.ceil(w * res);
    img.height = Math.ceil(h * res);
    const k = img.getContext('2d')!;
    k.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    paint(k);
    SPRITES.set(full, img);
    if (SPRITES.size > MAX_SPRITES) SPRITES.delete(SPRITES.keys().next().value!);
  }
  ctx.drawImage(img, x0, y0, img.width / res, img.height / res);
}

/** Draws a part (an ear, a tail) turned by rot about (x, y): from the cache, or painted directly when live. */
function turned(ctx: Ctx, x: number, y: number, rot: number, live: boolean, key: string, box: [number, number, number, number], paint: (k: Ctx) => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (live) paint(ctx);
  else cached(ctx, key, box[0], box[1], box[2], box[3], paint);
  ctx.restore();
}

/** Weapons whose wind-up makes the face shout (the big ones). */
const SHOUT_WIND: ReadonlySet<WeaponId> = new Set<WeaponId>(['bat', 'rocket', 'cannon']);
/** The facial expression a pose shows: 0 calm, 1 fierce (aiming / fighting), 2 shouting (just attacked, or winding up a big one). */
const expression = (p: Look) =>
  (p.atk > 0.3 || ((p.wind ?? 0) > 0.5 && SHOUT_WIND.has(p.weapon))) && !p.ko ? 2 : p.atk > 0.25 || p.aim > 0.6 ? 1 : 0;
/** x knocked out, h squinting from a hit, b blinking, o open. */
const eyesOf = (p: Look) => (p.ko ? 'x' : (p.hurt ?? 0) > 0.3 ? 'h' : p.blink ? 'b' : 'o');
/** Short moments are painted directly instead of filling the picture cache: a hit flash, a blink, a flinch, charring. */
const paintsLive = (p: Look) => p.flash || p.blink || (p.hurt ?? 0) > 0.3 || !!p.char;
/** The wind-up eased out: the pose arrives fast, then holds until the strike. */
const windPose = (p: Look) => (p.atk > 0 ? 0 : 1 - (1 - (p.wind ?? 0)) ** 2);
const CHAR = '#3b3040';

/** Squint chevrons for a flinch: the near eye ">" and the far eye "<". */
function squint(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  stroke(ctx, INK, 2, [x1 - 2.8, y1 - 2.2, x1 + 1.6, y1, x1 - 2.8, y1 + 2.2]);
  stroke(ctx, INK, 1.8, [x2 + 2, y2 - 1.9, x2 - 1.2, y2, x2 + 2, y2 + 1.9]);
}

// ------------------------------------------------------------------ shared pose

export interface Look {
  face: number; // 1 = facing right, -1 = facing left
  walk: number; // walk / idle clock
  moving: boolean;
  aim: number; // 0 = relaxed carry, 1 = aiming at a target
  aimAngle: number; // radians in the facing direction, positive = down
  atk: number; // 1 right after an attack, falls to 0
  flash: boolean; // just got hit
  blink: boolean;
  hop: number; // height above the ground
  weapon: WeaponId;
  level: number; // weapon level
  noShadow?: boolean;
  hatless?: boolean;
  ko?: boolean;
  anim?: number; // weapon animation: gatling barrel spin, riot ram charge (> 0 while charging)
  sprint?: number; // running to the next street: > 0 leans into it (>= 1: legs a blur), < 0 skids leaning back
  crouch?: number; // 0..1 down on one knee (shooters aiming)
  lean?: number; // a personal tilt of the body
  // attack animation (all optional: a pose without them is drawn exactly as before)
  wind?: number; // 0..1 through the wind-up before a strike
  lean2?: number; // how far that wind-up leans back (rad; negative leans into it)
  contact?: number; // arm progress of the melee contact frame
  tilt?: number; // body spring rotation (+ forward)
  hurt?: number; // 0..1 flinching from a hit: squint, ears pinned back
  char?: boolean; // charred by a blast: a dark silhouette with wide white eyes
  smear?: string; // swing smear colour
  alt?: boolean; // the alternate strike: backhand, the other fist, the other tube
  fox?: boolean;
  kind?: string; // fox kind (thug, runner and ninja knives move differently)
  heat?: number; // gatling barrel heat 0..1
  cycle?: number; // rifle bolt dip 0..1
}

/** How far a kneeling rabbit's body drops (Battle.fire places the muzzle with the same number). */
export const CROUCH = 7;

/** Where guns are held and how far the muzzle is from the grip (used to place muzzle flashes). */
export const GUN_HAND = { x: 9, y: -19 };
export const ROCKET_HAND = { x: 2, y: -18 };
/** Heavy guns carried low at the shoulder. */
export const SHOULDER: ReadonlySet<WeaponId> = new Set<WeaponId>(['rocket', 'barrage', 'cannon', 'gatling']);
/** Muzzle distance from the grip, in body units (weapon tip x times GUN_SCALE). */
export const BARREL: Partial<Record<WeaponId, number>> = { pistol: 17, smg: 24, rifle: 35, rocket: 29, gatling: 32, railgun: 42, barrage: 26, cannon: 34 };
/** [kick back, muzzle climb] per shot. */
const RECOIL: Partial<Record<WeaponId, [number, number]>> = {
  pistol: [5, 0.45], // a cartoon muzzle flip
  rocket: [7, 0.16],
  rifle: [7, 0.34],
  smg: [3, 0.12],
  railgun: [9, 0.3],
  gatling: [2, 0.05],
  barrage: [7, 0.16],
  cannon: [9, 0.22],
};
const GUN_SCALE = 0.88;

/** Bounding box of a standing rabbit, used to fit it inside grid tiles. */
export const RABBIT_BOX = [-19, -76, 22, 5] as const;

interface Gait {
  s: number;
  c: number;
  mv: number;
  bob: number;
}

function gait(p: Look): Gait {
  const mv = p.moving ? 1 : 0;
  const s = Math.sin(p.walk);
  const c = Math.cos(p.walk);
  return { s, c, mv, bob: mv ? Math.abs(s) * 2.4 : Math.sin(p.walk * 0.5) * 0.6 };
}

/** Sprinting and charging lean into the run; skidding leans back. */
const chargeLean = (p: Look) => (p.sprint ? (p.sprint > 0 ? 0.3 * p.sprint : -0.28) : p.weapon === 'ram' && (p.anim ?? 0) > 0 ? 0.16 : 0);

/** Cartoon sprint: the feet are a spinning wheel of smears under the body. */
function legWheel(ctx: Ctx, spin: number, color: string) {
  ctx.save();
  ctx.translate(-2, -7);
  ellipse(ctx, 0, 0, 12, 8);
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha /= 0.45;
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 11 - i * 3, 7.5 - i * 2, 0, -spin - i * 2.1, -spin - i * 2.1 + 1.5);
    ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const a = -spin * 1.3 + i * Math.PI;
    sticker(ctx, [{ path: (k) => ellipse(k, Math.cos(a) * 8, Math.sin(a) * 5, 5.2, 3.1), fill: color }], 1.8);
  }
  ctx.restore();
}

function shadow(ctx: Ctx, rx: number, hop: number) {
  const k = 1 - Math.min(0.45, hop / 70);
  ellipse(ctx, 0, 0, rx * k, 4.6 * k);
  ctx.fillStyle = 'rgba(25, 15, 35, 0.22)';
  ctx.fill();
}

/** Two big cartoon feet: the far one in shade, a step behind. Kneeling: the near foot forward, the far one back. */
function feet(ctx: Ctx, g: Gait, near: string, far: string, size = 1, crouch = 0) {
  const fa = 5 + g.s * 5 * g.mv + crouch * 4;
  const fay = -Math.max(0, g.c) * 4 * g.mv;
  const fb = -3 - g.s * 5 * g.mv - crouch * 6;
  const fby = -Math.max(0, -g.c) * 4 * g.mv;
  sticker(ctx, [
    { path: oval(fb + 1, fby - 3, 6 * size, 3.4 * size), fill: far },
    { path: oval(fa, fay - 2.8, 6.4 * size, 3.6 * size), fill: near },
  ]);
}

function paw(ctx: Ctx, x: number, y: number, color: string) {
  sticker(ctx, [{ path: (k) => circle(k, x, y, 4.3), fill: color }], 2);
}

/** A melee swing from its wound-up angle to the contact frame (fast, ease-out), a small overshoot, then back to rest. */
function swing(pr: number, c: number, from: number, to: number, rest: number) {
  if (pr < c) return lerp(from, to, 1 - (1 - pr / c) ** 3);
  if (pr < c + 0.25) return to + (to - from) * 0.08 * Math.sin(((pr - c) / 0.25) * Math.PI);
  return lerp(to, rest, easeInOutCubic(Math.min(1, (pr - c - 0.25) / (0.75 - c))));
}

/** How strong the smear frame is: full while the blade travels, gone 0.3 of the move after contact. */
const smearAlpha = (pr: number, c: number) => (pr < c ? 0.55 : pr < c + 0.3 ? 0.55 * (1 - (pr - c) / 0.3) : 0);

/**
 * The smear frame: a see-through band trailing the weapon, from where the swing started (at most 1.8 rad back,
 * so a big overhead slam stays a sweep and never becomes a disc) to where the weapon is now. One fill.
 */
function smear(ctx: Ctx, from: number, a: number, r0: number, r1: number, color: string, alpha: number) {
  if (alpha <= 0.02 || Math.abs(a - from) < 0.05) return;
  const start = a - Math.max(-1.8, Math.min(1.8, a - from));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(0, 0, r1, start, a, a < start);
  ctx.arc(0, 0, r0, a, start, a >= start);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A 4-point glint (scope, blade edge, warhead) that grows and shrinks through the wind-up. */
function glint(ctx: Ctx, x: number, y: number, size: number, color: string) {
  if (size < 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  starPath(ctx, x, y, size, size * 0.28, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Short speed lines behind a punch or a thrust. */
function streaks(ctx: Ctx, x: number, y: number, len: number, gap: number, n: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const yy = y + (i - (n - 1) / 2) * gap;
    ctx.moveTo(x, yy);
    ctx.lineTo(x - len, yy);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Arm + weapon. Guns blend from a lowered carry pose (swinging while walking) to aiming at the target, and kick
 * back on each shot. Melee weapons each have their own swing: wound up during Look.wind, then from the contact
 * frame (a smear wedge behind the blade) through a follow-through back to rest.
 */
function arm(ctx: Ctx, p: Look, pawColor: string) {
  const w = p.weapon;
  const pr = 1 - p.atk;
  const swinging = p.atk > 0;
  const we = windPose(p);
  const tint = p.smear ?? '#ffffff';
  ctx.save();

  if (w === 'fist') {
    // a one-two: high jab, then body blow
    ctx.translate(10, -17);
    const c = p.contact || 0.25;
    const py = p.alt ? 2 : -3;
    let jab = p.moving ? Math.sin(p.walk) * 2 : 0;
    let y = 0;
    if (swinging) {
      jab = pr < c ? 13 * (1 - (1 - pr / c) ** 3) : 13 * (1 - easeInOutCubic((pr - c) / (1 - c)));
      y = py;
      if (pr < 0.4) streaks(ctx, jab - 5, y, 6, 2.6, 3, '#ffffff', 0.7 * (1 - pr / 0.4));
    } else if (we > 0) {
      jab = -5 * we;
      y = py * we;
    }
    paw(ctx, jab, y, pawColor);
  } else if (w === 'shield' || w === 'ram') {
    // a shove: the shield punches forward, top edge first, holds, comes back
    ctx.translate(10, -17);
    const c = p.contact || 0.2;
    const push = swinging ? (pr < c ? 12 * (1 - (1 - pr / c) ** 3) : pr < 0.4 ? 12 : 12 * (1 - easeInOutCubic((pr - 0.4) / 0.6))) : -4 * we;
    ctx.translate(push, p.moving ? Math.sin(p.walk) * 1.2 : 0);
    if (swinging && pr < 0.6) ctx.rotate(0.15 * Math.min(1, pr / c) * Math.min(1, (0.6 - pr) / 0.2));
    if ((p.anim ?? 0) > 0) {
      ctx.translate(5, 0); // charging: shield thrust forward
      ctx.rotate(-0.12);
    }
    paw(ctx, 0, 0, pawColor);
    ctx.scale(0.9, 0.9);
    drawWeapon(ctx, w, p.level, 2.3);
  } else if (w === 'knife' || w === 'bat' || w === 'gunblade') {
    ctx.translate(10, -17);
    const rest = p.moving ? 0.55 + Math.sin(p.walk) * 0.25 : 0.2;
    const kind = p.fox ? p.kind : undefined;
    let c = 0.3;
    let from = -1.4;
    let a: number;
    let tx: number;
    let r0 = 10;
    let r1 = 30;
    let thrust = false;
    const bump = (cc: number) => Math.sin(Math.min(1, pr / (cc + 0.25)) * Math.PI);
    if (w === 'bat') {
      // the brute's overhead club slam: raised behind the head, down into the road, held, then back
      c = p.contact || 0.22;
      from = -2.6;
      const to = 1.25;
      r0 = 16;
      r1 = 36;
      a = swinging ? (pr < c ? lerp(from, to, 1 - (1 - pr / c) ** 3) : pr < 0.55 ? to : lerp(to, rest, easeInOutCubic((pr - 0.55) / 0.45))) : lerp(rest, from, we);
      tx = swinging ? 5 * (pr < 0.55 ? 1 : 1 - (pr - 0.55) / 0.45) : -3 * we;
    } else if (w === 'gunblade') {
      // a wide slash, forehand then backhand; the trigger kick pulls the arm back on wave swings
      c = p.contact || 0.28;
      from = p.alt ? 1.0 : -2.0;
      const to = p.alt ? -1.6 : 1.1;
      r0 = 12;
      r1 = 44;
      a = swinging ? swing(pr, c, from, to, rest) : lerp(rest, from, we);
      tx = (swinging ? 7 * bump(c) : -4 * we) - 4 * (p.anim ?? 0);
    } else if (kind === 'thug') {
      // a hunched shank: the blade held low and reversed, then a straight thrust (no arc)
      c = p.contact || 0.25;
      from = 1.3;
      thrust = true;
      a = swinging ? (pr < 0.5 ? 0.05 : lerp(0.05, rest, (pr - 0.5) / 0.5)) : lerp(rest, from, we);
      tx = swinging ? 12 * bump(c) : -6 * we;
    } else {
      // rabbit: forehand / backhand; runner: a low rising swipe; ninja: a high dash-slash
      let to: number;
      if (kind === 'runner') [from, to, c] = [1.0, -0.8, p.contact || 0.3];
      else if (kind === 'ninja') [from, to, c] = [-2.2, 1.3, p.contact || 0.2];
      else [from, to, c] = p.alt ? [1.2, -0.7, p.contact || 0.3] : [-1.4, 1.0, p.contact || 0.3];
      a = swinging ? swing(pr, c, from, to, rest) : lerp(rest, from, we);
      tx = swinging ? 7 * bump(c) : -4 * we;
    }
    ctx.translate(tx, 0);
    if (swinging && !thrust) {
      const sa = smearAlpha(pr, c) * (w === 'bat' ? 0.9 : 1);
      smear(ctx, from, a, r0, r1, tint, sa);
      if (w === 'gunblade') smear(ctx, from, a, r0, 26, '#ffffff', sa * 0.8);
    }
    if (thrust && swinging && pr < 0.4) streaks(ctx, -6, 0, 8, 4, 2, tint, 1 - pr / 0.4);
    ctx.rotate(a);
    ctx.save();
    ctx.scale(0.9, 0.9);
    drawWeapon(ctx, w, p.level, 2.3);
    ctx.restore();
    paw(ctx, 0, 0, pawColor);
    if (we > 0) {
      if (kind === 'ninja') glint(ctx, 28, -1.5, 3 + 2 * we, '#c9b8ff');
      else if (w === 'gunblade') glint(ctx, (6 + 30 * we) * 0.9, -1.5, 3, '#d8fdff');
    }
  } else if (w === 'grenade') {
    // overhand throw: the paw goes up beside the head with the grenade showing, comes over and forward to the
    // release, then follows through down. The paw has no arm to swing, so the hand itself travels.
    const c = p.contact || 0.3;
    const idle = p.moving ? Math.sin(p.walk) * 0.3 : 0;
    // where the hand is: carry (8, -18), cocked by the ear (-9, -31), released forward (14, -14)
    let hx: number;
    let hy: number;
    if (!swinging) [hx, hy] = [lerp(8, -9, we), lerp(-18, -31, we)];
    else if (pr < c) {
      const e = 1 - (1 - pr / c) ** 3;
      [hx, hy] = [lerp(-9, 14, e), lerp(-31, -14, e)];
    } else {
      const e = easeInOutCubic((pr - c) / (1 - c));
      [hx, hy] = [lerp(14, 8, e), lerp(-14, -18, e)];
    }
    ctx.translate(hx, hy);
    const r = swinging ? (pr < c ? lerp(-2.6, 0.9, 1 - (1 - pr / c) ** 3) : lerp(0.9, 0, easeInOutCubic((pr - c) / (1 - c)))) : lerp(idle, -2.6, we);
    if (swinging && pr < c + 0.3) {
      // the throw's smear: from beside the head, over the top, to the release point
      ctx.save();
      ctx.globalAlpha *= smearAlpha(pr, c) * 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-9 - hx, -31 - hy);
      ctx.quadraticCurveTo(4 - hx, -42 - hy, 0, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(r);
    if (!swinging || pr > 0.7) {
      ctx.save();
      ctx.translate(3, -2);
      ctx.scale(0.85, 0.85);
      drawWeapon(ctx, 'grenade', p.level, 2.3);
      ctx.restore();
    }
    paw(ctx, 3, 0, pawColor);
  } else {
    const shoulder = SHOULDER.has(w);
    const hand = shoulder ? ROCKET_HAND : GUN_HAND;
    const carry = 0.55 + (p.moving ? Math.sin(p.walk) * 0.12 : 0);
    const [kickMax, climb] = RECOIL[w] ?? [4.5, 0.3];
    const boss = p.kind === 'boss';
    const heat = p.heat ?? 0;
    let rot = lerp(carry, p.aimAngle, p.aim) - p.atk * climb * (boss ? 0.5 : 1);
    if (w === 'smg') rot += (p.alt ? 0.06 : -0.06) * p.atk; // chatter: every other shot kicks the other way
    rot += (p.cycle ?? 0) * 0.12; // the rifle dips as the bolt is worked
    ctx.translate(hand.x, hand.y);
    if (w === 'gatling' && heat > 0) ctx.translate(0, Math.sin((p.anim ?? 0) * 3) * 0.8 * heat);
    ctx.rotate(rot);
    ctx.translate(-kickMax * p.atk * (boss ? 0.4 : 1), 0);
    ctx.save();
    ctx.scale(GUN_SCALE, GUN_SCALE);
    // the railgun's coils light up one by one as it charges; the gatling's barrels glow with heat
    drawWeapon(ctx, w, p.level, 2.3, p.anim ?? 0, w === 'railgun' ? we : heat);
    if (we > 0) {
      const pulse = Math.sin(we * Math.PI);
      if (w === 'rifle') glint(ctx, 14, -11, 3 + 4 * pulse, '#ffffff'); // the scope catches the light
      else if (w === 'rocket' && p.fox) {
        // the homemade rocket's lit fuse at the back of the tube
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        circle(ctx, -21, -3, 2.5 + Math.abs(Math.sin(p.walk * 9 + we * 30)) * 2.5);
        ctx.fillStyle = '#ffb347';
        ctx.fill();
        ctx.restore();
      } else if (w === 'rocket') glint(ctx, 30, -2.5, 2 + 3 * pulse, '#ffffff');
      else if (w === 'barrage') glint(ctx, 27, p.alt ? -8.5 : 0.5, 2 + 3 * pulse, '#ffffff');
      else if (w === 'cannon') {
        // the carrot cannon's muzzle glows hotter and hotter
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.6 * we;
        circle(ctx, 40, -2, 4 + 8 * we);
        ctx.fillStyle = '#ffb02e';
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    if (w !== 'pistol') paw(ctx, shoulder ? 11 : 13, 3, pawColor); // support hand
    paw(ctx, 1, 3, pawColor);
  }
  ctx.restore();
}

/** Weapons held in one paw leave the other one free: it hangs behind the body. */
const oneHanded = (w: WeaponId) => w === 'fist' || w === 'knife' || w === 'bat' || w === 'gunblade' || w === 'shield' || w === 'ram' || w === 'grenade' || w === 'pistol';

/** A cartoon eye: white, coloured iris, pupil and a shine. sx squashes it for the far eye. */
function eye(ctx: Ctx, x: number, y: number, rx: number, ry: number, iris: string, look: number, sx = 1) {
  ellipse(ctx, x, y, rx * sx, ry);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const ix = x + look * rx * 0.35 * sx;
  ellipse(ctx, ix, y + ry * 0.12, rx * 0.68 * sx, ry * 0.7);
  ctx.fillStyle = iris;
  ctx.fill();
  ellipse(ctx, ix + 0.3, y + ry * 0.12, rx * 0.38 * sx, ry * 0.42);
  ctx.fillStyle = INK;
  ctx.fill();
  dot(ctx, ix + rx * 0.25 * sx, y - ry * 0.3, Math.max(0.7, rx * 0.26), '#ffffff');
}

/** Closed, knocked-out or blinking eyes. */
function shutEye(ctx: Ctx, x: number, y: number, w: number, ko: boolean) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  if (ko) {
    ctx.moveTo(x - w, y - w);
    ctx.lineTo(x + w, y + w);
    ctx.moveTo(x + w, y - w);
    ctx.lineTo(x - w, y + w);
  } else {
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + w * 0.6, x + w, y);
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ rabbit

const earPath =
  (bx: number, by: number, rot: number, inner: boolean, len = 1): PathFn =>
  (k) => {
    k.save();
    k.translate(bx, by);
    k.rotate(rot);
    if (inner) ellipse(k, 0.6, -13 * len, 2.3, 9 * len);
    else ellipse(k, 0, -12 * len, 5.4, 13.8 * len);
    k.restore();
  };
/** The top third of an ear (for dark ear tips). */
const earTip =
  (bx: number, by: number, rot: number, len = 1): PathFn =>
  (k) => {
    k.save();
    k.translate(bx, by);
    k.rotate(rot);
    k.beginPath();
    k.rect(-8, -30 * len, 16, 11 * len);
    k.restore();
  };

/** Helmet colours from A-class up: gold, crimson (S), violet (SSS). */
const HELMET_TOP: Record<number, [string, string]> = { 5: ['#f4b93b', '#c98a1c'], 6: ['#ef3f5c', '#a8213a'], 7: ['#c94bf0', '#7f22b5'] };

/** Helmet; origin = centre of the brim. Gains goggles, a star, a stripe, then gold / crimson / violet as the rabbit's class rises. */
export function drawHelmet(ctx: Ctx, rLevel: number, flash = false) {
  const top = HELMET_TOP[Math.min(7, rLevel)];
  const col = flash ? '#ffffff' : top ? top[0] : COLOR.rabbitHelmet;
  const dark = flash ? '#ffffff' : top ? top[1] : COLOR.rabbitHelmetDark;
  const over: Overlay[] = [];
  if (rLevel === 4 || rLevel >= 6) over.push({ path: box(-1, -20, 6, 20), color: rLevel >= 7 ? '#ffd84a' : rLevel === 6 ? '#ffffff' : '#e04848' });
  over.push({ path: crescent(4, -6, 15), color: 'rgba(20, 30, 80, 0.2)' });
  sticker(ctx, [
    {
      path: (k) => {
        k.beginPath();
        k.ellipse(0, 0, 16, 15.5, 0, Math.PI, 0);
        k.closePath();
      },
      fill: col,
      over,
    },
    // the brim sticks out more at the front, where the face is turned
    { path: (k) => rr(k, -16.5, -2.4, 36, 5, 2.5), fill: dark },
  ]);
  ctx.beginPath();
  ctx.arc(1, 0, 10.5, Math.PI * 1.18, Math.PI * 1.42);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  if (rLevel >= 2) {
    sticker(ctx, [{ path: (k) => rr(k, 4, -10.5, 13, 7.5, 3.5), fill: '#33394a' }], 1.6);
    rr(ctx, 6, -9, 9, 4.6, 2);
    ctx.fillStyle = '#8fdcff';
    ctx.fill();
  }
  if (rLevel >= 3) {
    starPath(ctx, -5, -7, 4, 1.8, 5);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/** Clothes on the rabbit's body (clipped to it): what shows is the front-and-side of the torso. */
function rabbitClothes(s: RabbitStyle, f: (c: string) => string): Overlay[] {
  const c = f(s.cloth);
  const c2 = f(s.cloth2);
  const dark = 'rgba(30, 20, 45, 0.22)';
  switch (s.outfit) {
    case 'overalls':
      return [
        { path: box(-20, -17, 40, 30), color: c },
        { path: (k) => rr(k, -1, -25, 13, 12, 2), color: c },
        { path: shape([-1, -25, 1.5, -25, -6, -28, -9, -27]), color: c },
        { path: oval(1.5, -21.5, 1.6, 1.6), color: c2 },
        { path: oval(9.5, -21.5, 1.6, 1.6), color: c2 },
        { path: box(-20, -9, 40, 1.6), color: dark },
      ];
    case 'vest':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: box(3.5, -40, 5, 60), color: c2 },
        { path: (k) => rr(k, 8.5, -15, 6, 5, 1), color: dark },
        { path: (k) => rr(k, -6, -15, 6, 5, 1), color: dark },
        { path: box(-20, -6, 40, 2), color: dark },
      ];
    case 'jacket':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: box(5.3, -40, 1.6, 34), color: c2 },
        { path: box(-20, -8, 40, 3), color: c2 },
        { path: crescent(4, -16, 12), color: dark },
      ];
    case 'hoodie':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: (k) => rr(k, 0, -14, 13, 7, 2.5), color: c2 },
        { path: box(5, -27, 1.2, 7), color: '#f2efe8' },
        { path: box(9, -27, 1.2, 6), color: '#f2efe8' },
      ];
    case 'tank':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: shape([-2, -30, 5.5, -21, 12, -30]), color: f(s.fur) },
        { path: box(-20, -6, 40, 20), color: f('#4a5470') },
      ];
  }
}

export function drawRabbit(ctx: Ctx, p: Look & { style: RabbitStyle; rLevel: number }) {
  const s = p.style;
  const f = (c: string) => (p.char ? CHAR : p.flash ? FLASH_RABBIT : c);
  const fur = f(s.fur);
  const g = gait(p);
  const we = windPose(p);
  const hurt = p.hurt ?? 0;
  ctx.save();
  ctx.scale(p.face, 1);
  if (!p.noShadow) shadow(ctx, 15, p.hop);
  const sprint = p.sprint ?? 0;
  if (sprint >= 0.5) legWheel(ctx, p.walk, fur);
  const crouch = p.crouch ?? 0;
  if (sprint < 0.5) feet(ctx, sprint < 0 ? { ...g, mv: 0 } : g, fur, f(s.shade), 1, crouch);
  // a kneeling rifle sinks a little lower as it holds its breath
  ctx.translate(0, -g.bob - p.hop + crouch * CROUCH + (p.weapon === 'rifle' ? 2 * crouch * we : 0));
  ctx.rotate(g.mv * 0.06 - p.atk * 0.04 + chargeLean(p) + crouch * 0.05 + (p.lean ?? 0) - (p.lean2 ?? 0) * we + (p.tilt ?? 0));

  // ears: streaming back when sprinting, flung forward when skidding; a lop ear hangs down behind the head;
  // pinned back when hurt, tipped back with a wind-up
  const flop = g.mv ? Math.sin(p.walk + 1.3) * 0.13 : Math.sin(p.walk * 0.5) * 0.05;
  const stream = Math.sin(p.walk * 1.7) * 0.06;
  const tilt = s.ears === 'tilt' ? -0.4 : 0;
  const back = hurt * 0.5 + Math.max(0, p.lean2 ?? 0) * we;
  let e1 = (sprint > 0 ? -1.25 + stream : sprint < 0 ? 0.35 : -0.38 + flop + tilt) - back;
  const e2 = (sprint > 0 ? -0.95 + stream : sprint < 0 ? 0.75 : 0.05 + flop * 0.7 + tilt * 0.8) - back * 0.8;
  let len1 = 1;
  if (s.ears === 'lop' && !sprint) {
    e1 = -2.35 + flop * 0.6;
    len1 = 0.85;
  }
  const live = paintsLive(p);
  const id = idOf(s);
  turned(ctx, -5, -46, e1, live, `e${id}|${len1}`, EAR_BOX, (k) => rabbitEar(k, s, f, f(s.shade), len1));
  turned(ctx, 8, -47, e2, live, `E${id}`, EAR_BOX, (k) => rabbitEar(k, s, f, fur, 1));

  const expr = expression(p);
  const eyes = eyesOf(p);
  const paw = oneHanded(p.weapon);
  const body = (k: Ctx) => rabbitBody(k, s, f, eyes, expr, p.hatless, p.rLevel, paw);
  if (live) body(ctx);
  else cached(ctx, `r${id}|${eyes}|${expr}|${p.hatless ? 1 : 0}|${p.rLevel}|${paw ? 1 : 0}`, -24, -66, 52, 70, body);
  arm(ctx, p, fur);
  ctx.restore();
}

/** Where an ear picture sits around its base (the ear points up from there). */
const EAR_BOX: [number, number, number, number] = [-9, -31, 18, 37];

/** One rabbit ear, pointing straight up from its base at (0, 0). */
function rabbitEar(ctx: Ctx, s: RabbitStyle, f: (c: string) => string, fill: string, len: number) {
  const over: Overlay[] = [{ path: earPath(0, 0, 0, true, len), color: f(s.inner) }];
  if (s.mark === 'tips') over.push({ path: earTip(0, 0, 0, len), color: f(s.markColor) });
  sticker(ctx, [{ path: earPath(0, 0, 0, false, len), fill, over }]);
}

/** Everything of a rabbit but its ears, feet and weapon arm, with one expression. */
function rabbitBody(ctx: Ctx, s: RabbitStyle, f: (c: string) => string, eyes: string, expr: number, hatless: boolean | undefined, rLevel: number, paw: boolean) {
  const fur = f(s.fur);
  const headOver: Overlay[] = [{ path: crescent(7, -39, 15.5), color: SHADE }];
  if (s.mark === 'patch') headOver.unshift({ path: oval(6.5, -36, 7.5, 6.8, -0.2), color: f(s.markColor) });
  if (s.mark === 'spots') headOver.unshift({ path: (k) => { circle(k, -7, -40, 3.4); k.moveTo(-6 + 2.4, -31); k.arc(-6, -31, 2.4, 0, Math.PI * 2); }, color: f(s.markColor) });

  const parts: Part[] = [];
  if (s.outfit === 'hoodie') parts.push({ path: oval(-9, -30, 8.5, 7.5, 0.4), fill: f(s.cloth) });
  if (paw) parts.push({ path: oval(-10, -16, 4.2, 4.2), fill: f(s.shade) }); // the free back paw
  parts.push({ path: oval(-12.5, -11, 5.4, 5.4), fill: f(s.belly) }); // cotton tail
  parts.push({ path: oval(0.5, -15, 12.5, 13.5), fill: fur, over: [...rabbitClothes(s, f), { path: crescent(4, -19, 13), color: SHADE }] });
  parts.push({ path: oval(3, -36, 15.5, 14.5), fill: fur, over: headOver });
  parts.push({ path: oval(12.2, -29.6, 7.6, 5.8), fill: f(s.belly) }); // the muzzle, turned a little toward us
  sticker(ctx, parts);

  // the face
  const ko = eyes === 'x';
  const fierce = expr > 0;
  const look = fierce ? 0.5 : 0.15;
  if (eyes === 'h') squint(ctx, 6.5, -35.5, 15.6, -36);
  else if (eyes !== 'o') {
    shutEye(ctx, 6.5, -35.5, 2.8, ko);
    shutEye(ctx, 15.6, -36, 2, ko);
  } else {
    eye(ctx, 6.5, -35.6, 3.9, 4.9, s.eye, look);
    eye(ctx, 15.6, -36.1, 3.2, 4.4, s.eye, look, 0.68);
  }
  // brows: determined while fighting, relaxed otherwise
  ctx.lineCap = 'round';
  const bt = fierce ? 1.8 : -0.4;
  stroke(ctx, INK, 2.1, [2.6, -41.3 - bt * 0.4, 9.6, -40.2 + bt * 0.6]);
  stroke(ctx, INK, 1.8, [13.4, -40.6 + bt * 0.5, 17.4, -41.2 - bt * 0.2]);
  // nose, buck teeth and mouth
  rr(ctx, 15.7, -28.7, 3.8, 3.6, 1.1);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  stroke(ctx, INK, 1, [17.6, -28.6, 17.6, -25.4]);
  if (expr === 2) {
    ellipse(ctx, 13.4, -26.6, 2.6, 2.3);
    ctx.fillStyle = '#5a1f33';
    ctx.fill();
    ellipse(ctx, 13.4, -25.6, 1.5, 0.9);
    ctx.fillStyle = '#ff8fa8';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(11.6, -28.6);
    ctx.quadraticCurveTo(13.6, -26.8, 15.7, -27.9);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(17, -32.8);
  ctx.quadraticCurveTo(19.5, -33.2, 19.8, -31.5);
  ctx.quadraticCurveTo(19, -29.6, 17.5, -30.4);
  ctx.closePath();
  ctx.fillStyle = f('#ff7f9f');
  ctx.fill();
  ellipse(ctx, 4.2, -29.4, 3.5, 2);
  ctx.fillStyle = 'rgba(255, 110, 140, 0.32)';
  ctx.fill();

  rabbitAccessory(ctx, s, f);

  if (!hatless) {
    ctx.save();
    ctx.translate(3.5, -45);
    drawHelmet(ctx, rLevel, f('#000000') === FLASH_RABBIT);
    ctx.restore();
  }
}

function rabbitAccessory(ctx: Ctx, s: RabbitStyle, f: (c: string) => string) {
  const a = f(s.accColor);
  switch (s.acc) {
    case 'scarf': {
      const flap = 0;
      sticker(
        ctx,
        [
          { path: shape([-7, -25, -16, -20 + flap, -15, -14 + flap, -6, -21]), fill: a },
          { path: (k) => rr(k, -9, -27, 22, 6, 3), fill: a },
        ],
        1.6,
      );
      stroke(ctx, 'rgba(255,255,255,0.45)', 1.2, [-6, -24, 11, -24]);
      break;
    }
    case 'bandana':
      sticker(ctx, [{ path: shape([-2, -26.5, 13, -26.5, 6, -17]), fill: a }], 1.6);
      dot(ctx, 3.5, -24, 0.9, '#ffffff');
      dot(ctx, 8, -23.5, 0.9, '#ffffff');
      dot(ctx, 6, -20.5, 0.9, '#ffffff');
      break;
    case 'tags':
      ctx.beginPath();
      ctx.moveTo(0, -25.5);
      ctx.lineTo(6.5, -17.5);
      ctx.lineTo(12, -25.5);
      ctx.strokeStyle = '#b8bcc6';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      sticker(ctx, [{ path: (k) => rr(k, 4.6, -18.5, 4, 5.2, 1.2), fill: f('#d8dce4') }], 1);
      break;
    case 'bandaid':
      ctx.save();
      ctx.translate(2.5, -30.5);
      ctx.rotate(-0.5);
      sticker(ctx, [{ path: (k) => rr(k, -4.5, -1.6, 9, 3.2, 1.4), fill: f('#f2c9a0') }], 0.9);
      dot(ctx, -1, 0, 0.5, '#c99a70');
      dot(ctx, 1, 0, 0.5, '#c99a70');
      ctx.restore();
      break;
    case 'freckles':
      for (const [x, y] of [
        [2, -30.6],
        [4.5, -29.4],
        [6.6, -30.8],
      ]) dot(ctx, x, y, 0.75, f('#b9785a'));
      break;
    case 'glasses':
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      circle(ctx, 6.5, -35.6, 5.3);
      ctx.stroke();
      ellipse(ctx, 15.6, -36.1, 3.4, 4.9);
      ctx.stroke();
      stroke(ctx, INK, 1.5, [11.8, -36.6, 12.3, -36.6]);
      stroke(ctx, INK, 1.4, [1.2, -35.8, -6, -37]);
      break;
  }
}

// ------------------------------------------------------------------ fox

/** Fox hat; origin = centre of the brim. Each gang role has its own kind of hat. */
export function drawFoxHat(ctx: Ctx, s: FoxStyle, flash = false) {
  const c = flash ? '#ffffff' : s.hatColor;
  const band = flash ? '#ffffff' : s.band;
  switch (s.hat) {
    case 'bowler':
      sticker(ctx, [
        { path: (k) => { k.beginPath(); k.arc(1, -1, 11, Math.PI, 0); k.closePath(); }, fill: c, over: [{ path: box(-12, -5, 26, 3), color: band }] },
        { path: oval(1, 0, 15.5, 3.4), fill: c },
      ]);
      break;
    case 'flatcap':
      sticker(ctx, [
        { path: oval(1, -4.5, 14, 6.5), fill: c, over: [{ path: crescent(3, -7, 12), color: 'rgba(0,0,0,0.18)' }] },
        { path: oval(12, -0.8, 8, 2.8, 0.1), fill: c },
      ]);
      stroke(ctx, 'rgba(0,0,0,0.25)', 1.2, [-6, -6, 8, -8]);
      break;
    case 'beanie':
      sticker(ctx, [
        { path: (k) => { k.beginPath(); k.ellipse(1, -2, 13.5, 13, 0, Math.PI, 0); k.closePath(); }, fill: c },
        { path: (k) => rr(k, -13, -4, 28, 6, 3), fill: band },
        { path: oval(1, -16, 3.6, 3.6), fill: band },
      ]);
      break;
    case 'cap':
      sticker(ctx, [
        { path: (k) => { k.beginPath(); k.ellipse(0, 0, 13, 12, 0, Math.PI, 0); k.closePath(); }, fill: c, over: [{ path: box(-2, -14, 4, 14), color: band }] },
        { path: oval(14, -0.5, 9, 2.6, 0.08), fill: c },
      ]);
      break;
    case 'sweatband':
      // a terry band round the forehead
      sticker(ctx, [{ path: (k) => rr(k, -12, -6, 26, 6, 3), fill: c, over: [{ path: box(-12, -4, 26, 1.6), color: band }] }]);
      break;
    case 'headband':
      // a ninja's band, its two long tails streaming back
      sticker(ctx, [
        { path: (k) => { k.beginPath(); k.moveTo(-11, -4); k.quadraticCurveTo(-21, -4, -29, 2); k.quadraticCurveTo(-20, -1, -11, 1); k.closePath(); }, fill: c },
        { path: (k) => { k.beginPath(); k.moveTo(-11, -2); k.quadraticCurveTo(-19, 3, -25, 11); k.quadraticCurveTo(-17, 3, -10, 2); k.closePath(); }, fill: c },
        { path: (k) => rr(k, -12, -6, 26, 6.5, 3), fill: c, over: [{ path: oval(5, -2.8, 3, 2), color: band }] },
      ]);
      break;
    case 'aviator':
      sticker(ctx, [
        { path: (k) => { k.beginPath(); k.ellipse(1, 1, 14.5, 14, 0, Math.PI, 0); k.closePath(); }, fill: c },
        { path: (k) => rr(k, -14, -1, 7, 12, 3), fill: c },
      ]);
      sticker(ctx, [
        { path: oval(5, -6, 4.6, 3.8), fill: '#8fdcff' },
        { path: oval(13.5, -6, 3.6, 3.6), fill: '#8fdcff' },
      ], 1.5);
      stroke(ctx, '#2b2b33', 2.2, [-13, -5, 0.5, -6]);
      break;
    default: {
      // fedora (the boss's has a feather)
      const parts: Part[] = [];
      if (s.kind === 'boss') parts.push({ path: (k) => { k.beginPath(); k.moveTo(-7, -4); k.quadraticCurveTo(-18, -16, -7, -24); k.quadraticCurveTo(-9, -13, -4, -5); k.closePath(); }, fill: flash ? '#ffffff' : '#ff5a4f' });
      parts.push({ path: oval(1, 0, 17, 3.8), fill: c });
      parts.push({
        path: (k) => {
          k.beginPath();
          k.moveTo(-8.5, -0.5);
          k.lineTo(-7.5, -11.5);
          k.quadraticCurveTo(1, -16.5, 10, -11.5);
          k.lineTo(11, -0.5);
          k.closePath();
        },
        fill: c,
        over: [{ path: box(-12, -5, 25, 3.8), color: band }],
      });
      sticker(ctx, parts);
    }
  }
  ctx.beginPath();
  ctx.moveTo(-5, -9);
  ctx.quadraticCurveTo(-1, -12, 4, -12);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Clothes on the fox's body (clipped to it). */
function foxClothes(s: FoxStyle, f: (c: string) => string): Overlay[] {
  const c = f(s.cloth);
  const c2 = f(s.cloth2);
  const shirt = f('#f2efe8');
  const dark = 'rgba(20, 12, 30, 0.25)';
  switch (s.outfit) {
    case 'tank':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: shape([-1, -31, 6, -22, 13, -31]), color: f(s.cream) },
        { path: box(-20, -6, 40, 20), color: f('#3f4552') },
      ];
    case 'stripes':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: (k) => { k.beginPath(); for (let y = -27; y < -6; y += 5) k.rect(-20, y, 40, 2.4); }, color: c2 },
        { path: box(-20, -6, 40, 20), color: f('#3f4552') },
      ];
    case 'suit':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        ...(s.kind === 'boss' ? [{ path: (k: Ctx) => { k.beginPath(); for (let x = -12; x < 14; x += 4) k.rect(x, -40, 0.9, 60); }, color: 'rgba(255,255,255,0.18)' }] : []),
        { path: shape([1.5, -31, 8, -17, 14.5, -31]), color: shirt },
        { path: shape([7, -27, 9.2, -27, 10, -15, 8.1, -12.5, 6.4, -15]), color: c2 },
        { path: oval(3.6, -11, 1.1, 1.1), color: dark },
        { path: oval(3.4, -6.5, 1.1, 1.1), color: dark },
      ];
    case 'track':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: box(5.6, -40, 1.4, 36), color: shirt },
        { path: box(10, -40, 2.2, 36), color: c2 },
        { path: box(-9, -40, 2.2, 36), color: c2 },
        { path: box(-20, -5, 40, 3), color: c2 },
      ];
    case 'leather':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: shape([2, -32, 7.5, -8, 14, -32]), color: f(s.cream) },
        { path: shape([1, -32, 3.6, -32, 7.5, -12, 5.6, -10]), color: 'rgba(255,255,255,0.18)' },
      ];
    case 'jersey':
      // a runner's vest with two racing stripes, and shorts
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: box(-20, -24, 40, 3.2), color: c2 },
        { path: box(-20, -18.5, 40, 2), color: c2 },
        { path: box(-20, -6, 40, 20), color: f('#2b2b33') },
      ];
    case 'ninja':
      // a dark wrap with a fold across the chest and a coloured belt
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: shape([-4, -33, 2, -33, 14, -14, 9, -12]), color: 'rgba(255,255,255,0.12)' },
        { path: box(-20, -9, 40, 4), color: c2 },
      ];
    case 'aviator':
      return [
        { path: box(-20, -40, 40, 60), color: c },
        { path: box(5.6, -40, 1.6, 34), color: dark },
        { path: (k) => rr(k, 8, -15, 6, 6, 1), color: dark },
        { path: box(-20, -6, 40, 3), color: dark },
      ];
  }
}

export function drawFox(ctx: Ctx, p: Look & { style: FoxStyle }) {
  const s = p.style;
  const f = (c: string) => (p.char ? CHAR : p.flash ? FLASH_FOX : c);
  const dark = f(s.dark);
  const g = gait(p);
  const we = windPose(p);
  const hurt = p.hurt ?? 0;
  ctx.save();
  ctx.scale(p.face, 1);
  if (!p.noShadow) shadow(ctx, 16, p.hop);
  feet(ctx, g, dark, f('#241a1c'), 1.05);
  ctx.translate(0, -g.bob - p.hop);
  ctx.rotate(g.mv * 0.06 - p.atk * 0.04 + chargeLean(p) + (p.lean ?? 0) - (p.lean2 ?? 0) * we + (p.tilt ?? 0));
  // the bushy tail sways (bristling when hurt); the back ear flicks now and then, and flattens when hurt
  const sway = Math.sin(p.walk * (g.mv ? 1 : 0.6)) * (g.mv ? 0.16 : 0.08) - hurt * 0.25;
  const flick = Math.max(0, Math.sin(p.walk * 0.37)) ** 8 * 0.25;
  const live = paintsLive(p);
  const id = idOf(s);
  turned(ctx, -8, -14, -1.05 + sway, live, `t${id}`, TAIL_BOX, (k) => foxTail(k, f(s.fur), f(s.cream)));
  turned(ctx, -5, -47, -flick - hurt * 0.4, live, `b${id}`, FOX_EAR_BOX, (k) => sticker(k, [{ path: foxEar, fill: f(s.shade), over: [{ path: box(-8, -19, 16, 9), color: dark }] }]));

  const eyes = eyesOf(p);
  const snarl = expression(p) === 2;
  const paw = oneHanded(p.weapon);
  const body = (k: Ctx) => foxBody(k, s, f, eyes, snarl, p.hatless, paw);
  if (live) body(ctx);
  else cached(ctx, `f${id}|${eyes}|${snarl ? 1 : 0}|${p.hatless ? 1 : 0}|${paw ? 1 : 0}`, -31, -78, 64, 82, body);
  arm(ctx, p, dark);
  ctx.restore();
}

/** Where the tail and back-ear pictures sit around their bases. */
const TAIL_BOX: [number, number, number, number] = [-31, -14, 35, 27];
const FOX_EAR_BOX: [number, number, number, number] = [-11, -21, 21, 28];

/** The bushy tail, pointing left from its base at (0, 0), with its cream tip. */
function foxTail(ctx: Ctx, fur: string, cream: string) {
  const tail: PathFn = (k) => {
    k.beginPath();
    k.moveTo(0, -5);
    k.quadraticCurveTo(-11, -12.5, -23, -5.5);
    k.quadraticCurveTo(-28.5, 0, -23, 5.5);
    k.quadraticCurveTo(-11, 11, 0, 5);
    k.closePath();
  };
  sticker(ctx, [{ path: tail, fill: fur, over: [{ path: box(-32, -12, 12, 24), color: cream }] }]);
}

/** The back ear, from its base at (0, 0). */
const foxEar: PathFn = (k) => poly(k, [-7, 4, -4, -17, 6, -1]);

/** Everything of a fox but its tail, back ear, feet and weapon arm, with one expression. */
function foxBody(ctx: Ctx, s: FoxStyle, f: (c: string) => string, eyes: string, snarling: boolean, hatless: boolean | undefined, paw: boolean) {
  const fur = f(s.fur);
  const cream = f(s.cream);
  const dark = f(s.dark);
  const frontEar: PathFn = (k) => poly(k, [8, -48, 15.5, -63, 18, -43]);
  // the white cheek ruff: spiky fur at the back of the jaw
  const ruff: PathFn = (k) => poly(k, [-8, -38, -16, -31, -10, -30, -14, -24, -6, -26, -4, -22, 4, -27]);
  const snout: PathFn = (k) => {
    k.beginPath();
    k.moveTo(8, -45);
    k.quadraticCurveTo(21, -40, 27.5, -34);
    k.quadraticCurveTo(22, -26.5, 9, -27);
    k.closePath();
  };
  const headOver: Overlay[] = [{ path: crescent(6, -41.5, 14), color: 'rgba(130, 40, 0, 0.16)' }];
  if (s.mask) headOver.unshift({ path: oval(9, -39.5, 10.5, 4.6, -0.12), color: f(s.dark) });
  const parts: Part[] = [
    { path: frontEar, fill: fur, over: [{ path: shape([10.5, -46, 15, -57, 16.5, -44]), color: f('#f2b3a4') }, { path: box(10, -64, 10, 8), color: dark }] },
  ];
  if (paw) parts.push({ path: oval(-10, -16, 4.4, 4.4), fill: dark }); // the free back paw
  parts.push({ path: oval(0, -16, 13, 14), fill: fur, over: [...foxClothes(s, f), { path: crescent(3, -20, 14), color: 'rgba(0,0,0,0.2)' }] });
  parts.push({ path: ruff, fill: cream });
  parts.push({ path: oval(2, -38, 13.5, 13.5), fill: fur, over: headOver });
  parts.push({ path: snout, fill: fur, over: [{ path: box(4, -33.2, 30, 12), color: cream }] });
  if (s.outfit === 'aviator') parts.push({ path: oval(1, -25, 12, 4.4), fill: f(s.cloth2) }); // fleece collar
  sticker(ctx, parts);

  // the face: sly half-lidded eyes, angry brows, a toothy grin
  const ko = eyes === 'x';
  const snarl = snarling;
  const lid = f(s.mask ? s.dark : s.fur);
  if (eyes === 'h' && s.acc !== 'shades') squint(ctx, 6, -39.5, 14.6, -40.3);
  else if (eyes !== 'o' && eyes !== 'h') {
    shutEye(ctx, 6, -39.5, 2.8, ko);
    shutEye(ctx, 14.6, -40.3, 2, ko);
  } else if (s.acc === 'shades') {
    sticker(ctx, [{ path: (k) => rr(k, 1, -43.5, 10, 6.5, 2.5), fill: f('#1d1a24') }, { path: (k) => rr(k, 12.6, -44, 6.5, 6.5, 2.4), fill: f('#1d1a24') }], 1.2);
    stroke(ctx, 'rgba(255,255,255,0.55)', 1.2, [3, -42, 6, -42]);
    stroke(ctx, INK, 1.4, [11, -41, 12.6, -41]);
  } else {
    eye(ctx, 6, -39.6, 3.9, 3.9, s.eye, 0.5);
    eye(ctx, 14.6, -40.3, 3.1, 3.5, s.eye, 0.5, 0.7);
    // upper lids: the sly look (the top half of each eye, covered in fur)
    for (const [x, y, rx, ry] of [
      [6, -39.6, 4.6, 4.6],
      [14.6, -40.3, 2.6, 4],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y - 0.8, rx, ry, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = lid;
      ctx.fill();
      stroke(ctx, INK, 1.5, [x - rx * 0.95, y - 0.8, x + rx * 0.95, y - 1.4]);
    }
  }
  if (s.acc === 'eyepatch') {
    stroke(ctx, INK, 1.5, [-6, -45, 12, -38]);
    sticker(ctx, [{ path: oval(6, -39.6, 4.8, 4.5), fill: f('#1d1a24') }], 1);
  }
  // brows
  stroke(ctx, f(s.dark), 2.6, [1.5, -46.5, 10.2, -43.4]);
  stroke(ctx, f(s.dark), 2.2, [13, -45, 18, -44]);
  // nose
  ellipse(ctx, 27, -34.2, 3.2, 2.6);
  ctx.fillStyle = INK;
  ctx.fill();
  dot(ctx, 26.2, -35.1, 0.85, 'rgba(255,255,255,0.7)');
  // mouth
  if (snarl) {
    ctx.beginPath();
    ctx.moveTo(12, -30.5);
    ctx.quadraticCurveTo(19, -26, 25, -30);
    ctx.quadraticCurveTo(19, -24.5, 12, -30.5);
    ctx.fillStyle = '#5a1f33';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    for (const x of [15, 21.5]) {
      poly(ctx, [x - 1.3, -29.6, x + 1.3, -29.6, x, -27.2]);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(11.5, -31.2);
    ctx.quadraticCurveTo(18, -28, 24.5, -30.6);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const tooth = s.acc === 'goldtooth' ? f('#ffcf3f') : '#ffffff';
    poly(ctx, [17.4, -29.6, 19.8, -29.8, 18.6, -27.2]);
    ctx.fillStyle = tooth;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  foxAccessory(ctx, s, f);

  if (!hatless) {
    ctx.save();
    ctx.translate(1.5, -48);
    drawFoxHat(ctx, s, f('#000000') === FLASH_FOX);
    ctx.restore();
  }
}

function foxAccessory(ctx: Ctx, s: FoxStyle, f: (c: string) => string) {
  switch (s.acc) {
    case 'scar':
      stroke(ctx, f('#f2a0a0'), 1.8, [3, -46, 9.5, -33]);
      for (const [x, y] of [
        [4.6, -42.5],
        [6.6, -38.5],
        [8.4, -35],
      ]) stroke(ctx, f('#f2a0a0'), 1.1, [x - 2, y + 0.6, x + 2, y - 0.6]);
      break;
    case 'earring':
      ctx.beginPath();
      ctx.arc(-8, -45, 2.6, 0.3, Math.PI * 2 - 0.3);
      ctx.strokeStyle = f('#ffcf3f');
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    case 'chain':
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        dot(ctx, -2 + u * 14, -25.5 + Math.sin(u * Math.PI) * 6, 1.4, f('#ffcf3f'));
      }
      break;
    case 'toothpick':
      stroke(ctx, f('#e8c88a'), 1.4, [22.5, -30.4, 30, -33]);
      break;
  }
  if (s.kind === 'boss') {
    // the boss always wears gold
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      dot(ctx, -3 + u * 16, -25 + Math.sin(u * Math.PI) * 7, 1.6, f('#ffcf3f'));
    }
  }
}
