import { sfx } from '../audio';
import { CLEAR_DUR, type Battle } from '../battle';
import {
  AWAKEN_LEVEL,
  BAL,
  CELL_LOCKS,
  GEAR,
  ITEMS,
  MAX_LEVEL,
  RECIPES,
  STREETS,
  WEAPONS,
  classOf,
  cls,
  gearDesc,
  isBaseRecipe,
  isGear,
  isSuper,
  isWeapon,
  itemSellValue,
  rabbitStats,
  recipeOf,
  recipesUsing,
  streetOf,
  type CaseKind,
  type ItemType,
} from '../data';
import type { Game, Preview } from '../game';
import type { Item } from '../inventory';
import { ICON_RABBIT } from '../looks';
import { CLASS_FX, COLOR, EVO, FONT, H, L, TIER, W, trayRect } from '../theme';
import { circle, clamp, easeOutBack, fillStroke, hash, label, line, poly, rr, starPath, type Ctx, type Rect } from '../util';
import { drawRabbit, RABBIT_BOX } from './characters';
import { drawGearIcon, drawLock } from './gear';
import {
  drawCarrot,
  drawCash,
  drawChart,
  drawFastIcon,
  drawFoxBadge,
  drawGem,
  drawPauseIcon,
  drawPlayIcon,
  drawSpeaker,
  drawSwords,
  drawTrash,
} from './icons';
import { drawWeaponIcon } from './weapons';

const INK = COLOR.ink;

/** Chunky button with a darker "lip" underneath; pressed buttons sink onto the lip. Returns the content centre y. */
export function btn3d(ctx: Ctx, r: Rect, top: string, bottom: string, radius = 12, pressed = false) {
  const sink = pressed ? 4 : 0;
  rr(ctx, r.x, r.y + 5, r.w, r.h - 5, radius);
  fillStroke(ctx, bottom, 2.5);
  rr(ctx, r.x, r.y + sink, r.w, r.h - 6, radius);
  fillStroke(ctx, top, 2.5);
  rr(ctx, r.x + 6, r.y + 4 + sink, r.w - 12, (r.h - 6) * 0.36, radius * 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  return r.y + sink + (r.h - 6) / 2;
}

/** Draws text scaled up around its anchor while a counter is "bumping". */
function bumpLabel(ctx: Ctx, s: string, x: number, y: number, size: number, bump: number, align: CanvasTextAlign) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + bump * 0.3, 1 + bump * 0.3);
  label(ctx, s, 0, 0, size, { align, color: bump > 0.5 ? COLOR.toast : COLOR.white });
  ctx.restore();
}

function pill(ctx: Ctx, r: Rect) {
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = COLOR.hudPill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
}

/** Linear gradient through the rainbow rim colours (or gold), turning with t. */
function rimGradient(ctx: Ctx, r: Rect, t: number, gold = false) {
  const a = t * 1.5;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.max(r.w, r.h) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * R, cy - Math.sin(a) * R, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  if (gold) {
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(1 / 2, EVO.awake);
    g.addColorStop(1, '#c98712');
  } else EVO.rim.forEach((c, i) => g.addColorStop(i / (EVO.rim.length - 1), c));
  return g;
}

/** Shifting rainbow (SSS-class): `light` for tile backgrounds, saturated for badges and text. */
export function rainbow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number, light = false) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + t * 90) % 360}, ${light ? 90 : 85}%, ${light ? 84 : 60}%)`);
  return g;
}

/** Text colour of a class: its light metal colour, or a cycling hue for SSS. */
export function classColor(level: number, t: number) {
  return level >= MAX_LEVEL ? `hsl(${(t * 140) % 360}, 95%, 70%)` : TIER.metalLight[clamp(level, 1, MAX_LEVEL) - 1];
}

function tileFill(ctx: Ctx, level: number, x: number, y: number, w: number, h: number, t: number) {
  if (level >= MAX_LEVEL) return rainbow(ctx, x, y, x + w, y + h, t, true);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, TIER.tileLight[level - 1]);
  g.addColorStop(1, TIER.tile[level - 1]);
  return g;
}

// ---------------------------------------------------------------- weapon classes

/** Class letter badge (E..SSS) in its class colour, left edge at `left`. A is gold, S glows red, SSS is a glowing rainbow. */
export function classBadge(ctx: Ctx, level: number, left: number, cy: number, k: number, t = 0) {
  const lv = clamp(level, 1, MAX_LEVEL);
  const letter = classOf(lv);
  const h = 17 * k;
  const w = letter.length > 1 ? 31 * k : h;
  ctx.save();
  if (lv >= 6) {
    ctx.shadowColor = lv >= MAX_LEVEL ? classColor(lv, t) : CLASS_FX.s;
    ctx.shadowBlur = (7 + 5 * Math.sin(t * 6)) * k;
  }
  rr(ctx, left, cy - h / 2, w, h, h / 2);
  let fill: string | CanvasGradient = TIER.tileDark[lv - 1];
  if (lv >= MAX_LEVEL) fill = rainbow(ctx, left, cy, left + w, cy, t);
  else if (lv === 5) {
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(1, '#d9901a');
    fill = g;
  } else if (lv === 6) fill = CLASS_FX.s;
  fillStroke(ctx, fill, Math.max(1.2, 2 * k));
  ctx.restore();
  label(ctx, letter, left + w / 2, cy + 0.5 * k, (letter.length > 1 ? 10.5 : 12.5) * k, { lw: 3 * k });
}

/** A point travelling round a rectangle's edge (u = 0..1). */
function perimeter(r: Rect, u: number) {
  let d = (((u % 1) + 1) % 1) * 2 * (r.w + r.h);
  if (d < r.w) return { x: r.x + d, y: r.y };
  d -= r.w;
  if (d < r.h) return { x: r.x + r.w, y: r.y + d };
  d -= r.h;
  if (d < r.w) return { x: r.x + r.w - d, y: r.y + r.h };
  d -= r.w;
  return { x: r.x, y: r.y + r.h - d };
}

/**
 * The shine of the top classes, drawn over a tile: A gets a light sweep; S adds a pulsing red aura and twinkles;
 * SSS gets a turning rainbow rim, a rainbow aura and stars orbiting the edge.
 */
export function classFx(ctx: Ctx, level: number, r: Rect, k: number, t: number, seed: number) {
  if (level < 5) return;
  const rad = 10 * k;
  if (level >= 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4 + seed);
    ctx.save();
    ctx.shadowColor = level >= MAX_LEVEL ? classColor(level, t) : CLASS_FX.s;
    ctx.shadowBlur = (10 + 9 * pulse) * k;
    rr(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.lineWidth = 2.6 * k;
    ctx.strokeStyle = level >= MAX_LEVEL ? rainbow(ctx, r.x, r.y, r.x + r.w, r.y + r.h, t * 2) : CLASS_FX.s;
    ctx.globalAlpha *= 0.7 + 0.3 * pulse;
    ctx.stroke();
    ctx.restore();
  }
  // light sweep
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  const period = level === 5 ? 3.2 : level === 6 ? 2.2 : 1.5;
  const sweep = ((t / period + seed * 0.37) % 1) * (r.w + r.h + 80) - 40;
  ctx.globalAlpha *= level === 5 ? 0.35 : 0.5;
  ctx.fillStyle = '#ffffff';
  poly(ctx, [r.x + sweep, r.y, r.x + sweep + 14 * k, r.y, r.x + sweep + 14 * k - r.h, r.y + r.h, r.x + sweep - r.h, r.y + r.h]);
  ctx.fill();
  ctx.restore();
  if (level < 6) return;
  // twinkles at spots that change every cycle
  const n = level >= MAX_LEVEL ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const ph = t * 1.3 + i / n + seed * 0.13;
    const cyc = Math.floor(ph);
    const a = Math.sin((ph - cyc) * Math.PI);
    const px = r.x + r.w * (0.15 + 0.7 * hash(cyc * 7.1 + i * 3.3 + seed));
    const py = r.y + r.h * (0.15 + 0.7 * hash(cyc * 5.7 + i * 9.1 + seed));
    ctx.save();
    ctx.globalAlpha *= a;
    starPath(ctx, px, py, (2.5 + 3.5 * a) * k, 1 * k, 4, t);
    ctx.fillStyle = CLASS_FX.spark;
    ctx.fill();
    ctx.restore();
  }
  if (level < MAX_LEVEL) return;
  for (let i = 0; i < 3; i++) {
    const p = perimeter(r, t * 0.3 + i / 3);
    starPath(ctx, p.x, p.y, 5 * k, 2 * k, 4, t * 3);
    ctx.fillStyle = EVO.rim[(i + Math.floor(t * 4)) % EVO.rim.length];
    ctx.fill();
  }
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.lineWidth = 2.4 * k;
  ctx.strokeStyle = rimGradient(ctx, r, t * 2);
  ctx.stroke();
}

// ---------------------------------------------------------------- top HUD

/*
 * THE STAGE BAR: "CANDY 3D", built from the same parts as the game's buttons
 *
 * Why the old one looked unfit: it was a flat dark plate with thin pips and a thin bar, a "dashboard" look,
 * while everything else the player touches (START WAVE, CASE, ELITE, pause, x2, stats, sell) is a chunky
 * btn3d candy button with an ink outline, a darker bottom lip and a glossy top.
 *
 * This version is built from those same parts, as one toy-like object hanging from the top of the screen:
 *
 *   [ STAGE 3 ]           gold candy tab (the gold of the active x2 button), plugged in behind the bar,
 *  (#|#|#|[4 ]| | | | |(fox))  the bar itself is a btn3d in the navy of the pause / mute buttons
 *     ( fox 12 FOXES LEFT )    a navy status drawer tucked under the bar's lip
 *
 * - The bar holds a recessed dark track with 9 chunky candy chips (waves 1-9) and ends in a big red candy
 *   CAP (wave 10, the boss) with the white fox badge, the same red as the BOSS WAVE button.
 * - Cleared waves are solid orange candy chips (COLOR.progress / progressLight, like the CASE button) with a
 *   darker lip and a gloss line; a glint sweeps across the filled chips every few seconds.
 * - The current wave's chip is WIDE (2.6x the others) and carries the wave number, so "you are here"
 *   reads at a glance even on a phone. During the fight it fills left to right with the wave's progress
 *   (eased, so each knock-out slides the fill instead of jumping), flashes white on every knock-out, glows and
 *   has a pulsing cream outline. When the wave is cleared it stamps (scale 1.5 -> 1 with overshoot) and
 *   throws sparkles; when prep starts the wide slot slides over to the next chip (widths ease between waves).
 * - Ahead waves are empty recessed sockets.
 * - The boss cap: idle it peeks (a small wiggle every few seconds); when the boss wave is next or being
 *   fought it pulses with a red glow, the bar gets a red halo and the cap shows the wave progress as an
 *   orange ring round the fox; once the stage is cleared it turns gold with a white check that pops in after
 *   a ripple has hopped along all the chips.
 * - The drawer under the bar says what is happening now: "WAVE 4 · GET READY", fox icon + "12 FOXES LEFT"
 *   (the number bumps gold on each knock-out, exactly like the cash counter), "WAVE 4 CLEAR!" (pops in),
 *   "STAGE CLEAR!", "ON THE MOVE", "WAVE 7 LOST". Its width eases to fit the text.
 * - The STAGE tab pops when the stage number changes. A small twinkle visits its corner now and then.
 *
 * Size: x 154..386 (L.wave), y 12..104. Text: tab 17 px, chip number 15 px, drawer 14 px (all >= 13).
 * The cash / gems pills and drawHud are untouched (they keep calling waveTracker(ctx, g.battle, g.time)).
 * Uses only identifiers already imported in ui.ts (btn3d and bumpLabel are defined in ui.ts itself).
 * Module-level state (WT) only remembers eased widths / fill and the times things changed, for the animations.
 */

// NEW COLOR TOKENS
//   waveBar: '#3f4373',
//   waveBarDark: '#262949',
//   waveSocket: '#1b1830',
//   waveChipDark: '#d9821c',
//   stageTab: '#ffd23a',
//   stageTabDark: '#d99a12',
//   bossCapDark: '#c23a32',
//   bossText: '#ffb0a8',

/** Frame-to-frame memory of the wave tracker: eased chip widths, fill and drawer width, and when things changed. */
const WT = {
  lastT: -1,
  widths: [] as number[],
  fill: 0,
  tagW: 0,
  left: -1,
  bumpAt: -9,
  stage: 0,
  stageAt: -9,
};

type CapState = 'ahead' | 'next' | 'fight' | 'done';

/**
 * Top centre: the stage at a glance, as a candy toy. A gold STAGE tab, a raised navy bar with one candy chip per
 * wave (cleared ones solid orange, the current one wide with its number and filling up, the boss wave a red cap
 * with the fox badge at the end) and a drawer under it saying what is happening now.
 */
function waveTracker(ctx: Ctx, b: Battle, t: number) {
  const r = L.wave;
  const last = BAL.wavesPerStage;
  const segs = last - 1; // the boss wave is the cap, not a chip
  const cur = Math.min(last, b.wave);
  const done = b.phase === 'victory' || b.phase === 'travel';
  const cleared = b.phase === 'cleared';
  const bossOn = cur === last && !done;

  // ---- memory: eased values and the moments things changed
  const dt = WT.lastT < 0 ? 1 : clamp(t - WT.lastT, 0, 0.1);
  WT.lastT = t;
  const ease = 1 - Math.exp(-dt * 9);
  if (WT.stage !== b.stage) {
    if (WT.stage) WT.stageAt = t;
    WT.stage = b.stage;
  }
  // (b.progress is 0 after a defeat; keep showing how far the lost wave got)
  const prog = clamp(b.phase === 'defeat' ? b.waveKilled / Math.max(1, b.waveTotal) : b.progress, 0, 1);
  WT.fill = prog < WT.fill ? prog : WT.fill + (prog - WT.fill) * (1 - Math.exp(-dt * 10));
  const left = Math.max(0, b.waveTotal - b.waveKilled);
  if (b.phase === 'fight') {
    if (WT.left >= 0 && left < WT.left) WT.bumpAt = t;
    WT.left = left;
  } else WT.left = -1;
  const bump = clamp(1 - (t - WT.bumpAt) / 0.25, 0, 1);

  // ---- geometry
  const bar = { x: r.x, y: r.y + 22, w: r.w, h: 46 }; // face y 34..74, lip to 80
  const cy = bar.y + (bar.h - 6) / 2; // 54: middle of the bar's face
  const capR = 23;
  const capX = bar.x + bar.w - 24; // 362
  const track = { x: bar.x + 7, y: cy - 13, w: capX - bar.x - 2, h: 26 }; // runs on under the cap
  const x0 = track.x + 3;
  const x1 = capX - capR - 4;
  const gap = 3;
  const wide = !done && cur < last ? cur - 1 : -1; // the chip of the wave being fought (or next up)
  const unit = (x1 - x0 - gap * (segs - 1)) / (segs + (wide >= 0 ? 1.6 : 0));
  if (WT.widths.length !== segs) WT.widths = Array.from({ length: segs }, () => unit);
  for (let i = 0; i < segs; i++) WT.widths[i] += (unit * (i === wide ? 2.6 : 1) - WT.widths[i]) * ease;

  // ---- the status drawer, tucked under the bar's lip
  waveDrawer(ctx, b, left, bump, t, ease, bar.y + bar.h);

  // ---- the STAGE tab, plugged in behind the bar (it pops when the stage changes)
  ctx.font = `17px ${FONT}`;
  const stText = `STAGE ${b.stage}`;
  const tw = Math.max(104, ctx.measureText(stText).width + 40);
  const tab = { x: W / 2 - tw / 2, y: r.y, w: tw, h: 34 };
  const tk = clamp((t - WT.stageAt) / 0.45, 0, 1);
  const tabPop = 1 + 0.3 * (1 - easeOutBack(tk));
  ctx.save();
  ctx.translate(W / 2, bar.y);
  ctx.scale(tabPop, tabPop);
  ctx.translate(-W / 2, -bar.y);
  btn3d(ctx, tab, COLOR.stageTab, COLOR.stageTabDark, 12);
  label(ctx, stText, W / 2, tab.y + (bar.y - tab.y) / 2 + 1, 17, { lw: 4 });
  const ph = (t / 2.7) % 1;
  if (ph < 0.3) {
    const a = Math.sin((ph / 0.3) * Math.PI);
    ctx.globalAlpha *= a;
    starPath(ctx, tab.x + tab.w - 12, tab.y + 8, 2.5 + 3.5 * a, 1.2, 4, t * 2);
    ctx.fillStyle = CLASS_FX.spark;
    ctx.fill();
  }
  ctx.restore();

  // ---- the bar: a btn3d in the pause button's navy (with a red halo while the boss wave is on)
  if (bossOn && b.phase !== 'defeat') {
    ctx.save();
    ctx.shadowColor = COLOR.bannerBoss;
    ctx.shadowBlur = 12 + 6 * Math.sin(t * 6);
    ctx.globalAlpha *= 0.85;
    rr(ctx, bar.x, bar.y, bar.w, bar.h, 16);
    ctx.fillStyle = COLOR.bannerBoss;
    ctx.fill();
    ctx.restore();
  }
  btn3d(ctx, bar, COLOR.waveBar, COLOR.waveBarDark, 16);
  rr(ctx, track.x, track.y, track.w, track.h, 9);
  fillStroke(ctx, COLOR.waveSocket, 2.5);
  rr(ctx, track.x + 2, track.y + 2, track.w - 4, 5, 3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();

  // ---- the chips, waves 1..9
  const sweep = x0 - 40 + ((t / 3.4) % 1) * (x1 - x0 + 160); // glint position, shared by all filled chips
  let x = x0;
  let stampX = -1;
  for (let i = 0; i < segs; i++) {
    const n = i + 1;
    const w = WT.widths[i];
    const isCur = n === cur && !done;
    const fill = done || n < cur ? 1 : isCur ? (cleared ? 1 : WT.fill) : 0;
    const h = isCur ? 24 : 20;
    let y = cy - h / 2;
    if (b.phase === 'victory') {
      // all the chips hop in a ripple towards the boss cap
      const k = (b.phaseT - 0.1 - i * 0.06) / 0.3;
      if (k > 0 && k < 1) y -= Math.sin(k * Math.PI) * 6;
    }
    const mx = x + w / 2;
    ctx.save();
    if (isCur && cleared) {
      // the wave just cleared stamps in
      const k = clamp(b.phaseT / 0.3, 0, 1);
      const s = 1 + 0.5 * (1 - easeOutBack(k));
      ctx.translate(mx, cy);
      ctx.scale(s, s);
      ctx.translate(-mx, -cy);
      stampX = mx;
    }
    if (isCur && !cleared && b.phase !== 'defeat') {
      // you are here: a warm glow behind the chip
      const pulse = 0.5 + 0.5 * Math.sin(t * (b.phase === 'prep' ? 7 : 4));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(mx, cy, 0, mx, cy, 30);
      glow.addColorStop(0, `rgba(255, 190, 90, ${0.3 + 0.25 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = glow;
      circle(ctx, mx, cy, 30);
      ctx.fill();
      ctx.restore();
    }
    waveChip(ctx, x, y, w, h, fill, sweep);
    if (isCur) {
      if (!cleared) {
        const pulse = 0.5 + 0.5 * Math.sin(t * (b.phase === 'prep' ? 7 : 4));
        ctx.save();
        rr(ctx, x - 2.5, y - 2.5, w + 5, h + 5, 8);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = b.phase === 'defeat' ? COLOR.hpBad : COLOR.hereFill;
        ctx.globalAlpha *= 0.35 + 0.55 * pulse;
        ctx.stroke();
        ctx.restore();
      }
      // flash: white on a knock-out, a bright stamp when cleared
      const flash = cleared ? clamp(1 - b.phaseT / 0.25, 0, 1) : bump * 0.55;
      if (flash > 0) {
        rr(ctx, x, y, w, h, Math.min(6, w / 2));
        ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
        ctx.fill();
      }
      if (w > 22) {
        const s = 1 + 0.25 * bump;
        ctx.translate(mx, y + h / 2 + 1);
        ctx.scale(s, s);
        label(ctx, String(n), 0, 0, 15, { lw: 3.5 });
      }
    }
    ctx.restore();
    x += w + gap;
  }

  // ---- the boss cap at the end
  const state: CapState = done ? 'done' : cur < last ? 'ahead' : b.phase === 'prep' ? 'next' : b.phase === 'fight' ? 'fight' : 'ahead';
  bossCap(ctx, b, capX, cy, capR, state, WT.fill, t);

  // ---- sparkles thrown by the chip that was just cleared
  if (stampX >= 0) {
    const k = clamp(b.phaseT / 0.6, 0, 1);
    if (k < 1) {
      const d = 8 + 26 * (1 - (1 - k) * (1 - k));
      ctx.save();
      ctx.globalAlpha *= 1 - k;
      ctx.fillStyle = CLASS_FX.spark;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        starPath(ctx, stampX + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, 2 + 5 * (1 - k), 1.6, 4, t * 3);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** One wave chip: an empty recessed socket, or orange candy filled from the left (fill 0..1). */
function waveChip(ctx: Ctx, x: number, y: number, w: number, h: number, fill: number, sweep: number) {
  const rad = Math.min(6, w / 2);
  rr(ctx, x, y, w, h, rad);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
  ctx.fill();
  if (fill > 0.002) {
    const fw = Math.max(rad, w * fill);
    ctx.save();
    rr(ctx, x, y, w, h, rad);
    ctx.clip();
    rr(ctx, x, y, fw, h, fill < 1 ? Math.min(rad, fw / 2) : rad);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, COLOR.progressLight);
    g.addColorStop(0.6, COLOR.progress);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // darker lip along the bottom, gloss along the top
    ctx.fillStyle = COLOR.waveChipDark;
    ctx.fillRect(x, y + h - 5, fw, 5);
    rr(ctx, x + 3, y + 2.5, Math.max(0, fw - 6), 4, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
    // the glint running along the bar
    poly(ctx, [sweep, y, sweep + 8, y, sweep + 8 - h * 0.6, y + h, sweep - h * 0.6, y + h]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
    // the bright leading edge of a chip still filling
    if (fill < 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(x + fw - 2.5, y + 2, 2.5, h - 7);
    }
    ctx.restore();
  } else {
    // an empty socket: a shadow along its top edge
    rr(ctx, x + 1.5, y + 1.5, w - 3, 4, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
  }
  rr(ctx, x, y, w, h, rad);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
}

/** The boss wave: a red candy cap with the fox badge (pulsing and ringed with progress while it is on, gold + check once won). */
function bossCap(ctx: Ctx, b: Battle, x: number, y: number, R: number, state: CapState, fill: number, t: number) {
  const hot = state === 'next' || state === 'fight';
  let s = hot ? 1 + 0.05 * Math.sin(t * 6) : 1;
  if (state === 'done' && b.phase === 'victory') s *= 1 + 0.5 * (1 - easeOutBack(clamp((b.phaseT - 0.65) / 0.3, 0, 1)));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (hot) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.9);
    glow.addColorStop(0, `rgba(255, 90, 79, ${0.45 + 0.2 * Math.sin(t * 6)})`);
    glow.addColorStop(1, 'rgba(255, 90, 79, 0)');
    ctx.fillStyle = glow;
    circle(ctx, 0, 0, R * 1.9);
    ctx.fill();
    ctx.restore();
  }
  const won = state === 'done';
  circle(ctx, 0, 4, R);
  fillStroke(ctx, won ? COLOR.stageTabDark : COLOR.bossCapDark, 2.5);
  circle(ctx, 0, 0, R);
  fillStroke(ctx, won ? COLOR.stageTab : COLOR.bannerBoss, 2.5);
  ctx.beginPath();
  ctx.ellipse(0, -R * 0.5, R * 0.62, R * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
  if (won) {
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-3, 7);
    ctx.lineTo(10, -8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = COLOR.white;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    return;
  }
  // a socket ring round the badge, filled with the boss wave's progress
  circle(ctx, 0, 0, R - 6);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.stroke();
  if (state === 'fight' && fill > 0.002) {
    ctx.beginPath();
    ctx.arc(0, 0, R - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = COLOR.progressLight;
    ctx.stroke();
  }
  // the fox: peeks now and then while it waits, fidgets when it is next, shakes with rage in its wave
  let rot = 0;
  let dx = 0;
  if (state === 'ahead') {
    const p = (t / 4.5) % 1;
    if (p < 0.14) rot = Math.sin((p / 0.14) * Math.PI * 3) * 0.2;
  } else if (state === 'next') rot = Math.sin(t * 9) * 0.12;
  else {
    dx = Math.sin(t * 37) * 0.8;
    rot = Math.sin(t * 5) * 0.06;
  }
  ctx.translate(dx, 1.5);
  ctx.rotate(rot);
  drawFoxBadge(ctx, 0, 0, 0.92);
  ctx.restore();
}

/** The drawer under the bar: what is happening now (foxes left in a fight, GET READY, CLEAR...). */
function waveDrawer(ctx: Ctx, b: Battle, left: number, bump: number, t: number, ease: number, top: number) {
  const size = 14;
  const ty = top + 12.5;
  let text = '';
  let color: string = COLOR.white;
  let pop = 0; // seconds since this text appeared, for the ones that stamp in
  let alpha = 1;
  const fight = b.phase === 'fight';
  if (b.phase === 'prep') {
    text = b.isBossWave ? 'BOSS WAVE · GET READY' : `WAVE ${b.wave} · GET READY`;
    if (b.isBossWave) {
      color = COLOR.bossText;
      alpha = 0.75 + 0.25 * Math.sin(t * 6);
    }
  } else if (b.phase === 'cleared') {
    text = `WAVE ${b.clearedWave} CLEAR!`;
    color = COLOR.cash;
    pop = b.phaseT;
  } else if (b.phase === 'victory') {
    text = 'STAGE CLEAR!';
    color = COLOR.stageTab;
    pop = b.phaseT - 0.65;
  } else if (b.phase === 'travel') {
    text = 'ON THE MOVE';
    color = COLOR.toast;
  } else if (b.phase === 'defeat') {
    text = `WAVE ${b.wave} LOST`;
    color = COLOR.hpBad;
  }
  ctx.font = `${size}px ${FONT}`;
  const num = String(left);
  const rest = left === 1 ? ' FOX LEFT' : ' FOXES LEFT';
  const numW = ctx.measureText(num).width;
  const contentW = fight ? 22 + numW + ctx.measureText(rest).width : ctx.measureText(text).width;
  const target = clamp(contentW + 32, 120, 228);
  WT.tagW = WT.tagW > 0 ? WT.tagW + (target - WT.tagW) * ease : target;
  const w = WT.tagW;
  rr(ctx, W / 2 - w / 2, top - 14, w, 38, 12);
  fillStroke(ctx, COLOR.waveBarDark, 2.5);
  rr(ctx, W / 2 - w / 2 + 3, top, w - 6, 4, 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fill();
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (fight) {
    const lx = W / 2 - contentW / 2;
    drawFoxBadge(ctx, lx + 8, ty, 0.62);
    bumpLabel(ctx, num, lx + 22, ty + 1, size, bump, 'left');
    label(ctx, rest, lx + 22 + numW, ty + 1, size, { align: 'left', lw: 3 });
  } else if (text) {
    if (pop > 0 || b.phase === 'cleared') {
      const s = 1 + 0.4 * (1 - easeOutBack(clamp(pop / 0.3, 0, 1)));
      ctx.translate(W / 2, ty);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -ty);
    }
    if (b.phase !== 'victory' || pop > 0) label(ctx, text, W / 2, ty + 1, size, { color, lw: 3 });
  }
  ctx.restore();
}

export function drawHud(ctx: Ctx, g: Game) {
  pill(ctx, L.cash);
  drawCash(ctx, L.cash.x + 20, L.cash.y + L.cash.h / 2, 1 + g.cashBump * 0.15);
  bumpLabel(ctx, String(g.econ.cash), L.cash.x + 48, L.cash.y + L.cash.h / 2 + 1, 30, g.cashBump, 'left');

  pill(ctx, L.gems);
  bumpLabel(ctx, String(g.econ.gems), L.gems.x + 16, L.gems.y + L.gems.h / 2 + 1, 30, g.gemBump, 'left');
  drawGem(ctx, L.gems.x + L.gems.w - 22, L.gems.y + L.gems.h / 2, 1.05 + g.gemBump * 0.15);

  waveTracker(ctx, g.battle, g.time);

  const pm = btn3d(ctx, L.pause, '#3f4373', '#262949', 14, g.isPressed(L.pause));
  if (g.paused) drawPlayIcon(ctx, L.pause.x + L.pause.w / 2, pm);
  else drawPauseIcon(ctx, L.pause.x + L.pause.w / 2, pm);

  const fast = g.speed === 2;
  const sm = btn3d(ctx, L.speed, fast ? '#ffd23a' : '#b8b4c4', fast ? '#d99a12' : '#7d7990', 12, g.isPressed(L.speed));
  drawFastIcon(ctx, L.speed.x + L.speed.w / 2, sm - 3);
  label(ctx, fast ? 'x2' : 'x1', L.speed.x + L.speed.w - 13, sm + 11, 16);
}

// ---------------------------------------------------------------- grid tiles

function rabbitIcon(ctx: Ctx, level: number, cx: number, cy: number, maxW: number, maxH: number, t: number) {
  const [x0, y0, x1, y1] = RABBIT_BOX;
  const s = Math.min(maxW / (x1 - x0), maxH / (y1 - y0));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  drawRabbit(ctx, {
    face: 1,
    walk: t * 3,
    moving: false,
    aim: 0,
    aimAngle: 0,
    atk: 0,
    flash: false,
    blink: t % 3.3 < 0.12,
    hop: 0,
    weapon: 'fist',
    level: 1,
    style: ICON_RABBIT,
    rLevel: level,
    noShadow: true,
  });
  ctx.restore();
}

/** Any piece's icon, centred in a box. */
export function pieceIcon(ctx: Ctx, type: ItemType, level: number, cx: number, cy: number, maxW: number, maxH: number, t = 0) {
  if (type === 'rabbit') rabbitIcon(ctx, level, cx, cy, maxW, maxH, t);
  else if (isGear(type)) drawGearIcon(ctx, type, level, cx, cy, maxW, maxH);
  else drawWeaponIcon(ctx, type, level, cx, cy, maxW, maxH, t * 3);
}

/**
 * Super weapon frame: a turning rainbow rim (gold when Awakened), a light shimmer sweeping across,
 * and a star badge with the class letter instead of the round one.
 */
function evoFrame(ctx: Ctx, it: Item, r: Rect, k: number, t: number) {
  const awake = it.level >= AWAKEN_LEVEL;
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, 10 * k);
  ctx.save();
  ctx.clip();
  const sweep = ((t / 2.5 + it.id * 0.37) % 1) * (r.w + r.h + 60) - 30;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  poly(ctx, [r.x + sweep, r.y, r.x + sweep + 14 * k, r.y, r.x + sweep + 14 * k - r.h, r.y + r.h, r.x + sweep - r.h, r.y + r.h]);
  ctx.fill();
  ctx.restore();
  rr(ctx, r.x, r.y, r.w, r.h, 10 * k);
  ctx.lineWidth = 3.2 * k;
  ctx.strokeStyle = rimGradient(ctx, r, t, awake);
  ctx.stroke();
  const bx = r.x + 12 * k;
  const by = r.y + 12 * k;
  const letter = classOf(it.level);
  starPath(ctx, bx, by, 12.5 * k, 6.2 * k, 5);
  fillStroke(ctx, it.level >= MAX_LEVEL ? rainbow(ctx, bx - 12, by, bx + 12, by, t) : it.level === 6 ? CLASS_FX.s : awake ? '#c98712' : EVO.badge, Math.max(1.2, 1.8 * k));
  label(ctx, letter, bx, by + 1 * k, (letter.length > 1 ? 7.5 : 11) * k, { color: EVO.badgeLight, lw: 3 * k });
  ctx.restore();
}

/** One grid piece: coloured by class, with its icon and a class badge. t = clock for idle animations. */
export function drawTile(ctx: Ctx, it: Item, x: number, y: number, w: number, h: number, idle = false, t = 0) {
  const lv = clamp(it.level, 1, MAX_LEVEL);
  const k = Math.min(w, h) / 64;
  const pad = 3 * k;
  rr(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 10 * k);
  fillStroke(ctx, tileFill(ctx, lv, x, y, w, h, t), Math.max(1.5, 2.5 * k));
  rr(ctx, x + pad + 3 * k, y + pad + 3 * k, w - pad * 2 - 6 * k, h - pad * 2 - 6 * k, 8 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2 * k;
  ctx.stroke();

  const cx = x + w / 2;
  const cy = y + h / 2;
  if (it.type === 'rabbit') rabbitIcon(ctx, lv, cx, cy + 2 * k, w - 16 * k, h - 14 * k, t + it.id * 0.7);
  else if (isGear(it.type)) {
    drawGearIcon(ctx, it.type, lv, cx, cy - 2 * k, w - 20 * k, h - 24 * k);
    // gear tiles carry a stripe in their boost colour, matching the joints and badges they give
    rr(ctx, x + pad + 6 * k, y + h - pad - 9 * k, w - pad * 2 - 12 * k, 5 * k, 2.5 * k);
    ctx.fillStyle = GEAR[it.type].color;
    ctx.fill();
  } else drawWeaponIcon(ctx, it.type, lv, cx, cy, w - 18 * k, h - 18 * k, t * 3);

  const inner = { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 };
  classFx(ctx, lv, inner, k, t, it.id);
  if (isSuper(it.type)) evoFrame(ctx, it, inner, k, t);
  else classBadge(ctx, lv, x + pad + 2 * k, y + pad + 10 * k, k, t);

  if (idle) {
    rr(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 10 * k);
    ctx.fillStyle = 'rgba(35, 30, 45, 0.5)';
    ctx.fill();
    label(ctx, 'IDLE', cx, y + h - 13 * k, 12 * k, { color: '#ffd0d0', lw: 3 * k });
  }
}

/** Joint drawn across the edge where two pieces work together: orange = armed squad, gear colour = boost. */
function joint(ctx: Ctx, c1: number, r1: number, c2: number, r2: number, color: string = COLOR.joint) {
  const gr = L.grid;
  const mx = gr.x + ((c1 + c2) / 2 + 0.5) * gr.cell;
  const my = gr.y + ((r1 + r2) / 2 + 0.5) * gr.cell;
  if (color === COLOR.joint) {
    if (r1 === r2) rr(ctx, mx - 5, my - 10, 10, 20, 4);
    else rr(ctx, mx - 10, my - 5, 20, 10, 4);
  } else {
    // gear boost: small diamond so it reads differently from the squad link
    poly(ctx, [mx, my - 7, mx + 7, my, mx, my + 7, mx - 7, my]);
  }
  fillStroke(ctx, color, 2);
}

/** Name + what it does (+ what it can evolve into), shown in a card while a piece is being dragged. */
function itemInfo(it: Item, g: Game, prev: Preview | null): { title: string; desc: string; extra?: string; extraColor: string } {
  const known = (s: keyof typeof EVO.accent) => (g.discovered.has(s) ? WEAPONS[s].name : '???');
  let title = `${ITEMS[it.type].name}  ·  ${cls(it.level)}`;
  let desc: string;
  let extra: string | undefined;
  let extraColor: string = EVO.glow;
  if (it.type === 'rabbit') desc = 'Weapons touching it become squads. Higher class = tougher soldiers';
  else if (isGear(it.type)) desc = gearDesc(it.type, it.level);
  else if (isSuper(it.type)) {
    const w = WEAPONS[it.type];
    const r = recipeOf(it.type);
    title = `★ ${w.name}  ·  ${cls(it.level)}`;
    desc = `${w.evo?.blurb ?? ''}  ·  ${Math.round(rabbitStats(it.type, it.level, 1).dmg)} dmg`;
    if (it.level >= AWAKEN_LEVEL) extra = `AWAKENED: ${w.evo?.awake ?? ''}`;
    else extra = `Feed a ${cls(it.level)} ${ITEMS[r.main].name} or ${ITEMS[r.partner].name} → ${cls(it.level + 1)}`;
  } else {
    const st = rabbitStats(it.type, it.level, 1);
    desc = `Touch a rabbit to arm a squad  ·  ${Math.round(st.dmg)} dmg  ·  ${st.w.melee ? 'melee' : `range ${st.w.range}`}`;
  }
  if (!isSuper(it.type)) {
    const uses = recipesUsing(it.type);
    if (uses.length) {
      extra = `${cls(BAL.evoMinLevel)}+, same class: ` + uses.map((r) => `+ ${ITEMS[r.main === it.type ? r.partner : r.main].name} → ${known(r.result)}`).join('  ·  ');
    }
  }
  if (prev?.mode === 'fuse') {
    const f = prev.fusion;
    const awake = f.feed ? f.level === AWAKEN_LEVEL : f.level >= AWAKEN_LEVEL;
    title = f.feed ? `CLASS UP → ${WEAPONS[f.result].name} ${cls(f.level)}` : `EVOLVE → ${known(f.result)}${awake ? '  (AWAKENED!)' : ''}`;
  } else if (prev?.mode === 'nofuse') {
    extra = prev.why;
    extraColor = COLOR.hpBad;
  }
  return { title, desc, extra, extraColor };
}

function infoCard(ctx: Ctx, it: Item, g: Game, prev: Preview | null) {
  const { title, desc, extra, extraColor } = itemInfo(it, g, prev);
  ctx.font = `13px ${FONT}`;
  const textW = Math.max(ctx.measureText(desc).width, extra ? ctx.measureText(extra).width : 0, 160);
  const w = Math.min(W - 16, textW + 36);
  const h = extra ? L.infoCard.hTall : L.infoCard.h;
  const bottom = L.infoCard.y + L.infoCard.h / 2;
  const top = bottom - h;
  rr(ctx, W / 2 - w / 2, top, w, h, 14);
  fillStroke(ctx, 'rgba(28, 22, 38, 0.92)', 2.5);
  const color = prev?.mode === 'fuse' ? EVO.glow : isGear(it.type) ? GEAR[it.type].color : isSuper(it.type) ? EVO.accent[it.type] : classColor(it.level, g.time);
  label(ctx, title, W / 2, top + 17, 18, { color });
  label(ctx, desc, W / 2, top + 38, 13, { color: COLOR.textDim, lw: 3 });
  if (extra) label(ctx, extra, W / 2, top + 57, 12.5, { color: extraColor, lw: 3 });
}

/** Draws a tile, bouncing it if it was just placed, merged or bought. */
function poppedTile(ctx: Ctx, g: Game, it: Item, x: number, y: number, w: number, h: number, idle = false) {
  const s = g.popScale(it.id);
  if (s === 1) return drawTile(ctx, it, x, y, w, h, idle, g.time);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  drawTile(ctx, it, x, y, w, h, idle, g.time);
  ctx.restore();
}

/** A square card for a piece (tray and case strip): class colours, big icon, class badge and the class shine. */
function cardBody(ctx: Ctx, type: ItemType, level: number, r: Rect, t: number, seed: number, badge = true) {
  const lv = clamp(level, 1, MAX_LEVEL);
  const k = r.w / 78;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  rr(ctx, r.x, r.y + 4, r.w, r.h - 4, 14 * k);
  ctx.fillStyle = TIER.tileDark[lv - 1];
  ctx.fill();
  rr(ctx, r.x, r.y, r.w, r.h - 4, 14 * k);
  fillStroke(ctx, tileFill(ctx, lv, r.x, r.y, r.w, r.h, t), 2.5);
  rr(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 12, 10 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (type === 'rabbit') rabbitIcon(ctx, lv, cx, cy, r.w - 24 * k, r.h - 18 * k, t + seed * 0.7);
  else if (isGear(type)) {
    drawGearIcon(ctx, type, lv, cx, cy - 2, r.w - 26 * k, r.h - 28 * k);
    rr(ctx, r.x + 10 * k, r.y + r.h - 14 * k, 26 * k, 5 * k, 2.5 * k);
    ctx.fillStyle = GEAR[type].color;
    ctx.fill();
  } else drawWeaponIcon(ctx, type, lv, cx, cy - 2, r.w - 22 * k, r.h - 26 * k, t * 3);
  classFx(ctx, lv, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 6 }, k, t, seed);
  if (badge) classBadge(ctx, lv, r.x + 5 * k, r.y + 13 * k, k, t);
}

/**
 * A tray piece shown as a full square card (instead of a squeezed copy of its grid shape),
 * with small pips in the corner showing its footprint on the grid.
 */
function trayCard(ctx: Ctx, g: Game, it: Item, r: Rect) {
  const lv = clamp(it.level, 1, MAX_LEVEL);
  const s = g.popScale(it.id);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  const sup = isSuper(it.type);
  cardBody(ctx, it.type, lv, r, g.time, it.id, !sup);
  if (sup) evoFrame(ctx, it, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 6 }, 1.1, g.time);
  // footprint pips
  const p = 5;
  const px = r.x + r.w - 9 - it.w * (p + 1.5);
  const py = r.y + r.h - 11 - it.h * (p + 1.5);
  ctx.fillStyle = TIER.tileDark[lv - 1];
  for (let c = 0; c < it.w; c++) {
    for (let rw = 0; rw < it.h; rw++) {
      rr(ctx, px + c * (p + 1.5), py + rw * (p + 1.5), p, p, 1.5);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A weapon case: a little armoured crate with a handle, stripes and a latch. */
function drawCaseIcon(ctx: Ctx, x: number, y: number, s: number, kind: CaseKind, t: number) {
  const body = kind === 'elite' ? '#7b3fc4' : kind === 'free' ? '#e8772e' : '#3f6fb8';
  const dark = kind === 'elite' ? '#5a2a96' : kind === 'free' ? '#b8561c' : '#2c4f88';
  const trim = kind === 'elite' ? '#ffd24a' : '#ffb43a';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  rr(ctx, -7, -18, 14, 8, 3);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#8f8a99';
  ctx.stroke();
  rr(ctx, -17, -12, 34, 25, 5);
  fillStroke(ctx, body, 2.4);
  rr(ctx, -17, 2, 34, 11, 4);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-12, -12, 4, 25);
  ctx.fillRect(8, -12, 4, 25);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  line(ctx, -17, 2, 17, 2);
  rr(ctx, -4.5, -3, 9, 9, 2);
  fillStroke(ctx, trim, 1.8);
  // glint sweeping across
  const gx = ((t * 0.7) % 1.6) * 50 - 30;
  if (gx > -17 && gx < 17) {
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = '#ffffff';
    poly(ctx, [gx, -11, gx + 4, -11, gx - 3, 12, gx - 7, 12]);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- bottom panel

function lockedCell(ctx: Ctx, g: Game, c: number, r: number) {
  const gr = L.grid;
  const x = gr.x + c * gr.cell;
  const y = gr.y + r * gr.cell;
  const cx = x + gr.cell / 2;
  const cy = y + gr.cell / 2;
  rr(ctx, x + 3, y + 3, gr.cell - 6, gr.cell - 6, 8);
  ctx.fillStyle = 'rgba(22, 18, 30, 0.5)';
  ctx.fill();
  const lock = g.cellLock(c, r);
  if (lock.kind === 'cash') {
    const cost = g.cellCost;
    const canPay = g.econ.cash >= cost;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = canPay ? `rgba(95, 209, 111, ${0.55 + 0.35 * Math.sin(g.time * 4)})` : 'rgba(255,255,255,0.18)';
    ctx.stroke();
    ctx.setLineDash([]);
    drawLock(ctx, cx, cy - 7, 0.85);
    drawCash(ctx, cx - 10, cy + 16, 0.36);
    label(ctx, String(cost), cx + 1, cy + 16, 14, { align: 'left', color: canPay ? COLOR.cash : COLOR.textDim, lw: 3 });
  } else if (lock.kind === 'stage') {
    // opens by itself on reaching that stage
    const next = g.battle.stage + 1 === lock.stage;
    ctx.save();
    ctx.globalAlpha = 0.6;
    drawLock(ctx, cx, cy - 9, 0.7);
    ctx.restore();
    label(ctx, `STAGE ${lock.stage}`, cx, cy + 15, 11.5, { color: next ? '#ffd36b' : '#e6a95a', lw: 3 });
    if (next) {
      ctx.strokeStyle = `rgba(255, 211, 107, ${0.4 + 0.3 * Math.sin(g.time * 3)})`;
      ctx.lineWidth = 2;
      rr(ctx, x + 3, y + 3, gr.cell - 6, gr.cell - 6, 8);
      ctx.stroke();
    }
  } else {
    // opens after enough knock-outs, with a progress bar
    const done = Math.min(g.kos, lock.count);
    const frac = done / lock.count;
    ctx.save();
    ctx.globalAlpha = 0.75;
    drawFoxBadge(ctx, cx, cy - 10, 0.62);
    ctx.restore();
    label(ctx, `${done}/${lock.count}`, cx, cy + 10, 11, { color: '#ffb3a8', lw: 3 });
    rr(ctx, cx - 22, cy + 18, 44, 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    if (frac > 0) {
      rr(ctx, cx - 22, cy + 18, 44 * frac, 6, 3);
      ctx.fillStyle = '#ff7a59';
      ctx.fill();
    }
  }
}

export function drawPanel(ctx: Ctx, g: Game) {
  const locked = !g.canManage;
  ctx.save();
  if (g.panelShake > 0) ctx.translate(Math.sin(g.time * 70) * 7 * g.panelShake, 0);
  // power tab
  const t = L.powerTab;
  poly(ctx, [t.x, t.y + t.h, t.x + 16, t.y, t.x + t.w - 16, t.y, t.x + t.w, t.y + t.h]);
  fillStroke(ctx, '#3b3742', 3);
  drawCarrot(ctx, t.x + 52, t.y + t.h / 2 + 2, 0.95 + g.powerBump * 0.25, 0.6);
  bumpLabel(ctx, String(Math.round(g.powerShown)), t.x + 72, t.y + t.h / 2 + 3, 26, g.powerBump, 'left');

  // frame
  const p = L.panel;
  rr(ctx, p.x, p.y, p.w, p.h, 16);
  fillStroke(ctx, COLOR.panelFrame, 3);
  rr(ctx, p.x + 9, p.y + 9, p.w - 18, p.h - 18, 10);
  fillStroke(ctx, COLOR.panelInner, 3, COLOR.panelInnerEdge);
  for (const [bx, by] of [
    [p.x + 5, p.y + 5],
    [p.x + p.w - 5, p.y + 5],
    [p.x + 5, p.y + p.h - 5],
    [p.x + p.w - 5, p.y + p.h - 5],
  ]) {
    circle(ctx, bx, by, 3);
    fillStroke(ctx, '#c4bfcc', 1.5);
  }

  // cells: open ones are dark slots; locked ones show how they open (cash, a stage, or knock-outs)
  const gr = L.grid;
  for (let c = 0; c < gr.cols; c++) {
    for (let r = 0; r < gr.rows; r++) {
      if (!g.inv.isOpen(c, r)) {
        lockedCell(ctx, g, c, r);
        continue;
      }
      rr(ctx, gr.x + c * gr.cell + 3, gr.y + r * gr.cell + 3, gr.cell - 6, gr.cell - 6, 8);
      ctx.fillStyle = COLOR.cell;
      ctx.fill();
    }
  }

  const prev = g.dropPreview();
  if (prev?.mode === 'place' && g.drag) {
    ctx.fillStyle = prev.ok ? COLOR.valid : COLOR.invalid;
    for (let c = prev.col; c < prev.col + g.drag.item.w; c++) {
      for (let r = prev.row; r < prev.row + g.drag.item.h; r++) {
        if (c < 0 || r < 0 || c >= gr.cols || r >= gr.rows) continue;
        rr(ctx, gr.x + c * gr.cell + 3, gr.y + r * gr.cell + 3, gr.cell - 6, gr.cell - 6, 8);
        ctx.fill();
      }
    }
  }

  // pieces (weapons without a rabbit and gear touching nothing it can boost are IDLE)
  const links = g.inv.links();
  for (const it of g.inv.items) {
    const idle = (isWeapon(it.type) && !links.has(it)) || (isGear(it.type) && g.inv.gearTargets(it).length === 0);
    poppedTile(ctx, g, it, gr.x + it.col * gr.cell, gr.y + it.row * gr.cell, it.w * gr.cell, it.h * gr.cell, idle);
  }
  for (const e of g.inv.linkEdges()) joint(ctx, e.c1, e.r1, e.c2, e.r2, e.color);
  // boosted pieces show a coloured dot per gear type boosting them
  for (const it of g.inv.items) {
    const boosts = g.inv.boostsOn(it);
    boosts.forEach((type, i) => {
      const bx = gr.x + (it.col + it.w) * gr.cell - 12 - i * 13;
      const by = gr.y + (it.row + it.h) * gr.cell - 12;
      circle(ctx, bx, by, 5.5);
      fillStroke(ctx, GEAR[type].color, 1.8);
    });
  }

  // tray
  for (let i = 0; i < L.tray.count; i++) {
    const r = trayRect(i);
    const hot = prev?.mode === 'tray' && prev.index === i;
    const it = g.inv.tray[i];
    if (it) {
      trayCard(ctx, g, it, r);
      continue;
    }
    rr(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = hot ? 'rgba(110, 230, 120, 0.35)' : 'rgba(40, 32, 48, 0.28)';
    ctx.fill();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hot ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // during a wave the grid and tray are locked: a dark veil and a badge say so
  if (locked && !g.battle.over) {
    const p = L.panel;
    rr(ctx, p.x + 9, p.y + 9, p.w - 18, p.h - 18, 10);
    ctx.fillStyle = 'rgba(16, 10, 26, 0.38)';
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const r = trayRect(i);
      rr(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = 'rgba(16, 10, 26, 0.38)';
      ctx.fill();
    }
    const bw = 230;
    const by = p.y + p.h - 4;
    rr(ctx, W / 2 - bw / 2, by - 15, bw, 30, 15);
    fillStroke(ctx, '#3b3742', 2.5);
    drawLock(ctx, W / 2 - bw / 2 + 22, by + 1, 0.55);
    label(ctx, g.battle.phase === 'travel' ? 'ON THE MOVE' : 'LOCKED: WAVE IN PROGRESS', W / 2 + 12, by + 1, 13, { color: '#ffd0d0', lw: 3 });
  }

  // hints: gold pulse + arrow = can merge; rainbow pulse + EVO star = can evolve (the first pair is joined by a flowing arc)
  const pairs = g.fusePairs();
  if (!g.drag && !g.evo && !g.case && !locked) {
    const inPair = new Set<Item>();
    for (const [a, b] of pairs) {
      inPair.add(a);
      inPair.add(b);
    }
    const pulse = 0.55 + 0.45 * Math.sin(g.time * 6);
    for (const it of g.mergeable()) {
      const r = g.itemRect(it);
      ctx.save();
      ctx.globalAlpha = pulse;
      rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 12);
      ctx.strokeStyle = COLOR.merge;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();
      const ax = r.x + r.w - 12 - (inPair.has(it) ? 22 : 0);
      const ay = r.y + 12 + Math.sin(g.time * 6) * 2;
      circle(ctx, ax, ay, 8.5);
      fillStroke(ctx, COLOR.merge, 2);
      poly(ctx, [ax, ay - 5, ax + 4.5, ay + 0.5, ax + 1.6, ay + 0.5, ax + 1.6, ay + 4.5, ax - 1.6, ay + 4.5, ax - 1.6, ay + 0.5, ax - 4.5, ay + 0.5]);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    for (const it of inPair) {
      const r = g.itemRect(it);
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 7);
      rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 12);
      ctx.strokeStyle = rimGradient(ctx, r, g.time * 2);
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.restore();
      const sx = r.x + r.w - 11;
      const sy = r.y + 11 + Math.sin(g.time * 6 + 1) * 2;
      starPath(ctx, sx, sy, 11, 5.5, 5, g.time);
      fillStroke(ctx, EVO.glow, 1.8);
      label(ctx, 'EVO', sx, sy + 1, 8, { lw: 2.5 });
    }
    if (pairs.length) {
      const [a, b] = pairs[0];
      const ra = g.itemRect(a);
      const rb = g.itemRect(b);
      const ax = ra.x + ra.w / 2;
      const ay = ra.y + ra.h / 2;
      const bx = rb.x + rb.w / 2;
      const by = rb.y + rb.h / 2;
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -g.time * 30;
      ctx.strokeStyle = EVO.glow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 40, bx, by);
      ctx.stroke();
      ctx.restore();
    }
    // a C-class+ recipe piece with no partner yet twinkles, so reaching C visibly means something
    for (const it of [...g.inv.items, ...g.inv.tray]) {
      if (!it || inPair.has(it) || isSuper(it.type) || it.level < BAL.evoMinLevel || !recipesUsing(it.type).some(isBaseRecipe)) continue;
      const r = g.itemRect(it);
      const tw = 0.5 + 0.5 * Math.sin(g.time * 5 + it.id);
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.6 * tw;
      const dx = r.x + 31 + (it.level >= MAX_LEVEL ? 10 : 0);
      const dy = r.y + 12;
      poly(ctx, [dx, dy - 6 - tw * 2, dx + 4, dy, dx, dy + 6 + tw * 2, dx - 4, dy]);
      fillStroke(ctx, EVO.glow, 1.4);
      ctx.restore();
    }
  }

  // drop previews: merge (gold), evolve (rainbow + predicted power change), or a related piece at the wrong class (red)
  if (prev?.mode === 'merge') {
    const r = g.itemRect(prev.target);
    const pulse = 0.6 + 0.4 * Math.sin(g.time * 12);
    ctx.save();
    ctx.globalAlpha = pulse;
    rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 12);
    ctx.strokeStyle = COLOR.merge;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
    label(ctx, `MERGE → ${classOf(prev.target.level + 1)}`, r.x + r.w / 2, r.y - 6, 17, { color: COLOR.merge });
  } else if (prev?.mode === 'fuse') {
    const r = g.itemRect(prev.target);
    ctx.save();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(g.time * 12);
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.strokeStyle = rimGradient(ctx, r, g.time * 4);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    const word = prev.fusion.feed ? 'CLASS UP!' : 'EVOLVE!';
    label(ctx, word, r.x + r.w / 2, r.y - 8, 19, { color: EVO.glow });
    const gain = prev.gain;
    label(ctx, `${gain >= 0 ? '+' : ''}${gain}`, r.x + r.w / 2, r.y - 28, 15, { color: gain >= 0 ? COLOR.cash : COLOR.hpBad });
  } else if (prev?.mode === 'nofuse') {
    const r = g.itemRect(prev.target);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(g.time * 12);
    rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 12);
    ctx.strokeStyle = COLOR.hpBad;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // stats
  const st = btn3d(ctx, L.stats, '#3ec5e8', '#1f8fb3', 14, g.isPressed(L.stats));
  drawChart(ctx, L.stats.x + L.stats.w / 2, st - 1, 1);

  // sell: icon-only coral button, same shape as the stats button; it lights up while a piece is dragged
  const dragging = !!g.drag?.moved;
  const sellHot = prev?.mode === 'sell';
  const sl = btn3d(ctx, L.sell, sellHot ? '#ff8a6e' : dragging ? '#f2705f' : '#e8675a', sellHot ? '#c2493c' : '#b24a40', 14, sellHot);
  drawTrash(ctx, L.sell.x + L.sell.w / 2, sl + 1, sellHot ? 1.25 : 1.12);
  if (dragging && g.drag) {
    const v = itemSellValue(g.drag.item.type, g.drag.item.level);
    label(ctx, `+${v}`, L.sell.x + L.sell.w / 2, L.sell.y - 12, sellHot ? 22 : 18, { color: COLOR.cash });
  }

  // cases: cash case (price climbs, A-class or better guaranteed every few), elite case for gems
  const hasRoom = g.inv.tray.includes(null);
  const busy = !!g.case || locked;
  const cb = L.caseBtn;
  const canCase = hasRoom && !busy && g.econ.cash >= g.caseCost;
  ctx.save();
  if (canCase && g.time % 3.2 < 0.45) {
    // a little shake now and then while affordable
    const w = Math.sin((g.time % 3.2) * 40) * 0.04 * (1 - (g.time % 3.2) / 0.45);
    ctx.translate(cb.x + cb.w / 2, cb.y + cb.h / 2);
    ctx.rotate(w);
    ctx.translate(-(cb.x + cb.w / 2), -(cb.y + cb.h / 2));
  }
  const cm = btn3d(ctx, cb, canCase ? '#ffb43a' : '#a9a3ae', canCase ? '#cf7f17' : '#77707d', 12, g.isPressed(cb));
  drawCaseIcon(ctx, cb.x + 32, cm + 2, 0.95, 'basic', g.time);
  label(ctx, 'CASE', cb.x + 100, cm - 7, 23);
  const left = g.pityLeft;
  label(ctx, left <= 1 ? 'A+ GUARANTEED!' : `A+ IN ${left}`, cb.x + 100, cm + 13, 11, { color: left <= 3 ? '#fff3a0' : COLOR.white, lw: 3 });
  drawCash(ctx, cb.x + 170, cm, 0.6);
  label(ctx, String(g.caseCost), cb.x + 186, cm + 1, 22, { align: 'left' });
  ctx.restore();

  const eb = L.eliteBtn;
  const canElite = hasRoom && !busy && g.econ.gems >= BAL.eliteCost;
  const em = btn3d(ctx, eb, canElite ? '#c26bff' : '#a69aae', canElite ? '#8a3fd0' : '#776d80', 12, g.isPressed(eb));
  drawCaseIcon(ctx, eb.x + 28, em + 2, 0.85, 'elite', g.time + 0.8);
  label(ctx, 'ELITE', eb.x + 85, em - 7, 20);
  label(ctx, 'NO E-CLASS', eb.x + 85, em + 13, 10, { lw: 3 });
  drawGem(ctx, eb.x + 135, em, 0.58);
  label(ctx, String(BAL.eliteCost), eb.x + 148, em + 1, 20, { align: 'left' });
  if (canElite) {
    const tw = (g.time * 0.8) % 1;
    ctx.save();
    ctx.globalAlpha = Math.sin(tw * Math.PI);
    starPath(ctx, eb.x + eb.w - 10, eb.y + 8, 6, 2, 4, g.time);
    ctx.fillStyle = CLASS_FX.spark;
    ctx.fill();
    ctx.restore();
  }
  if (locked && !g.battle.over) {
    for (const r of [cb, eb]) {
      circle(ctx, r.x + r.w - 6, r.y + 6, 12);
      fillStroke(ctx, '#3b3742', 2);
      drawLock(ctx, r.x + r.w - 6, r.y + 7, 0.42);
    }
  }

  // sound on/off
  const mm = btn3d(ctx, L.mute, '#3f4373', '#262949', 12, g.isPressed(L.mute));
  drawSpeaker(ctx, L.mute.x + L.mute.w / 2, mm, sfx.muted);
  ctx.restore();
}

// ---------------------------------------------------------------- prep and wave clear

/** Prep time: a big START button on the road (the wave waits for it) and what to do now. */
export function drawPrep(ctx: Ctx, g: Game) {
  const b = g.battle;
  if (b.phase !== 'prep' || g.paused || g.case) return;
  const r = L.startBtn;
  const boss = b.isBossWave;
  const appear = easeOutBack(clamp(b.prepAge / 0.35, 0, 1));
  const pulse = 1 + Math.sin(g.time * 5) * 0.035;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(appear * pulse, appear * pulse);
  ctx.translate(-cx, -cy);
  const m = btn3d(ctx, r, boss ? '#ff5a4f' : '#5fd16f', boss ? '#c23a32' : '#2f9a48', 18, g.isPressed(r));
  drawSwords(ctx, r.x + 36, m, 1.15, '#ffffff');
  label(ctx, boss ? 'BOSS WAVE!' : `START WAVE ${b.wave}`, cx + 16, m - 8, 25);
  label(ctx, 'tap when you are ready', cx + 16, m + 16, 12, { color: '#eafbe9', lw: 3 });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = appear > 0.5 ? 0.75 + 0.25 * Math.sin(g.time * 3) : 0;
  label(ctx, 'PREP TIME: open cases, merge and fuse!', W / 2, r.y + r.h + 26, 15, { color: COLOR.toast, lw: 4 });
  ctx.restore();
}

/** A ribbon with folded tails, centred on (0, 0). */
function ribbon(ctx: Ctx, w: number, h: number, body: string, dark: string) {
  for (const s of [-1, 1]) {
    const x0 = s * (w / 2 - 14);
    const x1 = s * (w / 2 + 34);
    poly(ctx, [x0, -h / 2 + 12, x1, -h / 2 + 12, x1 - s * 14, 6, x1, h / 2 + 12, x0, h / 2 + 12]);
    fillStroke(ctx, dark, 2.5);
  }
  rr(ctx, -w / 2, -h / 2, w, h, 8);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, body);
  g.addColorStop(1, dark);
  fillStroke(ctx, g, 3);
  ctx.strokeStyle = 'rgba(255, 216, 74, 0.8)';
  ctx.lineWidth = 2;
  rr(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 5);
  ctx.stroke();
}

/** Wave clear: a red ribbon swoops in, a check stamps on it, the letters bounce, the bonus pops, then it swoops out. */
export function drawWaveClear(ctx: Ctx, g: Game) {
  const b = g.battle;
  if (b.phase !== 'cleared') return;
  const t = b.phaseT;
  const inK = clamp(t / 0.35, 0, 1);
  const outK = clamp((t - (CLEAR_DUR - 0.35)) / 0.35, 0, 1);
  const x = W / 2 - (1 - easeOutBack(inK)) * W + outK * outK * W;
  const y = L.ribbonY;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.03 + Math.sin(t * 3) * 0.015);
  ribbon(ctx, 330, 62, '#ef5a5f', '#b23a42');
  // letters popping in one by one, then riding a little wave
  const word = `WAVE ${b.clearedWave} CLEAR!`;
  ctx.font = `34px ${FONT}`;
  const chars = [...word];
  const widths = chars.map((ch) => ctx.measureText(ch).width + 1);
  let lx = 22 - widths.reduce((a, c) => a + c, 0) / 2;
  chars.forEach((ch, i) => {
    const lt = t - 0.18 - i * 0.035;
    if (lt > 0 && ch !== ' ') {
      const k = clamp(lt / 0.2, 0, 1);
      const sc = (0.3 + 0.7 * easeOutBack(k)) * (1 + 0.3 * Math.max(0, 1 - lt / 0.1));
      ctx.save();
      ctx.translate(lx + widths[i] / 2, Math.sin(t * 9 - i * 0.6) * 3 * k);
      ctx.scale(sc, sc);
      label(ctx, ch, 0, 0, 34, { color: '#ffe27a', lw: 7 });
      ctx.restore();
    }
    lx += widths[i];
  });
  // the check stamp on the left end
  const st = clamp((t - 0.45) / 0.18, 0, 1);
  if (st > 0) {
    ctx.save();
    ctx.translate(-150, -4);
    const sc = 1 + 1.2 * (1 - st);
    ctx.scale(sc, sc);
    ctx.rotate(-0.2);
    circle(ctx, 0, 0, 24);
    fillStroke(ctx, COLOR.cash, 3);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-3, 9);
    ctx.lineTo(11, -9);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
  // the bonus
  const bk = clamp((t - 0.55) / 0.25, 0, 1);
  if (bk > 0) {
    ctx.save();
    ctx.translate(0, 52);
    ctx.scale(easeOutBack(bk), easeOutBack(bk));
    rr(ctx, -52, -16, 104, 32, 16);
    fillStroke(ctx, COLOR.hudPill, 2);
    drawCash(ctx, -22, 0, 0.55);
    label(ctx, `+${b.clearBonus}`, 2, 1, 22, { align: 'left', color: COLOR.cash });
    ctx.restore();
  }
  // twinkles around the ribbon
  for (let i = 0; i < 7; i++) {
    const ph = t * 2.2 + i / 7;
    const a = Math.sin((ph % 1) * Math.PI) * inK * (1 - outK);
    const px = -190 + 380 * hash(i * 3.1 + Math.floor(ph));
    const py = -50 + 100 * hash(i * 7.7 + Math.floor(ph));
    ctx.save();
    ctx.globalAlpha *= a;
    starPath(ctx, px, py, 4 + 5 * a, 1.6, 4, t * 2);
    ctx.fillStyle = '#fff6d8';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** The piece under the finger and its info card. Drawn after the evolution reveal so it is never dimmed or covered. */
export function drawDrag(ctx: Ctx, g: Game) {
  const d = g.drag;
  if (!d) return;
  const cell = L.grid.cell;
  const w = d.item.w * cell;
  const h = d.item.h * cell;
  const x = d.px - d.offX;
  const y = d.py - d.offY;
  rr(ctx, x + 5, y + 9, w - 6, h - 6, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  drawTile(ctx, d.item, x, y, w, h, false, g.time);
  infoCard(ctx, d.item, g, g.dropPreview());
}

// ---------------------------------------------------------------- evolution reveal

/**
 * The fusion moment: the panel dims, both pieces fly into the host on curved paths, a flash,
 * then the super springs in with "EVOLVED!" and its name.
 */
export function drawEvolution(ctx: Ctx, g: Game) {
  const e = g.evo;
  if (!e) return;
  if (e.host.col < 0 && !g.inv.tray.includes(e.host)) return; // host was moved away: nothing to point at
  const t = e.t;
  const lite = e.feed && !e.awake;
  const r = g.itemRect(e.host);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const fade = t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.4) : 1;
  const accent = e.awake ? EVO.awake : EVO.accent[e.result];
  if (!lite) {
    ctx.save();
    ctx.globalAlpha = fade * Math.min(1, t / 0.15);
    rr(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 16);
    ctx.fillStyle = EVO.dim;
    ctx.fill();
    ctx.restore();
  }
  // the host on top of the dim, springing in after the flash
  if (g.drag?.item !== e.host) {
    if (e.host.col >= 0) poppedTile(ctx, g, e.host, r.x, r.y, r.w, r.h);
    else trayCard(ctx, g, e.host, r);
  }
  // both ingredients fly in on mirrored curves, spinning and shrinking
  if (t < 0.4) {
    const k = t / 0.4;
    const ease = k * k;
    e.snaps.forEach((s, i) => {
      const sx = s.r.x + s.r.w / 2;
      const sy = s.r.y + s.r.h / 2;
      const qx = (sx + cx) / 2 + (i ? 60 : -60);
      const qy = Math.min(sy, cy) - 60;
      const px = (1 - ease) * (1 - ease) * sx + 2 * (1 - ease) * ease * qx + ease * ease * cx;
      const py = (1 - ease) * (1 - ease) * sy + 2 * (1 - ease) * ease * qy + ease * ease * cy;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((i ? 1 : -1) * 0.6 * ease);
      ctx.scale(1 - 0.4 * ease, 1 - 0.4 * ease);
      drawTile(ctx, s.it, -s.r.w / 2, -s.r.h / 2, s.r.w, s.r.h, false, g.time);
      ctx.restore();
    });
  }
  // title text, placed in the half of the panel away from the host
  if (t >= 0.35) {
    const slam = 1 + 0.5 * Math.max(0, 1 - (t - 0.35) / 0.15);
    const ty = cy < L.panel.y + L.panel.h / 2 ? L.panel.y + L.panel.h - 96 : L.evoTitleY;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (t - 0.35) / 0.15) * fade;
    ctx.translate(W / 2, ty);
    ctx.scale(slam, slam);
    const title = e.awake ? 'AWAKENED!' : e.feed ? `${cls(e.level).toUpperCase()}!` : 'EVOLVED!';
    label(ctx, title, 0, 0, 34, { color: e.awake ? EVO.awake : EVO.glow, lw: 8 });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = clamp((t - 0.45) / 0.15, 0, 1) * fade; // negative alpha would be ignored, not hidden
    const w = WEAPONS[e.result];
    label(ctx, `★ ${w.name}  ·  ${cls(e.level)}`, W / 2, ty + 32, 24, { color: accent, lw: 6 });
    label(ctx, e.awake ? `AWAKENED: ${w.evo?.awake ?? ''}` : (w.evo?.blurb ?? ''), W / 2, ty + 56, 14, { color: COLOR.white });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- overlays

function overlayPanel(ctx: Ctx, r: Rect, dim = 0.62) {
  ctx.fillStyle = `rgba(12, 8, 20, ${dim})`;
  ctx.fillRect(0, 0, W, H);
  rr(ctx, r.x, r.y, r.w, r.h, 20);
  fillStroke(ctx, COLOR.panelFrame, 3);
  rr(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, 14);
  fillStroke(ctx, COLOR.panelInner, 3, COLOR.panelInnerEdge);
}

export function drawStats(ctx: Ctx, g: Game) {
  const p = L.overlay;
  overlayPanel(ctx, p);
  label(ctx, 'SQUAD', W / 2, p.y + 46, 36);
  const roster = g.inv.roster();
  if (!roster.length) label(ctx, 'Put a rabbit on the grid!', W / 2, p.y + 140, 20, { color: COLOR.textDim });
  roster.slice(0, 14).forEach((s, i) => {
    const y = p.y + 82 + i * 46;
    rr(ctx, p.x + 22, y, p.w - 44, 40, 10);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)';
    ctx.fill();
    const st = rabbitStats(s.weapon, s.wLevel, s.rLevel);
    if (s.weapon === 'fist') {
      circle(ctx, p.x + 58, y + 20, 8);
      fillStroke(ctx, '#ffffff', 2);
    } else drawWeaponIcon(ctx, s.weapon, s.wLevel, p.x + 58, y + 20, 52, 30, g.time * 3);
    const sup = isSuper(s.weapon);
    label(ctx, `${sup ? '★ ' : ''}${WEAPONS[s.weapon].name}  ${s.weapon === 'fist' ? '' : classOf(s.wLevel)}`, p.x + 94, y + 14, 17, {
      align: 'left',
      color: sup ? EVO.accent[s.weapon as keyof typeof EVO.accent] : COLOR.white,
    });
    const extras = [`rabbit ${cls(s.rLevel)}`, `x${BAL.squad + s.extra} soldiers`];
    if (s.rate > 1) extras.push(`+${Math.round((s.rate - 1) * 100)}% speed`);
    if (s.dmgMul > 1) extras.push(`+${Math.round((s.dmgMul - 1) * 100)}% dmg`);
    if (s.hpMul > 1) extras.push(`+${Math.round((s.hpMul - 1) * 100)}% hp`);
    label(ctx, extras.join(' · '), p.x + 94, y + 30, 12, { align: 'left', color: COLOR.textDim });
    label(ctx, `DMG ${Math.round(st.dmg * s.dmgMul)}   HP ${Math.round(st.hp * s.hpMul)}`, p.x + p.w - 36, y + 14, 15, { align: 'right' });
  });
  if (roster.length > 14) label(ctx, `+${roster.length - 14} more`, W / 2, p.y + 82 + 14 * 46 + 6, 14, { color: COLOR.textDim });
  label(ctx, `Super weapons found: ${g.discovered.size}/${RECIPES.length}`, W / 2, p.y + p.h - 58, 15, { color: EVO.glow });
  label(ctx, 'tap anywhere to close', W / 2, p.y + p.h - 28, 16, { color: COLOR.textDim });
}

/** Letters dropping in one by one with a bounce (the STAGE CLEAR stamp). */
function dropWord(ctx: Ctx, word: string, cx: number, y: number, size: number, t: number, color: string) {
  ctx.font = `${Math.round(size)}px ${FONT}`;
  const chars = [...word];
  const widths = chars.map((ch) => ctx.measureText(ch).width + 2);
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  chars.forEach((ch, i) => {
    const lt = t - i * 0.07;
    const wdt = widths[i];
    if (lt > 0) {
      const k = clamp(lt / 0.32, 0, 1);
      const dy = (1 - easeOutBack(k)) * -80;
      const sc = 1 + 0.5 * Math.max(0, 1 - lt / 0.14);
      ctx.save();
      ctx.translate(x + wdt / 2, y + dy);
      ctx.scale(sc, sc);
      ctx.rotate(Math.sin(i * 1.7) * 0.12 * (1 - k));
      label(ctx, ch, 0, 0, size, { color, lw: size * 0.18 });
      ctx.restore();
    }
    x += wdt;
  });
}

/** Stage clear: a big stamp over the fireworks, then the reward panel with stars, gems and the next street. */
export function drawStageClear(ctx: Ctx, g: Game) {
  const b = g.battle;
  const t = g.winT;
  if (t < 2.2) {
    const fade = t > 1.75 ? clamp((2.2 - t) / 0.45, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    dropWord(ctx, 'STAGE', W / 2, 212, 56, t - 0.05, '#ffffff');
    dropWord(ctx, 'CLEAR!', W / 2, 282, 74, t - 0.4, '#ffd84a');
    ctx.restore();
  }
  if (t < 1.5) return;
  const P = L.endPanel;
  const k = clamp((t - 1.5) / 0.35, 0, 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(12, 8, 20, 0.45)';
  ctx.fillRect(0, 0, W, H);
  const sc = 0.6 + 0.4 * easeOutBack(k);
  ctx.translate(W / 2, P.y + P.h / 2);
  ctx.scale(sc, sc);
  ctx.translate(-W / 2, -(P.y + P.h / 2));
  overlayPanel(ctx, P, 0);
  label(ctx, `STAGE ${b.stage} CLEAR!`, W / 2, P.y + 56, 38, { color: '#ffd84a', lw: 8 });
  label(ctx, `${STREETS[streetOf(b.stage)]} is safe!`, W / 2, P.y + 94, 17, { color: COLOR.textDim });

  // stars for the carrots kept, filling one by one
  for (let i = 0; i < 3; i++) {
    const sx = W / 2 + (i - 1) * 92;
    const sy = P.y + 160 - (i === 1 ? 12 : 0);
    const R = i === 1 ? 40 : 32;
    starPath(ctx, sx, sy, R, R * 0.45, 5);
    fillStroke(ctx, 'rgba(0,0,0,0.35)', 3, 'rgba(255,255,255,0.25)');
    const at = 1.95 + i * 0.28;
    if (i < b.stars && t >= at) {
      const pop = easeOutBack(clamp((t - at) / 0.25, 0, 1));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(pop, pop);
      const gr = ctx.createLinearGradient(0, -R, 0, R);
      gr.addColorStop(0, '#fff3a0');
      gr.addColorStop(1, '#f5a417');
      starPath(ctx, 0, 0, R, R * 0.45, 5);
      fillStroke(ctx, gr, 3);
      starPath(ctx, -R * 0.15, -R * 0.2, R * 0.3, R * 0.12, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.restore();
    }
  }

  // gems rolling up
  const n = Math.round(b.lastReward * clamp((t - 2.85) / 0.45, 0, 1));
  label(ctx, `+${n}`, W / 2 - 6, P.y + 250, 40, { align: 'right', color: '#f2c9ff' });
  drawGem(ctx, W / 2 + 24, P.y + 250, 1.2);
  const kept = Math.round((b.baseHp / b.baseMax) * 100);
  label(ctx, `${b.stageKos} KOs  ·  best combo x${b.stageBest}  ·  ${kept}% carrots kept`, W / 2, P.y + 298, 14, { color: COLOR.textDim, lw: 3 });
  const next = b.stage + 1;
  const slot = Object.values(CELL_LOCKS).some((l) => l.kind === 'stage' && l.stage === next);
  label(ctx, slot ? `Stage ${next} opens a new grid slot!` : `Next street: ${STREETS[streetOf(next)]}`, W / 2, P.y + 324, 15, { color: slot ? COLOR.cash : COLOR.toast, lw: 3 });

  if (t >= g.winReady) {
    const pulse = 1 + Math.sin(g.time * 6) * 0.04;
    const r = L.overlayBtn;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    const om = btn3d(ctx, r, '#5fd16f', '#2f9a48', 16, g.isPressed(r));
    label(ctx, 'NEXT STREET', W / 2 - 14, om, 26);
    poly(ctx, [r.x + r.w - 40, om - 10, r.x + r.w - 24, om, r.x + r.w - 40, om + 10]);
    fillStroke(ctx, '#ffffff', 2.5);
    ctx.restore();
  } else label(ctx, 'tap to continue', W / 2, L.overlayBtn.y + 30, 15, { color: COLOR.textDim });
  ctx.restore();
}

export function drawDefeat(ctx: Ctx, g: Game) {
  const b = g.battle;
  const p = { x: 60, y: 370, w: 420, h: 360 };
  overlayPanel(ctx, p);
  label(ctx, 'CARROTS STOLEN!', W / 2, p.y + 66, 38, { color: '#ff6b5f', lw: 8 });
  label(ctx, 'The foxes ran off with your carrots...', W / 2, p.y + 120, 18, { color: COLOR.textDim });
  label(ctx, `Stage ${b.stage}, wave ${b.wave}`, W / 2, p.y + 150, 20, { color: COLOR.textDim });
  // every break points at the next goal
  const feat = g.featured();
  const next = feat ? `Next evolution: ${cls(BAL.evoMinLevel)} ${ITEMS[feat.recipe.main].name} + ${ITEMS[feat.recipe.partner].name}` : `Super weapons ${g.runFound.size}/${RECIPES.length}`;
  label(ctx, next, W / 2, p.y + 196, 14, { color: EVO.glow, lw: 3 });
  label(ctx, 'Open cases and merge up to S and SSS class!', W / 2, p.y + 222, 14, { color: COLOR.toast, lw: 3 });
  const om = btn3d(ctx, L.overlayBtn, '#5fd16f', '#2f9a48', 16, g.isPressed(L.overlayBtn));
  label(ctx, 'RETRY', W / 2, om, 28);
}
