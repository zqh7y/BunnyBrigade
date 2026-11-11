import { L, W } from '../theme';
import { circle, ellipse, hash, line, poly, rand, rr, starPath, type Ctx } from '../util';

/*
 * Small living details of the streets, drawn every frame by Street: townsfolk bunnies in windows and on
 * benches who peek out and cheer when a wave is cleared, a windmill and a hot-air balloon, a kite,
 * butterflies, floating pollen, fireflies, twinkling stars, a neon sign, a rooftop cat, manhole steam and
 * grass along the curb. Muted colours: they belong to the backdrop, not the battle.
 */

const INK_SOFT = '#4a4258';

/** A townsfolk bunny: in a window (peeks up from the sill) or sitting on a bench (always visible). */
export interface Watcher {
  x: number;
  y: number;
  w: number;
  h: number;
  seat: boolean;
  up: number; // 0 = hidden below the sill, 1 = fully up
  peek: boolean;
  t: number;
  fur: string;
}

const FURS = ['#f6f0e6', '#ece0cf', '#e2d4c6', '#f3e6e0'];

export const windowWatcher = (x: number, y: number, w: number, h: number): Watcher => ({ x, y, w, h, seat: false, up: 0, peek: false, t: rand(0.5, 4), fur: FURS[Math.floor(rand(0, FURS.length))] });
export const seatWatcher = (x: number, y: number): Watcher => ({ x, y, w: 0, h: 0, seat: true, up: 0, peek: false, t: rand(0.5, 4), fur: FURS[Math.floor(rand(0, FURS.length))] });

/** Peeking now and then (less during a fight), and all up and cheering when a wave or stage is cleared. */
export function updateWatcher(wt: Watcher, dt: number, cheer: boolean, fight: boolean) {
  wt.t -= dt;
  if (wt.t <= 0) {
    wt.t = rand(2, 6);
    wt.peek = !wt.peek && Math.random() < (fight ? 0.35 : 0.65);
  }
  const target = cheer ? 1 : wt.peek ? 0.8 : wt.seat ? 0.6 : 0;
  wt.up += (target - wt.up) * Math.min(1, dt * 6);
}

function bunnyHead(ctx: Ctx, x: number, y: number, fur: string, cheer: boolean, t: number) {
  const flop = cheer ? Math.sin(t * 14) * 0.25 : Math.sin(t * 2) * 0.08;
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = INK_SOFT;
  for (const s of [-1, 1]) {
    ellipse(ctx, x + s * 3.6, y - 10, 2.6, 7, s * (0.18 + flop));
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, x + s * 3.6, y - 10, 1.1, 4.6, s * (0.18 + flop));
    ctx.fillStyle = '#f3b8c6';
    ctx.fill();
  }
  circle(ctx, x, y, 7);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK_SOFT;
  if (cheer) {
    // happy closed eyes ^ ^
    ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * 2.6, y - 0.5, 1.5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ellipse(ctx, x, y + 3, 1.8, 1.4);
    ctx.fillStyle = '#c9506a';
    ctx.fill();
  } else {
    for (const s of [-1, 1]) {
      circle(ctx, x + s * 2.6, y - 0.5, 1.1);
      ctx.fill();
    }
  }
  for (const s of [-1, 1]) {
    circle(ctx, x + s * 4.4, y + 2.4, 1.4);
    ctx.fillStyle = 'rgba(240, 130, 150, 0.45)';
    ctx.fill();
  }
}

function arms(ctx: Ctx, x: number, y: number, fur: string, t: number) {
  const wave = Math.sin(t * 14) * 2;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK_SOFT;
  for (const s of [-1, 1]) {
    circle(ctx, x + s * 10, y - 6 + (s > 0 ? wave : -wave), 2.6);
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.stroke();
  }
}

export function drawWatcher(ctx: Ctx, wt: Watcher, time: number, cheer: boolean) {
  const t = time + wt.x * 0.01;
  if (wt.seat) {
    const hop = cheer ? Math.abs(Math.sin(t * 7)) * 6 : 0;
    const y = wt.y - hop;
    ellipse(ctx, wt.x, y - 6, 7, 8);
    ctx.fillStyle = wt.fur;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK_SOFT;
    ctx.stroke();
    bunnyHead(ctx, wt.x, y - 19, wt.fur, cheer, t);
    if (cheer) arms(ctx, wt.x, y - 17, wt.fur, t);
    return;
  }
  if (wt.up < 0.03) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(wt.x, wt.y, wt.w, wt.h);
  ctx.clip();
  const bob = cheer ? Math.abs(Math.sin(t * 8)) * 3 : 0;
  const hy = wt.y + wt.h + 9 - wt.up * wt.h * 0.62 - bob;
  bunnyHead(ctx, wt.x + wt.w / 2, hy, wt.fur, cheer, t);
  if (cheer) arms(ctx, wt.x + wt.w / 2, hy + 2, wt.fur, t);
  ctx.restore();
}

/** A far windmill whose sails turn with the wind. Drawn behind the front layer (the hills hide its foot). */
export function drawWindmill(ctx: Ctx, x: number, y: number, time: number, wind: number) {
  ctx.fillStyle = '#b8cbbc';
  poly(ctx, [x - 8, y + 60, x + 8, y + 60, x + 4, y + 4, x - 4, y + 4]);
  ctx.fill();
  poly(ctx, [x - 6, y + 6, x + 6, y + 6, x, y - 4]);
  ctx.fill();
  const a = time * (0.5 + wind * 1.4);
  ctx.save();
  ctx.translate(x, y + 4);
  ctx.rotate(a);
  ctx.fillStyle = '#c6d6c8';
  ctx.strokeStyle = '#a9bead';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    rr(ctx, 2, -3.5, 24, 7, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  circle(ctx, 0, 0, 2.6);
  ctx.fillStyle = '#a9bead';
  ctx.fill();
  ctx.restore();
}

/** A hot-air balloon drifting slowly across the sky. */
export function drawBalloon(ctx: Ctx, time: number) {
  const span = W + 260;
  const x = ((time * 6 + 160) % span) - 130;
  const y = 74 + Math.sin(time * 0.5) * 6;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#a58f78';
  ctx.lineWidth = 1;
  line(ctx, -9, 16, -5, 30);
  line(ctx, 9, 16, 5, 30);
  rr(ctx, -6, 29, 12, 9, 2);
  ctx.fillStyle = '#b98c62';
  ctx.fill();
  const env = () => {
    ctx.beginPath();
    ctx.moveTo(-10, 16);
    ctx.bezierCurveTo(-26, 2, -24, -26, 0, -27);
    ctx.bezierCurveTo(24, -26, 26, 2, 10, 16);
    ctx.closePath();
  };
  env();
  ctx.fillStyle = '#efc9a4';
  ctx.fill();
  ctx.save();
  env();
  ctx.clip();
  ctx.fillStyle = '#e39a7c';
  for (const sx of [-20, -6, 8]) ctx.fillRect(sx, -30, 7, 50);
  ctx.restore();
  env();
  ctx.strokeStyle = '#c98f74';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

/** A kite tugging on its string, its tail of bows rippling in the wind. */
export function drawKite(ctx: Ctx, time: number, wind: number, windDir: number) {
  const kx = 430 + Math.sin(time * 0.6) * 18 * (0.5 + wind) + windDir * 10;
  const ky = 76 + Math.sin(time * 1.1) * 9;
  const tilt = Math.sin(time * 0.9) * 0.25;
  ctx.strokeStyle = 'rgba(90, 80, 100, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(kx, ky + 12);
  ctx.quadraticCurveTo(kx - 60, ky + 140, 300, 300);
  ctx.stroke();
  // tail
  ctx.strokeStyle = '#8a7f96';
  ctx.beginPath();
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const px = kx - windDir * i * 7;
    const py = ky + 14 + i * 7 + Math.sin(time * 5 - i * 0.9) * 4;
    pts.push([px, py]);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = '#f0c86e';
  for (const [px, py] of pts.slice(2)) {
    poly(ctx, [px - 3, py - 2, px + 3, py + 2, px + 3, py - 2, px - 3, py + 2]);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(kx, ky);
  ctx.rotate(tilt);
  poly(ctx, [0, -14, 10, 0, 0, 14, -10, 0]);
  ctx.fillStyle = '#e8846a';
  ctx.fill();
  poly(ctx, [0, -14, 10, 0, 0, 0]);
  ctx.fillStyle = '#f0c86e';
  ctx.fill();
  poly(ctx, [0, 14, -10, 0, 0, 0]);
  ctx.fill();
  poly(ctx, [0, -14, 10, 0, 0, 14, -10, 0]);
  ctx.strokeStyle = '#b8644f';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** Butterflies fluttering around flower beds. */
export function drawButterflies(ctx: Ctx, spots: [number, number][], time: number) {
  const cols = ['#f7d36b', '#f5a8c8', '#a8d4f5'];
  spots.forEach(([cx, cy], i) => {
    const t = time + i * 2.3;
    const x = cx + Math.sin(t * 0.7) * 34 + Math.sin(t * 1.9) * 8;
    const y = cy + Math.sin(t * 1.1 + 1) * 14 - 10;
    const flap = 0.25 + Math.abs(Math.sin(t * 15)) * 0.75;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = cols[i % cols.length];
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 3.2 * flap, -1, 3.4 * flap, 4.2, s * 0.4);
      ctx.fill();
      ellipse(ctx, s * 2.4 * flap, 3, 2.4 * flap, 2.8, s * 0.6);
      ctx.fill();
    }
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(-0.6, -3, 1.2, 7);
    ctx.restore();
  });
}

/** Pollen and dust drifting in the sunlight. */
export function drawMotes(ctx: Ctx, time: number, wind: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  // three groups that pulse in turn: three fills instead of one per mote
  for (let grp = 0; grp < 3; grp++) {
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 2 + grp * 2.1);
    ctx.beginPath();
    for (let i = grp; i < 18; i += 3) {
      const x = (((hash(i) * W + time * 10 * (0.4 + wind) + Math.sin(time * 0.7 + i) * 12) % W) + W) % W;
      const y = 150 + hash(i + 5) * 190 + Math.sin(time * 0.9 + i * 1.3) * 10;
      const r = 1.2 + hash(i + 9) * 1.2;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Fireflies blinking around the lamps at dusk. */
export function drawFireflies(ctx: Ctx, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const bx = 30 + hash(i * 3) * (W - 60);
    const by = 230 + hash(i * 7) * 90;
    const x = bx + Math.sin(time * 0.6 + i * 1.7) * 30;
    const y = by + Math.sin(time * 0.9 + i) * 16;
    const a = Math.max(0, Math.sin(time * 1.6 + i * 2.1));
    if (a <= 0) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
    g.addColorStop(0, `rgba(230, 255, 140, ${0.8 * a})`);
    g.addColorStop(1, 'rgba(230, 255, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 8, y - 8, 16, 16);
  }
  ctx.restore();
}

/** Where the evening sky shows between the HUD and the rooftops of Old Town. */
const STARS: [number, number][] = [
  [86, 80],
  [100, 106],
  [214, 118],
  [262, 132],
  [312, 120],
  [400, 86],
  [440, 92],
  [452, 114],
];

/** The evening stars twinkle. */
export function drawTwinkles(ctx: Ctx, time: number) {
  ctx.save();
  ctx.fillStyle = '#fff8e6';
  STARS.forEach(([x, y], i) => {
    const a = 0.3 + 0.7 * Math.max(0, Math.sin(time * (1.2 + hash(i) * 1.5) + i * 2));
    ctx.globalAlpha = a;
    starPath(ctx, x, y, 2 + a * 2.5, 0.7, 4);
    ctx.fill();
  });
  ctx.restore();
}

/** The cafe sign in neon, buzzing and now and then flickering off for a moment. */
export function drawNeon(ctx: Ctx, x: number, y: number, w: number, h: number, time: number) {
  const off = hash(Math.floor(time * 9)) < 0.05;
  ctx.save();
  ctx.shadowColor = '#ff6fa8';
  ctx.shadowBlur = off ? 2 : 12 + 3 * Math.sin(time * 30);
  ctx.strokeStyle = off ? 'rgba(255, 140, 190, 0.35)' : '#ff8cc0';
  ctx.lineWidth = 2.4;
  rr(ctx, x - 3, y - 3, w + 6, h + 6, 8);
  ctx.stroke();
  ctx.restore();
}

/** A cat sitting on a rooftop, tail swishing. */
export function drawCat(ctx: Ctx, x: number, y: number, time: number) {
  const c = '#3d3550';
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const sw = Math.sin(time * 2.2) * 0.6;
  ctx.beginPath();
  ctx.moveTo(x + 6, y - 3);
  ctx.quadraticCurveTo(x + 16, y - 4 + sw * 4, x + 14 + sw * 6, y - 14);
  ctx.stroke();
  ellipse(ctx, x, y - 7, 7, 8);
  ctx.fill();
  circle(ctx, x - 2, y - 17, 5.5);
  ctx.fill();
  poly(ctx, [x - 7, y - 19, x - 6, y - 26, x - 2.5, y - 21]);
  ctx.fill();
  poly(ctx, [x + 3, y - 19, x + 2, y - 26, x - 1.5, y - 21]);
  ctx.fill();
  const blink = time % 4 < 0.15;
  ctx.fillStyle = '#ffe27a';
  if (!blink) {
    circle(ctx, x - 4.2, y - 17.5, 1.1);
    ctx.fill();
    circle(ctx, x + 0.2, y - 17.5, 1.1);
    ctx.fill();
  }
}

/** Steam curling out of a manhole. */
export function drawSteam(ctx: Ctx, x: number, y: number, time: number, wind: number, windDir: number) {
  for (let i = 0; i < 5; i++) {
    const a = (time * 0.35 + i / 5) % 1;
    const px = x + Math.sin(a * 5 + i) * 5 + a * 20 * wind * windDir;
    circle(ctx, px, y - a * 46, 5 + a * 10);
    ctx.fillStyle = `rgba(240, 238, 246, ${0.22 * (1 - a) * Math.min(1, a * 5)})`;
    ctx.fill();
  }
}

/** Tufts of grass (and the odd flower) along the lower curb, swaying in the wind. */
export function drawGrass(ctx: Ctx, time: number, wind: number, windDir: number, blade: string, flower: string) {
  const base = L.sceneBottom;
  // all the blades in one path and one stroke, the flowers in one fill
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = blade;
  ctx.beginPath();
  const tops: [number, number][] = [];
  for (let i = 0; i < 27; i++) {
    const x = 6 + i * 20 + hash(i * 1.7) * 8;
    const h = 9 + hash(i * 3.1) * 7;
    const sway = Math.sin(time * 2.1 + x * 0.05) * (2 + wind * 3) + windDir * wind * 3;
    for (const [dx, k] of [
      [-3, 0.8],
      [0, 1],
      [3, 0.75],
    ] as [number, number][]) {
      ctx.moveTo(x + dx, base);
      ctx.quadraticCurveTo(x + dx + sway * 0.3, base - h * k * 0.6, x + dx * 1.6 + sway, base - h * k);
    }
    if (hash(i * 5.3) < 0.25) tops.push([x + sway, base - h - 1]);
  }
  ctx.stroke();
  ctx.beginPath();
  for (const [fx, fy] of tops) {
    ctx.moveTo(fx + 2.4, fy);
    ctx.arc(fx, fy, 2.4, 0, Math.PI * 2);
  }
  ctx.fillStyle = flower;
  ctx.fill();
}
