import { BAL, CASES, ITEMS, MAX_LEVEL, TOP_ODDS, classOf, type CaseKind, type ItemType } from '../data';
import type { CaseRun, Game } from '../game';
import { CASE, CLASS_FX, COLOR, EVO, FONT, H, ROLL, TIER, W, caseFlyPos } from '../theme';
import { circle, clamp, easeOutBack, ellipse, fillStroke, hash, label, lerp, poly, rr, starPath, type Ctx } from '../util';
import { classBadge, classColor, pieceIcon, rainbow } from './ui';

/*
 * The roll: opening a case takes over the whole screen.
 *
 * The case drops onto a dark stage, shakes and bursts open. A big medallion rises out of it and flicks through
 * random pieces, popping and tilting on every flick while rings turn behind it, the stage glows in the class
 * colour on show, and the class ladder at the bottom lights up to match. The flicks slow down and it lands.
 * A rare prize lands as a lower class first, then cracks spread across the medallion, it shatters, and it comes
 * back a class higher, again and again up to the real prize. Then the prize flies into the tray.
 *
 * All the timing lives in game.ts (the CaseRun); this file only draws the state it is given.
 */

const INK = COLOR.ink;

const pct = (p: number) => `${+p.toFixed(p >= 1 ? 1 : 2)}%`;

/** "1 in 1,111": how rare a class is. */
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.max(1, Math.round(100 / p)).toLocaleString('en-US')}` : '');

/** Glow colour of a class: red for S, a turning hue for SSS, the class colour otherwise. */
const aura = (level: number, t: number) => (level >= MAX_LEVEL ? classColor(level, t) : level === 6 ? CLASS_FX.s : TIER.metal[level - 1]);

const KIND: Record<CaseKind, { body: string; dark: string; trim: string; title: string }> = {
  basic: { body: '#4f80d0', dark: '#30579a', trim: '#ffb43a', title: '#ffd36b' },
  elite: { body: '#9150dc', dark: '#602fa2', trim: '#ffd24a', title: '#e6bcff' },
  free: { body: '#f08a3c', dark: '#bd5c1e', trim: '#ffe08a', title: '#ffc58a' },
};

// ---------------------------------------------------------------- the stage

let stageCache: HTMLCanvasElement | null = null;

/** The parts of the stage that never change (darkness, vignette, floor), painted once at half size: they are all soft gradients. */
function stageBase() {
  if (stageCache) return stageCache;
  const c = document.createElement('canvas');
  c.width = W / 2;
  c.height = H / 2;
  const k = c.getContext('2d')!;
  k.scale(0.5, 0.5);
  k.fillStyle = 'rgba(9, 6, 18, 0.955)';
  k.fillRect(0, 0, W, H);
  const v = k.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 720);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  k.fillStyle = v;
  k.fillRect(0, 0, W, H);
  // the floor the case stands on
  k.translate(CASE.x, CASE.caseY + 50);
  k.scale(1, 0.2);
  const floor = k.createRadialGradient(0, 0, 10, 0, 0, 240);
  floor.addColorStop(0, 'rgba(255,255,255,0.13)');
  floor.addColorStop(1, 'rgba(255,255,255,0)');
  k.fillStyle = floor;
  k.fillRect(-240, -240, 480, 480);
  stageCache = c;
  return c;
}

/** A dark stage: a wash of the class colour from the medallion, a pool of light under the case, drifting motes, a vignette. */
function backdrop(ctx: Ctx, t: number, col: string, flare: number) {
  ctx.drawImage(stageBase(), 0, 0, W, H);
  const wash = ctx.createRadialGradient(CASE.x, CASE.y, 30, CASE.x, CASE.y, 440);
  wash.addColorStop(0, col);
  wash.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha *= 0.16 + 0.3 * flare;
  ctx.fillStyle = wash;
  ctx.fillRect(0, CASE.y - 440, W, 880);
  ctx.restore();
  // motes drifting up, in the colour on show
  ctx.save();
  const base = ctx.globalAlpha;
  ctx.fillStyle = col;
  for (let i = 0; i < 26; i++) {
    const x = hash(i + 40) * W + Math.sin(t * 0.8 + i) * 14;
    const y = H - ((t * (30 + hash(i) * 60) + hash(i + 80) * H) % H);
    ctx.globalAlpha = base * (0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)));
    circle(ctx, x, y, 1.5 + hash(i + 120) * 2.2);
    ctx.fill();
  }
  ctx.restore();
}

/** Rings turning behind the medallion: a ticked outer ring, a dashed ring carrying four diamonds, a thin inner one. */
function rings(ctx: Ctx, x: number, y: number, r: number, col: string, t: number, kick: number, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  const s = 1 + 0.06 * kick;
  ctx.scale(s, s);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  const base = ctx.globalAlpha * a;
  ctx.save();
  ctx.rotate(-t * 0.35);
  ctx.globalAlpha = base * 0.3;
  ctx.lineWidth = 1.6;
  circle(ctx, 0, 0, r + 52);
  ctx.stroke();
  ctx.globalAlpha = base * 0.45;
  for (let i = 0; i < 24; i++) {
    ctx.rotate(Math.PI / 12);
    ctx.fillRect(r + 43, -1, i % 2 ? 5 : 10, 2);
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(t * 0.6);
  ctx.globalAlpha = base * 0.6;
  ctx.lineWidth = 3.5;
  ctx.setLineDash([18, 12]);
  circle(ctx, 0, 0, r + 30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = base * 0.9;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    poly(ctx, [r + 30, -9, r + 37, 0, r + 30, 9, r + 23, 0]);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = base * 0.35;
  ctx.lineWidth = 2;
  circle(ctx, 0, 0, r + 15);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the medallion

/**
 * A piece on its medallion: a thick coin in the class colours (rainbow for SSS) with a dished face, studs round
 * the rim, the piece's art, a glass highlight and a big class badge. A-class and up get a light sweep;
 * fancy = also twinkles round an S or SSS, and stars orbiting an SSS.
 */
function medallion(ctx: Ctx, type: ItemType, level: number, x: number, y: number, r: number, t: number, seed: number, fancy: boolean) {
  const lv = clamp(level, 1, MAX_LEVEL);
  const k = r / 92;
  circle(ctx, x, y + 9 * k, r);
  fillStroke(ctx, TIER.tileDark[lv - 1], 5 * k);
  circle(ctx, x, y, r);
  let face: string | CanvasGradient;
  if (lv >= MAX_LEVEL) face = rainbow(ctx, x - r, y - r, x + r, y + r, t, true);
  else {
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, TIER.tileLight[lv - 1]);
    g.addColorStop(1, TIER.tile[lv - 1]);
    face = g;
  }
  fillStroke(ctx, face, 5 * k);
  // the dish: a lighter hollow with a bright edge, carved in by a soft shadow along its top
  circle(ctx, x, y, r - 14 * k);
  const dish = ctx.createRadialGradient(x, y - r * 0.35, r * 0.05, x, y, r);
  dish.addColorStop(0, 'rgba(255,255,255,0.6)');
  dish.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = dish;
  ctx.fill();
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r - 17 * k, Math.PI * 1.1, Math.PI * 1.9);
  ctx.lineWidth = 2.5 * k;
  ctx.strokeStyle = 'rgba(40, 30, 60, 0.16)';
  ctx.stroke();
  // studs round the rim
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const sx = x + Math.cos(a) * (r - 7 * k);
    const sy = y + Math.sin(a) * (r - 7 * k);
    ctx.moveTo(sx + 1.9 * k, sy);
    ctx.arc(sx, sy, 1.9 * k, 0, Math.PI * 2);
  }
  ctx.fillStyle = TIER.tileDark[lv - 1];
  ctx.fill();

  pieceIcon(ctx, type, lv, x, y + 3 * k, r * 1.42, r * 1.12, t + seed);

  // glass: a soft highlight over the top, and a light sweep for the top classes
  ctx.save();
  circle(ctx, x, y, r - 3 * k);
  ctx.clip();
  ellipse(ctx, x - r * 0.2, y - r * 0.82, r * 0.9, r * 0.5, -0.25);
  ctx.fillStyle = 'rgba(255,255,255,0.17)';
  ctx.fill();
  if (lv >= 5) {
    const sw = ((t / (lv === 5 ? 2.6 : 1.8) + seed * 0.37) % 1) * r * 4 - r * 2;
    ctx.globalAlpha *= 0.4;
    poly(ctx, [x + sw, y - r, x + sw + 22 * k, y - r, x + sw + 22 * k - r * 0.9, y + r, x + sw - r * 0.9, y + r]);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();

  const bk = 2 * k;
  const bw = (lv >= MAX_LEVEL ? 31 : 17) * bk;
  classBadge(ctx, lv, x - r * 0.72 - bw / 2, y - r * 0.72, bk, t);

  if (!fancy || lv < 6) return;
  const n = lv >= MAX_LEVEL ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const ph = t * 1.4 + i / n + seed;
    const cyc = Math.floor(ph);
    const a = Math.sin((ph - cyc) * Math.PI);
    const ang = hash(cyc * 7.1 + i * 3.3) * Math.PI * 2;
    const rad = r * (0.75 + 0.55 * hash(cyc * 5.7 + i * 9.1));
    ctx.save();
    ctx.globalAlpha *= a;
    starPath(ctx, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, (4 + 7 * a) * k, 1.6 * k, 4, t);
    ctx.fillStyle = CLASS_FX.spark;
    ctx.fill();
    ctx.restore();
  }
  if (lv < MAX_LEVEL) return;
  for (let i = 0; i < 3; i++) {
    const ang = t * 1.6 + (i * Math.PI * 2) / 3;
    starPath(ctx, x + Math.cos(ang) * (r + 14 * k), y + Math.sin(ang) * (r + 14 * k) * 0.92, 8 * k, 3.2 * k, 4, t * 3);
    fillStroke(ctx, EVO.rim[i % EVO.rim.length], 1.5);
  }
}

/** Cracks spreading over the medallion while it breaks through (k = 0..1), glowing in the colour of the class to come. */
function cracks(ctx: Ctx, x: number, y: number, r: number, k: number, col: string, seed: number) {
  ctx.save();
  circle(ctx, x, y, r - 2);
  ctx.clip();
  // it heats up from inside
  const heat = ctx.createRadialGradient(x, y, 0, x, y, r);
  heat.addColorStop(0, '#ffffff');
  heat.addColorStop(1, col);
  ctx.save();
  ctx.globalAlpha *= 0.45 * k * k;
  ctx.fillStyle = heat;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, c, a] of [
    [8, col, 0.6],
    [2.8, '#ffffff', 1],
  ] as [number, string, number][]) {
    ctx.save();
    ctx.lineWidth = w;
    ctx.strokeStyle = c;
    ctx.globalAlpha *= a;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      // the cracks start one after another and each grows to the rim
      const kk = clamp((k - (i / 8) * 0.55) / 0.45, 0, 1);
      if (kk <= 0) continue;
      let ang = hash(seed + i * 3.3) * Math.PI * 2;
      let px = x + (hash(seed + i * 7.1) - 0.5) * 18;
      let py = y + (hash(seed + i * 9.7) - 0.5) * 18;
      ctx.moveTo(px, py);
      const len = (r * 1.05 * kk) / 5;
      for (let j = 0; j < 5; j++) {
        ang += (hash(seed + i * 13 + j * 5.7) - 0.5) * 1.3;
        px += Math.cos(ang) * len;
        py += Math.sin(ang) * len;
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the case

/**
 * The case itself, drawn big. `part` splits it so the medallion can rise out from between the two halves:
 * 'back' = the lid (tipped up and back when open), the dark mouth and the glow pouring out of it;
 * 'front' = the body with its stripes, rivets and latch. (x, y) is the middle of the case; sx/sy squash it.
 */
function bigCase(ctx: Ctx, part: 'back' | 'front', x: number, y: number, s: number, kind: CaseKind, open: number, glow: string, glowA: number, sx = 1, sy = 1, rot = 0) {
  const c = KIND[kind];
  ctx.save();
  ctx.translate(x, y + 15 * s);
  ctx.rotate(rot);
  ctx.scale(s * sx, s * sy);
  ctx.translate(0, -15);
  ctx.lineJoin = 'round';
  if (part === 'back') {
    ctx.save();
    ctx.translate(0, -3 - 9 * open);
    ctx.rotate(-0.1 * open);
    ctx.scale(1, 1 - 0.3 * Math.min(1, open));
    // handle
    rr(ctx, -6, -14.5, 12, 6.5, 2.6);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#a7a2b4';
    ctx.stroke();
    // lid
    rr(ctx, -18, -10, 36, 10.5, 4);
    const lg = ctx.createLinearGradient(0, -10, 0, 0);
    lg.addColorStop(0, c.body);
    lg.addColorStop(1, c.dark);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.fillStyle = c.trim;
    ctx.fillRect(-12, -10, 4, 10.5);
    ctx.fillRect(8, -10, 4, 10.5);
    rr(ctx, -15.5, -8.6, 31, 1.8, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    if (open > 0) {
      // open, we see its shaded inside
      rr(ctx, -18, -10, 36, 10.5, 4);
      ctx.fillStyle = `rgba(20, 12, 34, ${0.3 * Math.min(1, open)})`;
      ctx.fill();
    }
    rr(ctx, -18, -10, 36, 10.5, 4);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    if (open > 0.05) {
      rr(ctx, -16.5, -6.5, 33, 8, 2.5);
      ctx.fillStyle = '#17111f';
      ctx.fill();
      // light pouring out of the open case
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= glowA * Math.min(1, open);
      ctx.translate(0, -8);
      ctx.scale(1, 1.25);
      const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
      gl.addColorStop(0, '#ffffff');
      gl.addColorStop(0.35, glow);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(-22, -22, 44, 44);
      ctx.restore();
    }
  } else {
    rr(ctx, -18, -3, 36, 18, 4);
    const bg = ctx.createLinearGradient(0, -3, 0, 15);
    bg.addColorStop(0, c.body);
    bg.addColorStop(1, c.dark);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 12, 34, 0.22)';
    ctx.fillRect(-17.4, 9.5, 34.8, 5);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-12, -3, 4, 18);
    ctx.fillRect(8, -3, 4, 18);
    rr(ctx, -15.5, -1.4, 31, 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    rr(ctx, -18, -3, 36, 18, 4);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (const [rx, ry] of [
      [-15.3, 0.2],
      [15.3, 0.2],
      [-15.3, 12],
      [15.3, 12],
    ]) {
      circle(ctx, rx, ry, 1);
      ctx.fill();
    }
    // latch
    rr(ctx, -4.6, -5.2, 9.2, 9.6, 2);
    fillStroke(ctx, c.trim, 1.2);
    circle(ctx, 0, -1.2, 1.5);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.fillRect(-0.6, -1, 1.2, 3.4);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the bottom of the screen

/** The seven classes with their odds; the class on show is lit, lifted and bumps on every flick. */
function ladder(ctx: Ctx, odds: readonly number[], lit: number, sinceLit: number, t: number) {
  const cw = 64;
  const gap = 6;
  const h = 48;
  const x0 = W / 2 - (7 * cw + 6 * gap) / 2;
  const y0 = 868;
  for (let i = 0; i < 7; i++) {
    const on = lit === i + 1;
    const bump = on ? 1.1 + 0.2 * Math.max(0, 1 - sinceLit / 0.12) : 1;
    ctx.save();
    ctx.translate(x0 + i * (cw + gap) + cw / 2, y0 + h / 2 - (on ? 7 : 0));
    ctx.scale(bump, bump);
    if (!on) ctx.globalAlpha *= odds[i] > 0 ? 0.5 : 0.22;
    if (on) {
      ctx.shadowColor = aura(i + 1, t);
      ctx.shadowBlur = 18;
    }
    rr(ctx, -cw / 2, -h / 2, cw, h, 10);
    let fill: string | CanvasGradient = TIER.tileDark[i];
    if (i === 6) fill = rainbow(ctx, -cw / 2, 0, cw / 2, 0, t, on);
    else if (on) {
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, TIER.tileLight[i]);
      g.addColorStop(1, TIER.tile[i]);
      fill = g;
    }
    fillStroke(ctx, fill, on ? 3.5 : 2.5, on ? '#ffffff' : INK);
    ctx.shadowBlur = 0;
    label(ctx, classOf(i + 1), 0, -8, i === 6 ? 16 : 22, { lw: 4.5 });
    label(ctx, odds[i] > 0 ? pct(odds[i]) : '-', 0, 13, 11, { lw: 3, color: on ? '#ffffff' : COLOR.textDim });
    ctx.restore();
  }
}

/** How close the next guaranteed A-class is: a bar that fills by one with every case (it flashes as it moves). */
function pityBar(ctx: Ctx, g: Game, c: CaseRun, t: number) {
  if (c.kind === 'free') {
    label(ctx, 'EVOLUTION UNLOCKED: FREE ROLL!', W / 2, 952, 16, { color: EVO.glow, lw: 4 });
    return;
  }
  const w = 320;
  const h = 16;
  const x = W / 2 - w / 2;
  const y = 954;
  const sure = c.pity && !c.landed;
  const frac = sure ? 1 : clamp(g.pity / (BAL.pity - 1), 0, 1);
  const text = sure ? 'GUARANTEED A-CLASS OR BETTER!' : `A-CLASS OR BETTER GUARANTEED IN ${g.pityLeft}`;
  label(ctx, text, W / 2, y - 14, 13, { color: sure ? `hsl(45, 100%, ${70 + 12 * Math.sin(t * 9)}%)` : COLOR.textDim, lw: 3 });
  rr(ctx, x, y, w, h, h / 2);
  fillStroke(ctx, 'rgba(30, 22, 44, 0.9)', 2.5);
  if (frac > 0) {
    rr(ctx, x + 3, y + 3, Math.max(h - 6, (w - 6) * frac), h - 6, (h - 6) / 2);
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#fff3a0');
    gr.addColorStop(1, '#f5a417');
    ctx.fillStyle = gr;
    ctx.fill();
  }
  // the count just changed: flash
  const fl = c.landed ? Math.max(0, 1 - c.revealT / 0.4) : 0;
  if (fl > 0) {
    ctx.save();
    ctx.globalAlpha *= fl;
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
  const pulse = 1 + (sure ? 0.2 * Math.abs(Math.sin(t * 6)) : 0) + 0.5 * fl;
  starPath(ctx, x + w + 2, y + h / 2, 13 * pulse, 5.6 * pulse, 5, -0.2);
  fillStroke(ctx, '#ffd84a', 2.5);
}

// ---------------------------------------------------------------- the whole roll

export function drawRoll(ctx: Ctx, g: Game) {
  const c = g.case;
  if (!c) return;
  const t = g.time;
  const card = g.rollCard(c);
  const ck = g.rollCharge(c);
  const charging = ck >= 0;
  const charge = Math.max(0, ck);
  const lv = card ? card.level : 1;
  const next = charging ? c.ups[c.stage] : lv;
  const since = card ? c.t - c.shownAt : 0;
  const settled = !!card && c.shown === c.win; // it has landed on a piece (which may still break through)
  const odds = c.pity ? TOP_ODDS : CASES[c.kind].odds;
  const col = !card ? KIND[c.kind].title : aura(next, t);
  const flare = !card ? 0.2 : charging ? 0.4 + 0.6 * charge : c.landed ? 0.8 : 0.35 + 0.55 * Math.max(0, 1 - since / 0.14);
  const R = CASE.r;

  ctx.save();
  ctx.globalAlpha = Math.min(clamp(c.t / 0.16, 0, 1), 1 - c.fly);
  backdrop(ctx, t, col, flare);
  // everything on the stage trembles while a piece is breaking through
  if (charging) ctx.translate(Math.sin(t * 83) * 4 * charge * charge, Math.cos(t * 71) * 3 * charge * charge);

  // which case this is
  const name = CASES[c.kind].name;
  ctx.font = `30px ${FONT}`;
  const tx = W / 2 - (ctx.measureText(name).width + 56) / 2;
  bigCase(ctx, 'back', tx + 22, 152, 1.25, c.kind, 0, col, 0);
  bigCase(ctx, 'front', tx + 22, 152, 1.25, c.kind, 0, col, 0);
  label(ctx, name, tx + 56, 152, 30, { align: 'left', color: KIND[c.kind].title });

  // the case drops in, lands with a squash, shakes, and its lid bursts open
  const dropK = clamp(c.t / ROLL.drop, 0, 1);
  const caseY = lerp(-110, CASE.caseY, dropK * dropK);
  const hit = c.t - ROLL.drop;
  const kick = card && !settled ? Math.max(0, 1 - since / 0.08) * 0.04 : 0;
  const q = (hit > 0 && hit < 0.2 ? Math.sin((hit / 0.2) * Math.PI) * 0.2 : 0) + kick;
  const wob = c.t > ROLL.drop + 0.08 && c.t < ROLL.pop ? Math.sin((c.t - ROLL.drop) * 55) * 0.07 : 0;
  const open = easeOutBack(clamp((c.t - ROLL.pop) / 0.12, 0, 1));
  const glowA = 0.5 + 0.5 * flare;

  const rise = card ? clamp((c.t - c.times[0]) / 0.28, 0, 1) : 0;
  if (card) rings(ctx, CASE.x, CASE.y, R, col, t, settled ? Math.max(0, 1 - since / 0.25) : Math.max(0, 1 - since / 0.1), rise * (c.landed || charging ? 1 : 0.75));

  bigCase(ctx, 'back', CASE.x, caseY, 3.4, c.kind, open, col, glowA, 1 + q, 1 - q, wob);

  if (card && c.fly === 0) {
    // the medallion rises out of the case once, then pops and tilts with every flick
    const up = easeOutBack(rise);
    let x = CASE.x;
    let y = lerp(CASE.caseY - 46, CASE.y, up);
    let sc = lerp(0.25, 1, Math.min(1, up));
    let sx = 1;
    let sy = 1;
    let rot = 0;
    if (settled) {
      // landed: a big springy pop with a squash, then it floats
      const pk = clamp(since / 0.3, 0, 1);
      sc *= (0.5 + 0.5 * easeOutBack(pk)) * (c.landed ? 1.1 : 1); // the real prize stands a little bigger
      const qk = clamp(since / 0.42, 0, 1);
      const sq = Math.sin(qk * Math.PI * 2) * 0.1 * (1 - qk);
      sx = 1 + sq;
      sy = 1 - sq;
      y += Math.sin(t * 2.2) * 5 * clamp(since - 0.3, 0, 1);
      if (charging) {
        x += Math.sin(t * 90) * (1 + 8 * charge * charge);
        y += Math.cos(t * 77) * (1 + 5 * charge * charge);
        sc *= 1 + 0.06 * charge;
      }
    } else {
      const pk = clamp(since / 0.09, 0, 1);
      // the piece it replaced is punched away, growing and fading
      if (c.shown > 0 && pk < 1) {
        const prev = c.cards[c.shown - 1];
        ctx.save();
        ctx.globalAlpha *= (1 - pk) * 0.4;
        medallion(ctx, prev.type, prev.level, x, y, R * sc * (1 + 0.35 * pk), t, c.shown - 1, false);
        ctx.restore();
      }
      sc *= 0.6 + 0.4 * easeOutBack(pk);
      rot = (hash(c.shown * 3.7) - 0.5) * 0.5 * (1 - pk);
    }
    // its shadow on the stage floor
    ctx.save();
    ctx.globalAlpha *= 0.3 * rise;
    ellipse(ctx, CASE.x, CASE.y + R + 34, R * 0.7 * sc, 10 * sc);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
    // a glow that hugs the medallion
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= (0.3 + 0.4 * flare) * rise;
    const halo = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * 1.7);
    halo.addColorStop(0, col);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - R * 1.7, y - R * 1.7, R * 3.4, R * 3.4);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    medallion(ctx, card.type, card.level, 0, 0, R * sc, t, c.shown, c.landed);
    if (charging) cracks(ctx, 0, 0, R * sc, charge, aura(next, t), c.stage * 17 + c.win);
    ctx.restore();

    // shock rings rolling out from every landing and break-through
    if (settled) {
      for (let i = 0; i < 3; i++) {
        const kk = (since - i * 0.08) / 0.5;
        if (kk <= 0 || kk >= 1) continue;
        ctx.save();
        ctx.globalAlpha *= (1 - kk) * 0.85;
        circle(ctx, CASE.x, CASE.y, R + 14 + 200 * (1 - (1 - kk) ** 2));
        ctx.lineWidth = 9 * (1 - kk) + 1;
        ctx.strokeStyle = i === 0 ? '#ffffff' : classColor(lv, t);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  bigCase(ctx, 'front', CASE.x, caseY, 3.4, c.kind, open, col, glowA, 1 + q, 1 - q, wob);

  if (card && rise > 0.4 && c.fly === 0) {
    // the class, shouted above the medallion: it pops with every flick and slams in on a landing
    const big = lv >= 7 ? 56 : lv >= 6 ? 54 : lv >= 5 ? 50 : 46;
    const pop = settled ? 1 + (lv >= 6 ? 0.55 : 1.1) * Math.max(0, 1 - since / 0.16) : 1 + 0.3 * Math.max(0, 1 - since / 0.07);
    ctx.save();
    ctx.translate(CASE.x + (charging ? Math.sin(t * 60) * 3 * charge : 0), CASE.y - R - 70);
    ctx.scale(pop, pop);
    if (settled) ctx.rotate(-0.04);
    ctx.shadowColor = aura(lv, t);
    ctx.shadowBlur = settled ? 24 : 10;
    label(ctx, `${classOf(lv)}-CLASS${c.landed ? (lv >= 6 ? '!!!' : lv >= 4 ? '!!' : '!') : ''}`, 0, 0, big, { color: classColor(lv, t), lw: big * 0.2 });
    ctx.restore();

    // its name, and how rare that class is
    const ny = CASE.y + R + 42;
    label(ctx, ITEMS[card.type].name, CASE.x, ny, 25);
    if (charging) {
      ctx.save();
      ctx.globalAlpha *= 0.65 + 0.35 * Math.sin(t * 16);
      label(ctx, 'BREAKING THROUGH...', CASE.x, ny + 36, 18, { color: aura(next, t), lw: 4 });
      ctx.restore();
    } else {
      const rare = oneIn(CASES[c.kind].odds[lv - 1]); // its normal rarity, also on a guaranteed roll
      if (rare) {
        ctx.font = `17px ${FONT}`;
        const pw = ctx.measureText(rare).width + 30;
        const pp = settled ? easeOutBack(clamp((since - 0.1) / 0.22, 0, 1)) : 1;
        if (pp > 0) {
          ctx.save();
          ctx.translate(CASE.x, ny + 36);
          ctx.scale(pp, pp);
          rr(ctx, -pw / 2, -15, pw, 30, 15);
          fillStroke(ctx, 'rgba(24, 16, 36, 0.92)', 2.5, classColor(lv, t));
          label(ctx, rare, 0, 1, 17, { color: classColor(lv, t), lw: 3.5 });
          ctx.restore();
        }
      }
    }
    // a prize that can merge with a piece you already own says so
    if (c.landed && lv < MAX_LEVEL && c.revealT > 0.3) {
      const twin = [...g.inv.items, ...g.inv.tray].some((it) => it && it.type === c.prize.type && it.level === c.prize.level);
      if (twin) {
        const mp = easeOutBack(clamp((c.revealT - 0.3) / 0.22, 0, 1));
        ctx.save();
        ctx.translate(CASE.x, ny + 72);
        ctx.scale(mp, mp);
        rr(ctx, -84, -14, 168, 28, 14);
        fillStroke(ctx, COLOR.cash, 2.5);
        label(ctx, 'MERGE READY!', 0, 1, 16, { lw: 3.5 });
        ctx.restore();
      }
    }
  }

  ladder(ctx, odds, card ? lv : 0, since, t);
  pityBar(ctx, g, c, t);
  if (c.landed) {
    const p = 1 + 0.06 * Math.sin(t * 7);
    ctx.save();
    ctx.translate(W / 2, 1012);
    ctx.scale(p, p);
    label(ctx, 'TAP TO COLLECT', 0, 0, 20, { color: COLOR.toast, lw: 4.5 });
    ctx.restore();
  } else if (!settled) label(ctx, 'tap to skip', W / 2, 1012, 14, { color: COLOR.textDim, lw: 3 });
  ctx.restore();

  // the prize flying into its tray slot
  if (c.fly > 0) {
    const p = caseFlyPos(c.fly, c.slot);
    medallion(ctx, c.prize.type, c.prize.level, p.x, p.y, R * p.scale, t, c.win, false);
  }
}
