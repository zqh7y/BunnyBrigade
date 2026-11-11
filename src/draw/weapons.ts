import type { WeaponId } from '../data';
import { COLOR, EVO, TIER } from '../theme';
import { circle, clamp, poly, rr, starPath, type Ctx } from '../util';
import { drawCarrot } from './icons';

const DARK = '#3b3644';

/**
 * Draws a weapon pointing right with its grip at (0, 0).
 * Two passes: one clean outline around the whole weapon, then the fills on top (no inner lines).
 * anim drives moving parts (the gatling's turning barrels). heat 0..1: the gatling's barrel tips glowing hot,
 * or the railgun's coils lighting up one by one as it charges (icons leave it at 0).
 */
export function drawWeapon(ctx: Ctx, id: WeaponId, level: number, lw = 2, anim = 0, heat = 0) {
  weaponPass(ctx, id, level, lw, true, anim, heat);
  weaponPass(ctx, id, level, lw, false, anim, heat);
}

function weaponPass(ctx: Ctx, id: WeaponId, level: number, lw: number, outline: boolean, anim: number, heat: number) {
  const lv = clamp(level, 1, TIER.metal.length) - 1;
  const m = TIER.metal[lv];
  const ml = TIER.metalLight[lv];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const F = (fill: string | (() => string | CanvasGradient)) => {
    if (outline) {
      ctx.lineWidth = lw * 2;
      ctx.strokeStyle = COLOR.ink;
      ctx.stroke();
    } else {
      ctx.fillStyle = typeof fill === 'function' ? fill() : fill;
      ctx.fill();
    }
  };
  const shine = (x: number, y: number, w: number, h: number) => {
    if (outline) return;
    ctx.fillStyle = ml;
    ctx.fillRect(x, y, w, h);
  };

  switch (id) {
    case 'fist':
      circle(ctx, 0, 0, 4.5);
      F('#ffffff');
      break;

    case 'knife':
      rr(ctx, -11, -3, 12, 6, 2.5);
      F(DARK);
      ctx.beginPath();
      ctx.moveTo(4, -4.5);
      ctx.lineTo(23, -4.5);
      ctx.lineTo(32, -0.5);
      ctx.quadraticCurveTo(22, 4, 4, 3.5);
      ctx.closePath();
      F(() => {
        const g = ctx.createLinearGradient(0, -4.5, 0, 3.5);
        g.addColorStop(0, ml);
        g.addColorStop(1, m);
        return g;
      });
      rr(ctx, 0, -6.5, 4.5, 13, 1.5);
      F(m);
      if (!outline) {
        ctx.beginPath();
        ctx.moveTo(7, -2.4);
        ctx.lineTo(21, -2.4);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = lw * 0.6;
        ctx.stroke();
      }
      break;

    case 'bat':
      ctx.beginPath();
      ctx.moveTo(-10, -2.2);
      ctx.lineTo(4, -2.8);
      ctx.lineTo(29, -5.5);
      ctx.arc(29, 0, 5.5, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(4, 2.8);
      ctx.lineTo(-10, 2.2);
      ctx.closePath();
      F('#c98a4b');
      rr(ctx, -11, -3, 10, 6, 2);
      F(m);
      if (!outline) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(6, -3.6, 20, 1.6);
      }
      break;

    case 'pistol':
      poly(ctx, [-1, 0, 6, 0, 4.5, 10, -3.5, 10]);
      F(DARK);
      if (outline) {
        ctx.beginPath();
        ctx.arc(7.5, 1.2, 3, 0, Math.PI);
        ctx.lineWidth = lw * 0.9;
        ctx.strokeStyle = COLOR.ink;
        ctx.stroke();
      }
      rr(ctx, -4, -7.5, 23, 8, 2);
      F(m);
      shine(-2, -6, 18, 2);
      rr(ctx, 15, -9.5, 3, 2.5, 1);
      F(DARK);
      break;

    case 'smg':
      poly(ctx, [-15, -5, -6, -6, -6, 0, -15, 3]);
      F(DARK);
      rr(ctx, 6, 0, 6, 12, 1.5);
      F(DARK);
      poly(ctx, [-3, 0, 3, 0, 1.5, 9, -4, 9]);
      F(DARK);
      rr(ctx, -6, -8, 25, 9, 2);
      F(m);
      rr(ctx, 19, -6, 8, 4, 1);
      F(DARK);
      shine(-4, -6.5, 21, 2);
      break;

    case 'rifle':
      poly(ctx, [-22, -4, -9, -6, -9, 1, -22, 5]);
      F(DARK);
      rr(ctx, 7, 0, 5, 8, 1.5);
      F(DARK);
      poly(ctx, [-5, 0, 0, 0, -1.5, 8, -6, 8]);
      F(DARK);
      rr(ctx, -9, -7.5, 32, 8, 2);
      F(m);
      rr(ctx, 23, -5.5, 17, 3.5, 1);
      F(DARK);
      rr(ctx, -3, -13.5, 17, 5, 2.5);
      F(DARK);
      if (!outline) {
        circle(ctx, 14, -11, 2);
        ctx.fillStyle = ml;
        ctx.fill();
      }
      shine(-7, -6, 28, 2);
      break;

    case 'rocket':
      rr(ctx, -2, 2, 5, 9, 1.5);
      F(DARK);
      rr(ctx, -19, -8, 39, 11, 4);
      F(m);
      shine(-15, -6.5, 31, 2.5);
      rr(ctx, -20, -9.5, 6, 14, 2);
      F(DARK);
      rr(ctx, 14, -9.5, 6, 14, 2);
      F(DARK);
      poly(ctx, [20, -7, 33, -2.5, 20, 2]);
      F('#e5e8ee');
      rr(ctx, 0, -13, 6, 5, 1);
      F(DARK);
      break;

    case 'grenade':
      if (outline) {
        circle(ctx, 12.5, -9, 3);
        ctx.lineWidth = lw * 0.9;
        ctx.strokeStyle = COLOR.ink;
        ctx.stroke();
      }
      circle(ctx, 6, 1, 7.5);
      F(m);
      rr(ctx, 2.5, -9.5, 7, 4, 1);
      F(DARK);
      if (!outline) {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(-1.5, 1);
        ctx.lineTo(13.5, 1);
        ctx.moveTo(6, -6);
        ctx.lineTo(6, 8.5);
        ctx.stroke();
        circle(ctx, 3.5, -1.5, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      }
      break;

    case 'shield':
      rr(ctx, -1, -22, 13, 36, 4);
      F(m);
      if (!outline) {
        ctx.strokeStyle = ml;
        ctx.lineWidth = lw * 0.6;
        for (let y = -11; y <= 9; y += 7) {
          ctx.beginPath();
          ctx.moveTo(2, y);
          ctx.lineTo(5.5, y - 2.5);
          ctx.lineTo(9, y);
          ctx.stroke();
        }
        rr(ctx, 1.5, -19, 8, 5, 2);
        ctx.fillStyle = '#d8f2ff';
        ctx.fill();
      }
      shine(1, -12, 2, 22);
      break;

    // ---------------- super weapons ----------------

    case 'gunblade':
      rr(ctx, -11, -3, 12, 6, 2.5);
      F(DARK);
      if (outline) {
        ctx.beginPath();
        ctx.arc(-3, 4, 3.2, 0, Math.PI);
        ctx.lineWidth = lw * 0.9;
        ctx.strokeStyle = COLOR.ink;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(4, -5);
      ctx.lineTo(32, -5);
      ctx.lineTo(43, -0.5);
      ctx.quadraticCurveTo(30, 4.5, 4, 4);
      ctx.closePath();
      F(() => {
        const g = ctx.createLinearGradient(0, -5, 0, 4);
        g.addColorStop(0, ml);
        g.addColorStop(1, m);
        return g;
      });
      rr(ctx, 6, -9.5, 20, 5, 1.5); // pistol slide riding on the spine
      F(DARK);
      rr(ctx, 24, -9, 4, 3.5, 1);
      F(m);
      rr(ctx, 0, -7, 4.5, 14, 1.5);
      F(m);
      if (!outline) {
        ctx.beginPath();
        ctx.moveTo(6, 2.4);
        ctx.quadraticCurveTo(26, 2.6, 38, 0.6);
        ctx.strokeStyle = EVO.accent.gunblade;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      break;

    case 'gatling': {
      rr(ctx, -4, 2, 5, 9, 1.5);
      F(DARK);
      circle(ctx, 3, 10, 6.5);
      F(EVO.art.drum);
      rr(ctx, -15, -8, 9, 14, 3);
      F(DARK);
      rr(ctx, -7, -10, 18, 17, 4);
      F(m);
      shine(-5, -8, 14, 2.5);
      for (const y of [-7, -3, 1]) {
        rr(ctx, 10, y, 26, 3, 1.2);
        F(DARK);
      }
      if (!outline) {
        // light bands slide along the barrels so they visibly turn
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        [-7, -3, 1].forEach((y, b) => {
          for (let k = 0; k < 2; k++) ctx.fillRect(12 + ((anim * 8 + k * 12 + b * 4) % 22), y + 0.4, 2, 2.2);
        });
        ctx.fillStyle = EVO.art.star;
        ctx.fillRect(-1.5, 9, 9, 2);
        if (heat > 0.4) {
          // barrel tips glowing from the spin
          ctx.fillStyle = `rgba(255, 120, 40, ${Math.min(0.9, (heat - 0.4) * 1.5)})`;
          for (const y of [-7, -3, 1]) ctx.fillRect(26, y, 10, 3);
        }
      }
      rr(ctx, 28, -9, 4, 14, 1.5);
      F(m);
      break;
    }

    case 'railgun':
      poly(ctx, [-22, -4, -9, -6, -9, 1, -22, 5]);
      F(DARK);
      poly(ctx, [-5, 0, 0, 0, -1.5, 8, -6, 8]);
      F(DARK);
      rr(ctx, -9, -8.5, 22, 10, 2.5);
      F(m);
      rr(ctx, 11, -8, 37, 3, 1.2);
      F(DARK);
      rr(ctx, 11, -1.5, 37, 3, 1.2);
      F(DARK);
      if (!outline) {
        ctx.fillStyle = EVO.accent.railgun;
        ctx.fillRect(12, -4.8, 35, 2.8);
      }
      [18, 28, 38].forEach((cx, k) => {
        rr(ctx, cx, -9.5, 4, 10.5, 1.2);
        F(heat >= (k + 1) / 3 - 0.01 ? EVO.accent.railgun : EVO.art.copper);
      });
      rr(ctx, -3, -14, 14, 5, 2.5);
      F(DARK);
      shine(-7, -7, 18, 2);
      break;

    case 'ram':
      rr(ctx, -2, -27, 15, 44, 5);
      F(m);
      poly(ctx, [13, -14, 22, -5, 22, 3, 13, 12]);
      F(DARK);
      for (const y of [-6, -1, 4]) {
        poly(ctx, [22, y - 2, 31, y, 22, y + 2]);
        F(ml);
      }
      if (!outline) {
        ctx.strokeStyle = ml;
        ctx.lineWidth = lw * 0.6;
        for (let y = -14; y <= 6; y += 7) {
          ctx.beginPath();
          ctx.moveTo(1, y);
          ctx.lineTo(5.5, y - 3);
          ctx.lineTo(10, y);
          ctx.stroke();
        }
        rr(ctx, 1.5, -23, 9, 5, 2);
        ctx.fillStyle = '#d8f2ff';
        ctx.fill();
        ctx.fillStyle = EVO.accent.ram;
        ctx.fillRect(0.5, 10, 11, 3);
      }
      shine(1, -17, 2, 24);
      break;

    case 'barrage':
      rr(ctx, -2, 4, 5, 9, 1.5);
      F(DARK);
      rr(ctx, -19, -13, 38, 9, 3.5);
      F(m);
      rr(ctx, -19, -4, 38, 9, 3.5);
      F(m);
      rr(ctx, -20, -14.5, 6, 21, 2);
      F(DARK);
      rr(ctx, 4, -14, 6, 20, 1.5);
      F(EVO.art.band);
      poly(ctx, [19, -12, 29, -8.5, 19, -5]);
      F('#e5e8ee');
      poly(ctx, [19, -3, 29, 0.5, 19, 4]);
      F('#e5e8ee');
      if (!outline) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(6, -14, 2, 20);
      }
      shine(-14, -11.5, 17, 2);
      shine(-14, -2.5, 17, 2);
      break;

    case 'cannon':
      poly(ctx, [-26, -3, -18, -7, -18, 5, -26, 8]);
      F(EVO.art.wood);
      rr(ctx, -2, 5, 5, 9, 1.5);
      F(DARK);
      rr(ctx, -20, -11, 44, 18, 6);
      F(m);
      for (const bx of [-12, 8]) {
        rr(ctx, bx, -12, 5, 20, 1.5);
        F(EVO.accent.cannon);
      }
      if (!outline) {
        shine(-16, -8, 34, 2.5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (const rx of [-4, 1, 20]) {
          circle(ctx, rx, 4, 1.1);
          ctx.fill();
        }
        starPath(ctx, -3, -2, 4.2, 1.9, 5);
        ctx.fillStyle = EVO.art.star;
        ctx.fill();
        drawCarrot(ctx, 30, -2, 0.55, -Math.PI / 2);
      }
      break;
  }
}

/** Bounding box [x0, y0, x1, y1] of each weapon as drawn by drawWeapon. */
export const WEAPON_BOX: Record<WeaponId, [number, number, number, number]> = {
  fist: [-5, -5, 5, 5],
  knife: [-12, -7, 33, 7],
  bat: [-12, -6, 36, 6],
  pistol: [-5, -10, 20, 11],
  smg: [-16, -9, 28, 13],
  rifle: [-23, -14, 41, 9],
  rocket: [-21, -14, 34, 12],
  grenade: [-2, -13, 16, 9],
  shield: [-2, -23, 13, 15],
  gunblade: [-12, -10, 44, 8],
  gatling: [-16, -11, 37, 17],
  railgun: [-23, -15, 49, 9],
  ram: [-3, -28, 32, 18],
  barrage: [-21, -15, 30, 13],
  cannon: [-27, -13, 39, 15],
};

/** Draws a weapon centred in a box, turned upright when that fits the box better. */
export function drawWeaponIcon(ctx: Ctx, id: WeaponId, level: number, cx: number, cy: number, maxW: number, maxH: number, anim = 0) {
  const [x0, y0, x1, y1] = WEAPON_BOX[id];
  const bw = x1 - x0;
  const bh = y1 - y0;
  const sFlat = Math.min(maxW / bw, maxH / bh);
  const sUp = Math.min(maxW / bh, maxH / bw);
  const up = sUp > sFlat * 1.15;
  const s = up ? sUp : sFlat;
  ctx.save();
  ctx.translate(cx, cy);
  if (up) ctx.rotate(-Math.PI / 2);
  ctx.scale(s, s);
  ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  drawWeapon(ctx, id, level, clamp(s * 1.25, 1.2, 2.6) / s, anim);
  ctx.restore();
}
