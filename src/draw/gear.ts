import type { GearType } from '../data';
import { COLOR, TIER } from '../theme';
import { circle, clamp, fillStroke, line, poly, rr, type Ctx } from '../util';
import { drawCarrot } from './icons';

/** Bounding box [x0, y0, x1, y1] of each gear icon as drawn by drawGear. */
const GEAR_BOX: Record<GearType, [number, number, number, number]> = {
  ammo: [-17, -21, 17, 14],
  scope: [-16, -16, 16, 16],
  banner: [-14, -40, 19, 36],
  medkit: [-16, -18, 16, 14],
};

/** Draws a gear piece centred on (0, 0). Metal bits take the level colour. */
export function drawGear(ctx: Ctx, type: GearType, level: number, lw = 2) {
  const lv = clamp(level, 1, TIER.metal.length) - 1;
  const m = TIER.metal[lv];
  const F = (fill: string) => fillStroke(ctx, fill, lw);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (type) {
    case 'ammo':
      for (let i = 0; i < 3; i++) {
        const bx = -9.5 + i * 7;
        rr(ctx, bx, -19, 5, 14, 2.5);
        F('#e8b84a');
        rr(ctx, bx, -19, 5, 5, 2.5);
        F(m);
      }
      rr(ctx, -15, -7, 30, 19, 3);
      F('#6f8f4a');
      rr(ctx, -16, -9, 32, 6, 2);
      F('#58763a');
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-11, 1, 22, 3);
      break;
    case 'scope':
      circle(ctx, 0, 0, 14);
      F('#2f3346');
      circle(ctx, 0, 0, 10);
      ctx.strokeStyle = m;
      ctx.lineWidth = lw * 1.3;
      ctx.stroke();
      ctx.strokeStyle = '#ff5a4f';
      ctx.lineWidth = lw;
      line(ctx, -12, 0, -4, 0);
      line(ctx, 4, 0, 12, 0);
      line(ctx, 0, -12, 0, -4);
      line(ctx, 0, 4, 0, 12);
      circle(ctx, 0, 0, 2.2);
      ctx.fillStyle = '#ff5a4f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7, Math.PI * 1.1, Math.PI * 1.45);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    case 'banner':
      rr(ctx, -12, -36, 4, 70, 2);
      F('#8a6448');
      circle(ctx, -10, -37, 3.2);
      F(m);
      poly(ctx, [-8, -32, 17, -30, 11, -19, 17, -8, -8, -8]);
      F('#ff9f43');
      drawCarrot(ctx, 3, -20, 0.42, 0.35);
      break;
    case 'medkit':
      rr(ctx, -6, -16, 12, 7, 2.5);
      ctx.lineWidth = lw * 1.3;
      ctx.strokeStyle = COLOR.ink;
      ctx.stroke();
      rr(ctx, -15, -11, 30, 23, 4);
      F('#f4f1ea');
      ctx.fillStyle = '#3fbf5a';
      ctx.fillRect(-2.6, -7, 5.2, 15);
      ctx.fillRect(-7.5, -2.1, 15, 5.2);
      ctx.fillStyle = m;
      ctx.fillRect(-13, 7, 26, 3);
      break;
  }
}

/** Gear icon centred in a box, turned sideways when that fits better (a banner in a wide tile). */
export function drawGearIcon(ctx: Ctx, type: GearType, level: number, cx: number, cy: number, maxW: number, maxH: number) {
  const [x0, y0, x1, y1] = GEAR_BOX[type];
  const bw = x1 - x0;
  const bh = y1 - y0;
  const sFlat = Math.min(maxW / bw, maxH / bh);
  const sTurn = Math.min(maxW / bh, maxH / bw);
  const turn = sTurn > sFlat * 1.15;
  const s = turn ? sTurn : sFlat;
  ctx.save();
  ctx.translate(cx, cy);
  if (turn) ctx.rotate(-Math.PI / 2);
  ctx.scale(s, s);
  ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  drawGear(ctx, type, level, clamp(s * 1.2, 1.2, 2.4) / s);
  ctx.restore();
}

export function drawLock(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(0, -4, 5.5, Math.PI, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c9c4d4';
  ctx.stroke();
  rr(ctx, -8, -4, 16, 12, 3);
  fillStroke(ctx, '#c9c4d4', 2);
  circle(ctx, 0, 1.5, 1.8);
  ctx.fillStyle = COLOR.ink;
  ctx.fill();
  ctx.restore();
}
