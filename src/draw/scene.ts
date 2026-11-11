import { FONT, L, W } from '../theme';
import { circle, ellipse, line, poly, rr, seeded, type Ctx } from '../util';
import { drawCarrot } from './icons';

/*
 * The static part of each street, cached in two layers: the sky (clouds drift over it) and the front
 * (hills, buildings, sidewalk and road, transparent above the skyline). Trees, birds, smoke and the other
 * moving bits are drawn every frame by street.ts on top of the front layer.
 *
 * The backdrop uses a muted, slightly faded palette with thin edges in a darker tone of each colour
 * (no black ink), so it stays calm and the outlined, saturated characters and effects pop in front of it.
 */

type PathFn = (c: Ctx) => void;
type Fill = string | CanvasGradient;

function shape(ctx: Ctx, path: PathFn, fill: Fill, edge?: string, lw = 1.6) {
  path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (!edge) return;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

const rect =
  (x: number, y: number, w: number, h: number): PathFn =>
  (c) => {
    c.beginPath();
    c.rect(x, y, w, h);
  };

const rrect =
  (x: number, y: number, w: number, h: number, r: number): PathFn =>
  (c) =>
    rr(c, x, y, w, h, r);

function vgrad(ctx: Ctx, y0: number, y1: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

/** Overlapping circles with a soft darker underside. */
export function blobs(ctx: Ctx, pts: [number, number, number][], fill: string, shade: string) {
  // one path per colour: the circles merge into one shape, and it is a single fill call each
  ctx.beginPath();
  for (const [x, y, r] of pts) {
    ctx.moveTo(x + r, y + r * 0.22);
    ctx.arc(x, y + r * 0.22, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.beginPath();
  for (const [x, y, r] of pts) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

export function cloud(ctx: Ctx, x: number, y: number, s: number, fill = '#fbfcfb', shade = 'rgba(185, 208, 222, 0.6)') {
  blobs(
    ctx,
    [
      [x, y, 16 * s],
      [x + 20 * s, y - 10 * s, 21 * s],
      [x + 44 * s, y - 2 * s, 17 * s],
      [x - 16 * s, y + 4 * s, 11 * s],
      [x + 60 * s, y + 5 * s, 10 * s],
    ],
    fill,
    shade,
  );
}

function windowFrame(ctx: Ctx, x: number, y: number, w: number, h: number, lit = false, frame = '#efe6d5') {
  shape(ctx, rrect(x - 3, y - 3, w + 6, h + 6, 2), frame, '#c9baa1', 1.2);
  shape(ctx, rrect(x, y, w, h, 1.5), lit ? vgrad(ctx, y, y + h, '#ffe9b0', '#f7c46e') : vgrad(ctx, y, y + h, '#b9d4dd', '#93b3c0'));
  ctx.fillStyle = frame;
  ctx.fillRect(x + w / 2 - 1.2, y, 2.4, h);
  ctx.fillRect(x, y + h / 2 - 1.2, w, 2.4);
  if (!lit) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    poly(ctx, [x + 2, y + h * 0.42, x + w * 0.3, y + 2, x + w * 0.44, y + 2, x + 2, y + h * 0.62]);
    ctx.fill();
  }
  ctx.fillStyle = '#d9c9ae';
  ctx.fillRect(x - 5, y + h + 3, w + 10, 3);
}

function awning(ctx: Ctx, x: number, y: number, w: number, h: number, c1: string, c2: string, edge: string) {
  const n = Math.max(2, Math.round(w / 19));
  const sw = w / n;
  ctx.fillStyle = 'rgba(70, 40, 40, 0.14)';
  ctx.fillRect(x + 4, y + h + 6, w - 8, 9);
  const path: PathFn = (c) => {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    for (let i = n - 1; i >= 0; i--) c.arc(x + i * sw + sw / 2, y + h, sw / 2, 0, Math.PI);
    c.closePath();
  };
  path(ctx);
  ctx.fillStyle = c1;
  ctx.fill();
  ctx.save();
  path(ctx);
  ctx.clip();
  ctx.fillStyle = c2;
  for (let i = 1; i < n; i += 2) ctx.fillRect(x + i * sw, y, sw, h + sw);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(x, y, w, 4);
  ctx.restore();
  path(ctx);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

function hills(ctx: Ctx, g: number, near: string, far: string) {
  ctx.fillStyle = far;
  ctx.beginPath();
  ctx.moveTo(0, 252);
  ctx.bezierCurveTo(110, 222, 210, 246, 300, 246);
  ctx.bezierCurveTo(390, 246, 460, 222, 540, 236);
  ctx.lineTo(W, g);
  ctx.lineTo(0, g);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = near;
  ctx.beginPath();
  ctx.moveTo(0, 282);
  ctx.bezierCurveTo(140, 266, 260, 286, 360, 280);
  ctx.bezierCurveTo(440, 276, 500, 286, 540, 280);
  ctx.lineTo(W, g);
  ctx.lineTo(0, g);
  ctx.closePath();
  ctx.fill();
}

function farTrees(ctx: Ctx, pts: [number, number, number][], color: string) {
  ctx.fillStyle = color;
  for (const [tx, ty, r] of pts) {
    circle(ctx, tx, ty, r);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- street 0: Carrot Market (farm town, midday)

function market(ctx: Ctx, x: number, g: number) {
  const w = 148;
  const h = 150;
  const top = g - h;
  shape(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(x, g);
      c.lineTo(x, top + 10);
      c.lineTo(x + 18, top + 10);
      c.lineTo(x + 18, top);
      c.lineTo(x + w - 18, top);
      c.lineTo(x + w - 18, top + 10);
      c.lineTo(x + w, top + 10);
      c.lineTo(x + w, g);
      c.closePath();
    },
    vgrad(ctx, top, g, '#cf9282', '#bb7666'),
    '#98594d',
  );
  ctx.strokeStyle = 'rgba(130, 60, 50, 0.13)';
  ctx.lineWidth = 1;
  for (let y = top + 18; y < top + 50; y += 8) line(ctx, x + 3, y, x + w - 3, y);
  shape(ctx, rrect(x + 14, top - 5, w - 28, 8, 2), '#a8685b', '#8a5146');
  shape(ctx, rrect(x + 22, top + 14, w - 44, 26, 6), '#f4ead8', '#c9b391');
  ctx.font = `17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d4703a';
  ctx.fillText('CARROTS', x + w / 2 + 9, top + 28);
  drawCarrot(ctx, x + 38, top + 27, 0.55, 0.4);
  awning(ctx, x - 4, top + 52, w + 8, 16, '#d98670', '#f2e8d8', '#b9654f');

  const wy = top + 86;
  shape(ctx, rrect(x + 10, wy - 4, 84, g - wy + 2, 3), '#eadac0', '#c8b090');
  shape(ctx, rrect(x + 14, wy, 76, g - wy - 6, 2), vgrad(ctx, wy, g, '#b6d1db', '#8fb0bd'));
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  poly(ctx, [x + 22, wy + 3, x + 36, wy + 3, x + 22, g - 8, x + 15, g - 8, x + 15, wy + 16]);
  ctx.fill();
  shape(ctx, rrect(x + 102, wy - 10, 36, g - wy + 10, 3), '#7d5c4a', '#5f4436');
  shape(ctx, rrect(x + 108, wy - 4, 24, 16, 2), '#a9c6cf');
  circle(ctx, x + 131, g - 20, 2.2);
  ctx.fillStyle = '#e8c66b';
  ctx.fill();
}

function cottage(ctx: Ctx, x: number, g: number) {
  const w = 114;
  const h = 104;
  const top = g - h;
  shape(ctx, rrect(x + 78, top - 40, 14, 30, 2), '#a77364', '#86594d');
  shape(ctx, (c) => poly(c, [x - 8, top + 4, x + w / 2, top - 44, x + w + 8, top + 4]), vgrad(ctx, top - 44, top, '#8f9bb0', '#77849c'), '#5f6b82');
  shape(ctx, rect(x, top, w, h), vgrad(ctx, top, g, '#f0e4c8', '#e2d2b0'), '#c2ad88');
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(x + 1, top + 1, w - 2, 6);
  circle(ctx, x + w / 2, top - 15, 7);
  ctx.fillStyle = '#a9c6cf';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#efe6d5';
  ctx.stroke();
  windowFrame(ctx, x + 14, top + 28, 30, 28);
  shape(ctx, rrect(x + 9, top + 62, 40, 6, 2), '#9a6a4a', '#7a503a', 1.2);
  for (let i = 0; i < 5; i++) {
    circle(ctx, x + 14 + i * 7.5, top + 60, 2.6);
    ctx.fillStyle = i % 2 ? '#f0c86e' : '#e48d9b';
    ctx.fill();
  }
  shape(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(x + 66, g);
      c.lineTo(x + 66, top + 50);
      c.arc(x + 81, top + 50, 15, Math.PI, 0);
      c.lineTo(x + 96, g);
      c.closePath();
    },
    '#6c9b95',
    '#507a74',
  );
  circle(ctx, x + 90, g - 24, 2.2);
  ctx.fillStyle = '#e8c66b';
  ctx.fill();
}

function townhouse(ctx: Ctx, x: number, g: number) {
  const w = 108;
  const h = 172;
  const top = g - h;
  shape(ctx, rect(x, top, w, h), vgrad(ctx, top, g, '#afc5be', '#9bb2aa'), '#7a958c');
  shape(ctx, rrect(x - 4, top - 8, w + 8, 10, 2), '#809b92', '#64807a');
  ctx.fillStyle = '#93aca4';
  ctx.fillRect(x + 2, top + 2, w - 4, 5);
  windowFrame(ctx, x + 16, top + 24, 26, 32);
  windowFrame(ctx, x + 66, top + 24, 26, 32);
  windowFrame(ctx, x + 16, top + 78, 26, 32);
  windowFrame(ctx, x + 66, top + 78, 26, 32);
  shape(ctx, rrect(x + 38, g - 44, 32, 44, 3), '#8a614b', '#6a4a39');
  shape(ctx, rrect(x + 32, g - 50, 44, 6, 2), '#6f8a82', '#58716a', 1.2);
  ctx.fillStyle = '#cdc3b5';
  ctx.fillRect(x + 34, g - 3, 40, 3);
}

function silo(ctx: Ctx, x: number, g: number) {
  shape(ctx, rrect(x, g - 140, 44, 140, 3), vgrad(ctx, g - 140, g, '#d8d1c4', '#c4bcae'), '#a39b8d');
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  for (let y = g - 112; y < g; y += 28) line(ctx, x + 1, y, x + 43, y);
  shape(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(x + 22, g - 140, 22, Math.PI, 0);
      c.closePath();
    },
    '#b5ac9d',
    '#958c7e',
  );
}

function lamp(ctx: Ctx, x: number, base: number, glow = false) {
  if (glow) {
    const g = ctx.createRadialGradient(x, base - 126, 0, x, base - 126, 60);
    g.addColorStop(0, 'rgba(255, 228, 160, 0.55)');
    g.addColorStop(1, 'rgba(255, 228, 160, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, base - 186, 120, 120);
  }
  shape(ctx, rrect(x - 2.5, base - 120, 5, 120, 2), '#5a586b', '#47455a', 1);
  shape(ctx, rrect(x - 8, base - 134, 16, 15, 4), '#5a586b', '#47455a', 1);
  rr(ctx, x - 5, base - 130, 10, 8, 3);
  ctx.fillStyle = glow ? '#fff1c0' : '#f6edc6';
  ctx.fill();
}

// ---------------------------------------------------------------- street 1: Maple Park (afternoon)

function fence(ctx: Ctx, g: number) {
  ctx.fillStyle = '#7b7688';
  for (let x = 6; x < W; x += 22) {
    rr(ctx, x - 1.5, g - 26, 3, 26, 1.5);
    ctx.fill();
    circle(ctx, x, g - 27, 2.6);
    ctx.fill();
  }
  ctx.fillRect(0, g - 21, W, 2.5);
  ctx.fillRect(0, g - 9, W, 2.5);
}

function gazebo(ctx: Ctx, cx: number, g: number) {
  shape(ctx, rrect(cx - 62, g - 14, 124, 14, 3), '#d9cbb3', '#b8a88d');
  for (const dx of [-50, -18, 18, 50]) shape(ctx, rrect(cx + dx - 3, g - 82, 6, 68, 2), '#efe6d5', '#c9baa1', 1.2);
  ctx.strokeStyle = '#c9baa1';
  ctx.lineWidth = 2;
  line(ctx, cx - 50, g - 38, cx + 50, g - 38);
  for (let x = cx - 46; x < cx + 50; x += 8) line(ctx, x, g - 38, x, g - 16);
  shape(ctx, (c) => poly(c, [cx - 72, g - 80, cx, g - 122, cx + 72, g - 80]), vgrad(ctx, g - 122, g - 80, '#d68a77', '#bf7262'), '#9c5a4d');
  shape(ctx, rrect(cx - 74, g - 84, 148, 7, 3), '#b5695a', '#9c5a4d', 1.2);
  shape(ctx, (c) => circle(c, cx, g - 126, 4), '#e8c66b', '#c9a24c', 1.2);
}

function bench(ctx: Ctx, x: number, g: number) {
  ctx.fillStyle = '#5a586b';
  ctx.fillRect(x + 4, g - 14, 3, 14);
  ctx.fillRect(x + 49, g - 14, 3, 14);
  shape(ctx, rrect(x, g - 18, 56, 6, 2), '#b07a4c', '#8a5c36', 1.2);
  shape(ctx, rrect(x, g - 34, 56, 6, 2), '#b07a4c', '#8a5c36', 1.2);
  ctx.fillStyle = '#5a586b';
  ctx.fillRect(x + 6, g - 30, 3, 12);
  ctx.fillRect(x + 47, g - 30, 3, 12);
}

function fountain(ctx: Ctx, cx: number, g: number) {
  shape(ctx, (c) => ellipse(c, cx, g - 6, 46, 13), '#cfc7bb', '#ada497');
  shape(ctx, (c) => ellipse(c, cx, g - 9, 38, 8), vgrad(ctx, g - 17, g - 1, '#b9d6df', '#93b6c2'));
  shape(ctx, rrect(cx - 6, g - 38, 12, 30, 3), '#d8d1c4', '#ada497', 1.2);
  shape(ctx, (c) => ellipse(c, cx, g - 38, 18, 5), '#cfc7bb', '#ada497', 1.2);
}

function flowers(ctx: Ctx, x0: number, x1: number, g: number) {
  const cols = ['#e48d9b', '#f0c86e', '#f2efe8', '#c79be0'];
  for (let x = x0, i = 0; x < x1; x += 7, i++) {
    circle(ctx, x, g - 4 - (i % 2) * 3, 2.6);
    ctx.fillStyle = cols[i % cols.length];
    ctx.fill();
  }
}

function clockTower(ctx: Ctx, x: number, g: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, g - 150, 28, 150);
  poly(ctx, [x - 4, g - 150, x + 14, g - 186, x + 32, g - 150]);
  ctx.fill();
  circle(ctx, x + 14, g - 128, 8);
  ctx.fillStyle = '#d8e4d6';
  ctx.fill();
}

// ---------------------------------------------------------------- street 2: Old Town (dusk)

interface RowHouse {
  x: number;
  w: number;
  h: number;
  body: [string, string];
  edge: string;
  lit: number[]; // indices of lit windows
}

function rowHouse(ctx: Ctx, g: number, r: RowHouse) {
  const top = g - r.h;
  shape(ctx, rect(r.x, top, r.w, r.h), vgrad(ctx, top, g, r.body[0], r.body[1]), r.edge);
  shape(ctx, rrect(r.x - 3, top - 8, r.w + 6, 10, 2), r.edge, r.edge, 1);
  const cols = Math.max(2, Math.floor((r.w - 20) / 34));
  const rows = Math.max(2, Math.floor((r.h - 70) / 48));
  const gap = (r.w - cols * 24) / (cols + 1);
  let k = 0;
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      windowFrame(ctx, r.x + gap + c * (24 + gap), top + 22 + row * 48, 24, 30, r.lit.includes(k), '#e8dccb');
      k++;
    }
  }
  shape(ctx, rrect(r.x + r.w / 2 - 14, g - 40, 28, 40, 3), '#6a4a5a', '#4e3644');
}

function cafe(ctx: Ctx, x: number, g: number) {
  const w = 130;
  const h = 168;
  const top = g - h;
  shape(ctx, rect(x, top, w, h), vgrad(ctx, top, g, '#e9d2ad', '#d9bd93'), '#b39a74');
  shape(ctx, rrect(x - 3, top - 8, w + 6, 10, 2), '#b39a74', '#9a8260', 1);
  windowFrame(ctx, x + 18, top + 20, 26, 30, true, '#e8dccb');
  windowFrame(ctx, x + 86, top + 20, 26, 30, false, '#e8dccb');
  shape(ctx, rrect(x + 26, top + 62, w - 52, 22, 6), '#f4ead8', '#c9b391');
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b5524a';
  ctx.fillText('CAFE', x + w / 2, top + 74);
  awning(ctx, x - 4, top + 92, w + 8, 14, '#c9605a', '#f2e8d8', '#a54a45');
  const wy = top + 120;
  shape(ctx, rrect(x + 10, wy, 70, g - wy - 4, 2), vgrad(ctx, wy, g, '#ffe3a6', '#f5bd6a'), '#c9a066', 1.4);
  shape(ctx, rrect(x + 90, wy - 4, 30, g - wy + 4, 3), '#7d5c4a', '#5f4436');
}

function cityFar(ctx: Ctx, g: number, color: string) {
  ctx.fillStyle = color;
  const blocks: [number, number, number][] = [
    [0, 70, 120],
    [60, 50, 150],
    [120, 80, 110],
    [210, 60, 160],
    [280, 90, 120],
    [380, 50, 170],
    [440, 100, 130],
  ];
  for (const [x, w, h] of blocks) ctx.fillRect(x, g - h, w, h);
  ctx.beginPath();
  ctx.arc(250, g - 160, 24, Math.PI, 0);
  ctx.fill();
  poly(ctx, [402, g - 170, 405, g - 214, 408, g - 170]);
  ctx.fill();
}

// ---------------------------------------------------------------- street furniture (standing on the sidewalk's front edge)

const SB = L.roadTop - 7;

function hydrant(ctx: Ctx, x: number) {
  shape(ctx, rrect(x - 6, SB - 20, 12, 20, 3), '#d9615c', '#a8413d', 1.4);
  shape(ctx, (c) => circle(c, x - 8, SB - 12, 3), '#c4524d', '#a8413d', 1.2);
  shape(ctx, (c) => circle(c, x + 8, SB - 12, 3), '#c4524d', '#a8413d', 1.2);
  shape(ctx, rrect(x - 8, SB - 24, 16, 6, 3), '#c4524d', '#a8413d', 1.4);
  shape(ctx, (c) => circle(c, x, SB - 26, 2.6), '#c4524d', '#a8413d', 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x - 4, SB - 18, 2, 14);
}

function bin(ctx: Ctx, x: number, body = '#6f8a7a', edge = '#52695c') {
  shape(ctx, rrect(x - 9, SB - 24, 18, 24, 3), body, edge, 1.4);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1.2;
  for (const dx of [-4, 0, 4]) line(ctx, x + dx, SB - 19, x + dx, SB - 4);
  shape(ctx, rrect(x - 11, SB - 28, 22, 5, 2), body, edge, 1.4);
}

function cone(ctx: Ctx, x: number) {
  shape(ctx, (c) => poly(c, [x - 8, SB - 2, x + 8, SB - 2, x + 2.5, SB - 22, x - 2.5, SB - 22]), '#f08a43', '#c96a2a', 1.4);
  ctx.fillStyle = '#f6efe6';
  poly(ctx, [x - 5.5, SB - 10, x + 5.5, SB - 10, x + 4.4, SB - 14, x - 4.4, SB - 14]);
  ctx.fill();
  shape(ctx, rrect(x - 10, SB - 3, 20, 4, 1.5), '#c96a2a', '#a8561f', 1.2);
}

function crates(ctx: Ctx, x: number) {
  const crate = (cx: number, top: number, w: number, h: number) => {
    shape(ctx, rrect(cx - w / 2, top, w, h, 2), '#c79362', '#94683e', 1.4);
    ctx.strokeStyle = 'rgba(110, 70, 40, 0.35)';
    ctx.lineWidth = 1.2;
    line(ctx, cx - w / 2 + 2, top + h / 2, cx + w / 2 - 2, top + h / 2);
  };
  for (const [dx, r] of [
    [-11, -0.5],
    [-3, -0.15],
    [6, 0.25],
  ] as [number, number][]) drawCarrot(ctx, x + dx - 6, SB - 24, 0.45, r);
  crate(x - 6, SB - 18, 30, 18);
  crate(x + 22, SB - 14, 22, 14);
  for (const [dx, r] of [
    [18, -0.3],
    [25, 0.2],
  ] as [number, number][]) drawCarrot(ctx, x + dx, SB - 18, 0.38, r);
}

function mailbox(ctx: Ctx, x: number) {
  ctx.fillStyle = '#5a586b';
  ctx.fillRect(x - 2, SB - 14, 4, 14);
  shape(ctx, rrect(x - 10, SB - 31, 20, 18, 7), '#5f86cf', '#3f62a3', 1.4);
  ctx.fillStyle = '#3f62a3';
  ctx.fillRect(x - 6, SB - 25, 12, 2);
}

function newsStand(ctx: Ctx, x: number) {
  shape(ctx, rrect(x - 12, SB - 32, 24, 32, 3), '#d9a441', '#ad7f2c', 1.4);
  shape(ctx, rrect(x - 9, SB - 28, 18, 12, 2), '#f2ece2', '#c9bba3', 1);
  ctx.strokeStyle = 'rgba(80, 70, 60, 0.4)';
  ctx.lineWidth = 1;
  for (const dy of [-25, -22, -19]) line(ctx, x - 6, SB + dy, x + 6, SB + dy);
}

function bicycle(ctx: Ctx, x: number) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4a4658';
  for (const dx of [-12, 12]) {
    circle(ctx, x + dx, SB - 8, 8);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d4615c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - 12, SB - 8);
  ctx.lineTo(x - 3, SB - 20);
  ctx.lineTo(x + 8, SB - 20);
  ctx.lineTo(x + 12, SB - 8);
  ctx.moveTo(x - 3, SB - 20);
  ctx.lineTo(x + 1, SB - 8);
  ctx.lineTo(x + 8, SB - 20);
  ctx.stroke();
  ctx.strokeStyle = '#4a4658';
  ctx.lineWidth = 2;
  line(ctx, x - 6, SB - 23, x, SB - 23);
  line(ctx, x + 8, SB - 20, x + 10, SB - 26);
  line(ctx, x + 7, SB - 26, x + 13, SB - 26);
}

// ---------------------------------------------------------------- road surface and markings

function asphalt(ctx: Ctx, v: number) {
  const rnd = seeded(11 + v * 7);
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * W;
    const y = L.roadTop + 3 + rnd() * (L.roadBottom - L.roadTop - 6);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(20,15,30,0.08)';
    ctx.fillRect(x, y, 1.4 + rnd() * 1.6, 1.2 + rnd());
  }
}

function cobbles(ctx: Ctx) {
  const rnd = seeded(5);
  const tones = ['#78748a', '#7c788e', '#757187', '#807c92', '#7a7689'];
  for (let y = L.roadTop + 1, row = 0; y < L.roadBottom - 1; y += 15, row++) {
    let x = -(row % 2) * 14;
    while (x < W) {
      const w = 22 + rnd() * 10;
      rr(ctx, x + 1.5, y + 1.5, w - 3, 12, 5);
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 34, 56, 0.24)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 5, y + 3.5, w - 11, 2);
      x += w;
    }
  }
}

function oil(ctx: Ctx, x: number, y: number, r: number) {
  ellipse(ctx, x, y, r, r * 0.35);
  ctx.fillStyle = 'rgba(30, 25, 45, 0.13)';
  ctx.fill();
  ellipse(ctx, x + r * 0.25, y - 1, r * 0.45, r * 0.13);
  ctx.fillStyle = 'rgba(170, 140, 220, 0.08)';
  ctx.fill();
}

function patchOf(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rr(ctx, x, y, w, h, 3);
  ctx.fillStyle = 'rgba(40, 35, 55, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 25, 45, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function crack(ctx: Ctx, pts: number[]) {
  ctx.strokeStyle = 'rgba(50, 44, 62, 0.28)';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** Storm drain grate in the top curb. */
function drain(ctx: Ctx, x: number) {
  rr(ctx, x, L.roadTop - 2, 32, 10, 2);
  ctx.fillStyle = '#56536a';
  ctx.fill();
  ctx.fillStyle = '#35323f';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * 5.5, L.roadTop, 2.4, 6);
}

/** A painted bunny head on the road: this is rabbit turf. */
function stencil(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#f2ede2';
  ellipse(ctx, x - 8, y - 18, 5, 13, -0.18);
  ctx.fill();
  ellipse(ctx, x + 8, y - 18, 5, 13, 0.18);
  ctx.fill();
  ellipse(ctx, x, y, 15, 12);
  ctx.fill();
  ctx.restore();
}

function skidMarks(ctx: Ctx, x: number, y: number) {
  ctx.strokeStyle = 'rgba(30, 25, 40, 0.09)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const dy of [0, 14]) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy);
    ctx.quadraticCurveTo(x + 50, y + dy - 10, x + 110, y + dy - 4);
    ctx.stroke();
  }
}

/** A rain puddle reflecting the sky. */
function puddle(ctx: Ctx, x: number, y: number, rx: number, sky: [string, string]) {
  ellipse(ctx, x, y, rx, rx * 0.3);
  const g = ctx.createLinearGradient(0, y - rx * 0.3, 0, y + rx * 0.3);
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(60, 55, 75, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  line(ctx, x - rx * 0.5, y - rx * 0.08, x - rx * 0.1, y - rx * 0.12);
}

// ---------------------------------------------------------------- shared ground

function sidewalk(ctx: Ctx, g: number, tone: string) {
  ctx.fillStyle = tone;
  ctx.fillRect(0, g, W, L.roadTop - 6 - g);
  ctx.fillStyle = 'rgba(60, 50, 60, 0.08)';
  ctx.fillRect(0, g, W, 6);
  ctx.strokeStyle = 'rgba(120, 105, 95, 0.16)';
  ctx.lineWidth = 1.5;
  for (let x = 24; x < W; x += 46) line(ctx, x, g + 2, x - 4, L.roadTop - 7);
}

function road(ctx: Ctx, v: number) {
  ctx.fillStyle = '#bfb4a6';
  ctx.fillRect(0, L.roadTop - 6, W, 6);
  ctx.fillStyle = '#d6cdc0';
  ctx.fillRect(0, L.roadTop - 6, W, 1.5);
  const top = v === 2 ? '#6f6b80' : '#7b7888';
  const bottom = v === 2 ? '#7a7689' : '#86838f';
  ctx.fillStyle = vgrad(ctx, L.roadTop, L.roadBottom, top, bottom);
  ctx.fillRect(0, L.roadTop, W, L.roadBottom - L.roadTop);
  // the surface: cobblestones in Old Town, fine grain on the asphalt elsewhere
  if (v === 2) cobbles(ctx);
  else asphalt(ctx, v);
  if (v === 0) {
    patchOf(ctx, 286, 512, 64, 34);
    oil(ctx, 200, 430, 16);
    oil(ctx, 474, 566, 12);
    skidMarks(ctx, 380, 488);
    crack(ctx, [20, 600, 34, 590, 30, 578, 46, 566]);
  } else if (v === 1) {
    puddle(ctx, 300, 566, 42, SKY[1]);
    puddle(ctx, 120, 420, 22, SKY[1]);
    oil(ctx, 420, 452, 12);
    crack(ctx, [520, 380, 508, 394, 514, 404, 500, 418]);
  } else {
    puddle(ctx, 420, 540, 30, ['#8a7fb8', '#f0b48e']);
    crack(ctx, [60, 600, 70, 588]);
  }
  stencil(ctx, 64, 500);
  ctx.fillStyle = vgrad(ctx, L.roadTop, L.roadTop + 18, 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)');
  ctx.fillRect(0, L.roadTop, W, 18);
  for (const [cx, cy, r] of [
    [110, 540, 150],
    [420, 440, 170],
  ] as [number, number, number][]) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, 'rgba(255,255,255,0.05)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const mid = (L.roadTop + L.roadBottom) / 2;
  ctx.fillStyle = v === 2 ? 'rgba(217, 192, 104, 0.45)' : 'rgba(217, 192, 104, 0.9)';
  for (let x = 10; x < W; x += 76) {
    rr(ctx, x, mid - 3, 46, 6, 3);
    ctx.fill();
  }
  for (const dx of v === 2 ? [250, 470] : [120, 360]) drain(ctx, dx);
  if (v === 1) {
    // crosswalk at the park gate
    ctx.fillStyle = 'rgba(240, 236, 228, 0.5)';
    for (let y = L.roadTop + 10; y < L.roadBottom - 12; y += 26) {
      rr(ctx, 470, y, 52, 13, 3);
      ctx.fill();
    }
  }
  const mx = v === 2 ? 150 : 392;
  ellipse(ctx, mx, L.roadTop + 40, 22, 7);
  ctx.fillStyle = v === 2 ? '#646075' : '#716e7e';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#5c596b';
  ctx.stroke();
  ellipse(ctx, mx, L.roadTop + 40, 14, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 55, 70, 0.25)';
  ctx.beginPath();
  const cx = v === 1 ? 260 : 96;
  ctx.moveTo(cx, 568);
  ctx.lineTo(cx + 16, 560);
  ctx.lineTo(cx + 28, 564);
  ctx.lineTo(cx + 44, 556);
  ctx.stroke();

  ctx.fillStyle = '#bfb4a6';
  ctx.fillRect(0, L.roadBottom, W, 8);
  ctx.fillStyle = '#a59a8c';
  ctx.fillRect(0, L.roadBottom + 8, W, L.sceneBottom - L.roadBottom - 8);
}

// ---------------------------------------------------------------- the two cached layers

const SKY: [string, string][] = [
  ['#a6cde0', '#e4ece4'],
  ['#9cc8e4', '#f1e3cc'],
  ['#7d7fc2', '#f4b48a'],
];

/** Sky gradient and sun haze. */
export function drawSky(ctx: Ctx, v: number) {
  const g = L.sidewalkTop;
  ctx.fillStyle = vgrad(ctx, 0, g, SKY[v][0], SKY[v][1]);
  ctx.fillRect(0, 0, W, g + 2);
  const [sx, sy, sr, col] = v === 0 ? [420, 110, 210, '255, 250, 235'] : v === 1 ? [110, 150, 230, '255, 236, 205'] : [290, 250, 280, '255, 196, 140'];
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
  sun.addColorStop(0, `rgba(${col}, ${v === 2 ? 0.8 : 0.55})`);
  sun.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, g);
  if (v === 2) {
    circle(ctx, sx, sy - 6, 30);
    ctx.fillStyle = '#ffd9a8';
    ctx.fill();
    const moon = ctx.createRadialGradient(456, 58, 0, 456, 58, 60);
    moon.addColorStop(0, 'rgba(255, 244, 214, 0.45)');
    moon.addColorStop(1, 'rgba(255, 244, 214, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(396, 0, 120, 120);
    circle(ctx, 456, 58, 15);
    ctx.fillStyle = '#fff2d2';
    ctx.fill();
    ctx.fillStyle = 'rgba(200, 180, 160, 0.35)';
    for (const [x, y, r] of [
      [451, 54, 3.5],
      [461, 63, 2.5],
      [459, 51, 1.8],
    ]) {
      circle(ctx, x, y, r);
      ctx.fill();
    }
    // first stars of the evening
    ctx.fillStyle = 'rgba(255, 250, 235, 0.8)';
    for (const [x, y] of [
      [86, 80],
      [100, 106],
      [214, 118],
      [262, 132],
      [312, 120],
      [400, 86],
      [440, 92],
      [452, 114],
    ]) {
      circle(ctx, x, y, 1.4);
      ctx.fill();
    }
  }
}

/** Hills, buildings, sidewalk and road. Transparent above the skyline. */
export function drawFront(ctx: Ctx, v: number) {
  const g = L.sidewalkTop;
  if (v === 0) {
    hills(ctx, g, '#cbdccc', '#d4e2d4');
    // hazy silhouettes far away
    ctx.fillStyle = '#c3d5c8';
    ctx.fillRect(56, 214, 3, 34);
    ctx.fillRect(81, 214, 3, 34);
    rr(ctx, 50, 194, 40, 22, 6);
    ctx.fill();
    poly(ctx, [48, 196, 70, 182, 92, 196]);
    ctx.fill();
    poly(ctx, [230, 262, 230, 236, 252, 222, 274, 236, 274, 262]);
    ctx.fill();
    farTrees(
      ctx,
      [
        [140, 252, 13],
        [160, 248, 15],
        [300, 252, 12],
        [460, 240, 14],
        [482, 236, 16],
      ],
      '#c3d5c8',
    );
    silo(ctx, 474, g);
    market(ctx, 6, g);
    cottage(ctx, 176, g);
    townhouse(ctx, 304, g);
    sidewalk(ctx, g, '#dcd3c6');
    lamp(ctx, 296, g + 14);
  } else if (v === 1) {
    hills(ctx, g, '#c2d8bd', '#cfe0c6');
    clockTower(ctx, 404, 262, '#bccfc0');
    farTrees(
      ctx,
      [
        [60, 262, 18],
        [90, 256, 20],
        [190, 264, 16],
        [330, 262, 18],
        [500, 258, 20],
        [524, 262, 16],
      ],
      '#b3cbb0',
    );
    // park lawn behind the fence
    ctx.fillStyle = vgrad(ctx, 286, g, '#b6cf9f', '#a6c290');
    ctx.fillRect(0, 286, W, g - 286);
    gazebo(ctx, 270, g);
    fountain(ctx, 430, g);
    flowers(ctx, 4, 80, g);
    flowers(ctx, 340, 386, g);
    fence(ctx, g);
    bench(ctx, 92, g);
    sidewalk(ctx, g, '#d8d0c2');
    lamp(ctx, 186, g + 14);
  } else {
    cityFar(ctx, g, '#a094bd');
    const houses: RowHouse[] = [
      { x: 0, w: 96, h: 200, body: ['#c99582', '#b98370'], edge: '#946556', lit: [0, 3] },
      { x: 96, w: 104, h: 236, body: ['#97a8bd', '#8597ad'], edge: '#687b93', lit: [1, 2, 5] },
      { x: 330, w: 100, h: 214, body: ['#adbb96', '#9cab85'], edge: '#7a8964', lit: [0, 4] },
      { x: 430, w: 110, h: 190, body: ['#c7a2b6', '#b690a5'], edge: '#927083', lit: [1, 2] },
    ];
    // chimneys first (behind the cornices)
    shape(ctx, rrect(160, g - 236 - 26, 14, 24, 2), '#7d6a74', '#5f4f58');
    shape(ctx, rrect(494, g - 190 - 26, 14, 24, 2), '#7d6a74', '#5f4f58');
    for (const h of houses) rowHouse(ctx, g, h);
    cafe(ctx, 200, g);
    sidewalk(ctx, g, '#cfc5c4');
    // cafe tables
    for (const tx of [222, 300]) {
      ctx.fillStyle = '#5a586b';
      ctx.fillRect(tx - 1.5, g + 2, 3, 14);
      shape(ctx, (c) => ellipse(c, tx, g + 2, 12, 3.5), '#f2ece2', '#b9ad9c', 1.2);
    }
    lamp(ctx, 116, g + 14, true);
    lamp(ctx, 424, g + 14, true);
  }
  road(ctx, v);
  // street furniture on the sidewalk's front edge
  if (v === 0) {
    hydrant(ctx, 196);
    crates(ctx, 236);
    cone(ctx, 330);
    bin(ctx, 380);
  } else if (v === 1) {
    mailbox(ctx, 252);
    bin(ctx, 280, '#7d8c62', '#5f6b48');
    bicycle(ctx, 420);
  } else {
    newsStand(ctx, 180);
    mailbox(ctx, 350);
    bin(ctx, 512, '#6b6680', '#4f4b60');
  }
}
