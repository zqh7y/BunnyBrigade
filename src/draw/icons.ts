import { COLOR } from '../theme';
import { circle, ellipse, fillStroke, poly, rr, type Ctx } from '../util';

const INK = COLOR.ink;

export function drawCarrot(ctx: Ctx, x: number, y: number, s = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ellipse(ctx, -3.5, -12, 2.8, 6.5, -0.45);
  fillStroke(ctx, '#4fb453', 1.8);
  ellipse(ctx, 3.5, -12, 2.8, 6.5, 0.45);
  fillStroke(ctx, '#4fb453', 1.8);
  ellipse(ctx, 0, -14, 2.8, 7.5);
  fillStroke(ctx, '#5fc763', 1.8);
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.quadraticCurveTo(0, -10, 7, -6);
  ctx.lineTo(1.2, 14);
  ctx.quadraticCurveTo(0, 15.5, -1.2, 14);
  ctx.closePath();
  fillStroke(ctx, '#ff8a2b', 2);
  ctx.strokeStyle = 'rgba(120, 50, 0, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-4.5, -1);
  ctx.lineTo(-1, -1);
  ctx.moveTo(1, 4);
  ctx.lineTo(3.8, 4);
  ctx.moveTo(-2.5, 8);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.restore();
}

export function drawCash(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bills: [number, number, number][] = [
    [-3, 4, -0.5],
    [2, -1, -0.25],
  ];
  for (const [dx, dy, rot] of bills) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(rot);
    rr(ctx, -17, -11, 34, 22, 3);
    fillStroke(ctx, COLOR.cash, 2.2);
    rr(ctx, -13, -7, 26, 14, 2);
    ctx.strokeStyle = COLOR.cashDark;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    circle(ctx, 0, 0, 4.5);
    ctx.fillStyle = COLOR.cashDark;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawGem(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  poly(ctx, [0, -16, 14, -7, 14, 8, 0, 17, -14, 8, -14, -7]);
  fillStroke(ctx, COLOR.gem, 2.2);
  poly(ctx, [0, -16, 14, -7, 0, -1, -14, -7]);
  ctx.fillStyle = COLOR.gemLight;
  ctx.fill();
  poly(ctx, [-14, 8, 0, 17, 0, 4]);
  ctx.fillStyle = COLOR.gemDark;
  ctx.fill();
  poly(ctx, [0, -16, 14, -7, 14, 8, 0, 17, -14, 8, -14, -7]);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

export function drawSwords(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  for (const a of [-0.78, 0.78]) {
    ctx.save();
    ctx.rotate(a);
    rr(ctx, -2, -11, 4, 15, 1.5);
    ctx.fill();
    rr(ctx, -5.5, 4, 11, 3, 1.5);
    ctx.fill();
    rr(ctx, -1.5, 6.5, 3, 5, 1);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** White fox face, for the boss node of the wave tracker. */
export function drawFoxBadge(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  poly(ctx, [-9, -3, -8, -13, -2, -7]);
  fillStroke(ctx, '#fff', 1.6);
  poly(ctx, [9, -3, 8, -13, 2, -7]);
  fillStroke(ctx, '#fff', 1.6);
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.quadraticCurveTo(0, -11, 10, -4);
  ctx.quadraticCurveTo(6, 6, 0, 10);
  ctx.quadraticCurveTo(-6, 6, -10, -4);
  ctx.closePath();
  fillStroke(ctx, '#fff', 1.6);
  ctx.fillStyle = INK;
  ellipse(ctx, -4, -1.5, 2.3, 1.3, 0.35);
  ctx.fill();
  ellipse(ctx, 4, -1.5, 2.3, 1.3, -0.35);
  ctx.fill();
  circle(ctx, 0, 6.5, 1.8);
  ctx.fill();
  ctx.restore();
}

export function drawTrash(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  rr(ctx, -4, -17, 8, 4, 1.5);
  fillStroke(ctx, '#ffffff', 2);
  poly(ctx, [-10, -8, 10, -8, 8, 13, -8, 13]);
  fillStroke(ctx, '#ffffff', 2.2);
  rr(ctx, -13, -13, 26, 5, 2);
  fillStroke(ctx, '#ffffff', 2.2);
  ctx.strokeStyle = 'rgba(178, 74, 64, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const lx of [-4, 0, 4]) {
    ctx.moveTo(lx, -4);
    ctx.lineTo(lx, 9);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawChart(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bars: [number, number][] = [
    [-12, 11],
    [-3, 20],
    [6, 15],
  ];
  for (const [bx, bh] of bars) {
    rr(ctx, bx, 10 - bh, 7, bh, 2);
    fillStroke(ctx, '#ffffff', 2);
  }
  ctx.restore();
}

export function drawGift(ctx: Ctx, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ellipse(ctx, -5, -13, 5, 3.5, -0.5);
  fillStroke(ctx, '#ffd84a', 1.8);
  ellipse(ctx, 5, -13, 5, 3.5, 0.5);
  fillStroke(ctx, '#ffd84a', 1.8);
  rr(ctx, -11, -6, 22, 17, 2.5);
  fillStroke(ctx, '#ff6b6b', 2);
  rr(ctx, -13, -10, 26, 6, 2);
  fillStroke(ctx, '#ff8a80', 2);
  ctx.fillStyle = '#ffd84a';
  ctx.fillRect(-2.5, -10, 5, 21);
  ctx.restore();
}

export function drawSpeaker(ctx: Ctx, x: number, y: number, muted: boolean) {
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [-12, -5, -6, -5, 2, -12, 2, 12, -6, 5, -12, 5]);
  fillStroke(ctx, '#ffffff', 2);
  ctx.lineCap = 'round';
  if (muted) {
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.lineTo(14, 6);
    ctx.moveTo(14, -6);
    ctx.lineTo(6, 6);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(3, 0, 6, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, 0, 11, -0.9, 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPauseIcon(ctx: Ctx, x: number, y: number) {
  rr(ctx, x - 10, y - 12, 7, 24, 2);
  fillStroke(ctx, '#fff', 2);
  rr(ctx, x + 3, y - 12, 7, 24, 2);
  fillStroke(ctx, '#fff', 2);
}

export function drawPlayIcon(ctx: Ctx, x: number, y: number) {
  poly(ctx, [x - 8, y - 12, x + 11, y, x - 8, y + 12]);
  fillStroke(ctx, '#fff', 2);
}

export function drawFastIcon(ctx: Ctx, x: number, y: number) {
  poly(ctx, [x - 14, y - 10, x - 1, y, x - 14, y + 10]);
  fillStroke(ctx, '#fff', 2);
  poly(ctx, [x - 1, y - 10, x + 12, y, x - 1, y + 10]);
  fillStroke(ctx, '#fff', 2);
}
