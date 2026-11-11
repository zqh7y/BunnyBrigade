import { COLOR, FONT } from './theme';

export type Ctx = CanvasRenderingContext2D;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/*
 * Cosmetic randomness (sparks, smoke, words, wobbles) has its own generator, separate from Math.random, so
 * adding or tuning an effect never shifts a gameplay roll (dodges, crits, spawns): the seeded headless
 * simulator then gives the same results before and after any effects change.
 */
let fs = 0x9e3779b9;
/** Cosmetic random number in a..b (never use it for anything that changes the fight). */
export const frand = (a: number, b: number) => {
  fs ^= fs << 13;
  fs ^= fs >>> 17;
  fs ^= fs << 5;
  return a + ((fs >>> 0) / 4294967296) * (b - a);
};
/** Cosmetic pick from a list. */
export const fpick = <T>(arr: readonly T[]): T => arr[Math.floor(frand(0, arr.length))];
/** True with chance p, from the cosmetic generator. */
export const fchance = (p: number) => frand(0, 1) < p;
/** Restarts the cosmetic generator (tests and the simulator, to make effect runs repeatable). */
export const fseed = (s: number) => {
  fs = s >>> 0 || 0x9e3779b9;
};
export const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Repeatable pseudo-random 0..1 from a number (for twinkles and streaks that need no stored state). */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Rounded rectangle path. */
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

export function poly(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function starPath(ctx: Ctx, x: number, y: number, outer: number, inner: number, points: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Fill the current path, then outline it in the ink colour. */
export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, lw = 2.2, stroke: string = COLOR.ink) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export interface TextOpts {
  color?: string;
  outline?: string;
  align?: CanvasTextAlign;
  lw?: number;
}

/** Chunky outlined game text. */
export function label(ctx: Ctx, s: string, x: number, y: number, size: number, o: TextOpts = {}) {
  ctx.font = `${Math.round(size)}px ${FONT}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = o.lw ?? Math.max(2.5, size * 0.2);
  ctx.strokeStyle = o.outline ?? COLOR.ink;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? COLOR.white;
  ctx.fillText(s, x, y);
}

/** Small deterministic random generator, so the scenery looks the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
