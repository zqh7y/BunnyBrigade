import { CROUCH, RAM_ROW, RUSH_WINDUP, TRAVEL, type Battle, type Projectile, type Unit } from '../battle';
import type { FoxStyle, RabbitStyle } from '../looks';
import { BAL } from '../data';
import { TRACER, atkFx, smearOf } from '../attackfx';
import { COLOR, EVO, FX, L, TIER, W } from '../theme';
import { circle, clamp, easeOutBack, ellipse, fillStroke, frand, hash, label, lerp, line, poly, rr, starPath, type Ctx } from '../util';
import { BARREL, GUN_HAND, ROCKET_HAND, SHOULDER, drawFox, drawRabbit, type Look } from './characters';
import { drawCarrot } from './icons';
import { drawWeapon } from './weapons';

/*
 * The attack animation (wind-up pose, lunge / squash / tilt springs, hit-stop, flinch, tumble) comes from the
 * draw-only fields every Unit carries (attackfx FxBody); the battle sets them, this file only reads them.
 */

/** 0..1 through a unit's attack wind-up (0 when it is not winding up). */
function windOf(u: Unit) {
  return u.windupT > 0 && u.windupMax > 0 ? clamp(1 - u.windupT / u.windupMax, 0, 1) : 0;
}

/** A brute planting its feet before a bull rush (the battle's windT): 0..1, 0 when not. */
function rushOf(u: Unit) {
  return u.kind === 'brute' && u.windT > 0 ? clamp(1 - u.windT / RUSH_WINDUP, 0, 1) : 0;
}

export function drawUnit(ctx: Ctx, u: Unit, dx = 0) {
  const f = atkFx(u);
  const rush = rushOf(u);
  const wind = rush || windOf(u);
  const we = u.atk > 0 ? 0 : 1 - (1 - wind) ** 2;
  // held in a hit-stop: drawn where the hit found it (shuddering if it took the hit); it catches up afterwards
  let x = u.freeze > 0 ? u.freezeX + (u.hurtT > 0 ? ((Math.floor(u.freeze * 120) & 1) * 2 - 1) * 1.5 : 0) : u.x;
  if (u.kind === 'boss' && u.atk > 0) x += Math.sin(u.atk * 40) * 0.8; // Big Red shakes with his red-hot SMG
  if (u.weapon === 'gatling' && u.atk > 0) x += Math.sin(u.spinPhase * 7) * 0.7 * u.spin;
  x += u.face * u.lunge * u.scale + dx;
  // squash and stretch keep the area (so the cached body picture keeps its resolution); the feet stay planted
  const q = clamp(u.sq + (rush ? 0.1 : f.wsq) * we, -0.3, 0.3); // a rushing brute crouches low
  const roll = u.roll;
  ctx.save();
  ctx.translate(x, u.y);
  if (roll) {
    // tumbling through the air: one flip about its middle, its shadow left on the road
    const k = 1 - Math.min(0.45, u.z / u.scale / 70);
    ellipse(ctx, 0, 0, 15 * u.scale * k, 4.6 * u.scale * k);
    ctx.fillStyle = 'rgba(25, 15, 35, 0.22)';
    ctx.fill();
    const pv = -22 * u.scale - u.z;
    ctx.translate(0, pv);
    ctx.rotate(roll);
    ctx.translate(0, -pv);
  }
  ctx.scale(u.scale * (1 + q), u.scale / (1 + q));
  const cycleT = u.cycleT;
  const n = u.strikeN + (wind > 0 && u.atk <= 0 ? 1 : 0); // a wind-up shows the strike that is coming
  const look: Look = {
    face: u.face,
    walk: u.walk,
    moving: u.moving,
    aim: u.weapon === 'pistol' && wind > 0 ? Math.max(u.aim, 0.9) : u.aim, // the pistol snaps up
    aimAngle: u.aimAngle,
    atk: u.atk,
    flash: u.flash > 0,
    blink: u.blinkT < 0,
    hop: u.z / u.scale,
    weapon: u.weapon,
    level: u.level,
    anim: u.weapon === 'gatling' ? u.spinPhase : u.weapon === 'ram' ? (u.dash > 0 ? 1 : 0) : u.weapon === 'gunblade' ? u.trigT / 0.15 : 0,
    sprint: u.sprint,
    crouch: u.crouch,
    lean: u.lean,
    noShadow: roll !== 0,
    wind,
    lean2: rush ? -0.16 : f.lean, // the rushing brute leans into its charge
    contact: f.contact,
    tilt: u.tilt,
    hurt: Math.min(1, u.hurtT / 0.26),
    smear: smearOf(u),
    alt: (n & 1) === 1,
    fox: u.side === 'fox',
    kind: u.kind,
    heat: u.weapon === 'gatling' ? u.spin : 0,
    cycle: u.weapon === 'rifle' && cycleT > 0.03 && cycleT < 0.13 ? Math.sin(((0.13 - cycleT) / 0.1) * Math.PI) : 0,
  };
  if (u.side === 'rabbit') drawRabbit(ctx, { ...look, style: u.style as RabbitStyle, rLevel: u.rLevel });
  else drawFox(ctx, { ...look, style: u.style as FoxStyle });
  ctx.restore();
}

function hpBar(ctx: Ctx, u: Unit) {
  const w = 30 * u.scale;
  const x = u.x - w / 2;
  const y = u.y - u.z - 82 * u.scale;
  rr(ctx, x, y, w, 6, 3);
  fillStroke(ctx, COLOR.hpBack, 1.5);
  const ratio = Math.max(0, u.hp / u.maxHp);
  const chip = Math.max(0, u.hpShown / u.maxHp);
  if (chip > ratio) {
    rr(ctx, x + 1, y + 1, (w - 2) * chip, 4, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (ratio > 0) {
    rr(ctx, x + 1, y + 1, (w - 2) * ratio, 4, 2);
    ctx.fillStyle = u.side === 'rabbit' ? COLOR.hpGood : COLOR.hpBad;
    ctx.fill();
  }
}

/** Where a unit's gun muzzle is right now (same maths as Battle.fire, plus the drawn recoil). */
function muzzleOf(u: Unit) {
  const hand = SHOULDER.has(u.weapon) ? ROCKET_HAND : GUN_HAND;
  const len = BARREL[u.weapon] ?? 20;
  return {
    x: u.x + u.face * (u.lunge + hand.x + Math.cos(u.aimAngle) * len) * u.scale,
    y: u.y - u.z + (hand.y + Math.sin(u.aimAngle) * len + u.crouch * CROUCH) * u.scale,
  };
}

/** Warnings before big super attacks, so the road stays readable: rail aim line, gatling heat, ram speed lines. */
function drawTelegraphs(ctx: Ctx, units: Unit[]) {
  ctx.save();
  for (const u of units) {
    if (!u.evo) continue;
    const t = u.target;
    if (u.evo.pierce && t && !t.dead && u.aim > 0.6 && u.cdLeft < 0.4) {
      const m = muzzleOf(u);
      const charge = 1 - Math.max(0, u.cdLeft) / 0.4;
      let nx = t.x - m.x;
      let ny = t.y - t.z - 20 * t.scale - m.y;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const len = u.range * 1.15;
      ctx.globalAlpha = 0.7 * charge;
      ctx.strokeStyle = EVO.accent.railgun;
      ctx.lineWidth = 1.5;
      line(ctx, m.x, m.y, m.x + nx * len, m.y + ny * len);
      ctx.globalCompositeOperation = 'lighter';
      circle(ctx, m.x, m.y, 4 + 6 * charge);
      ctx.fillStyle = EVO.accent.railgun;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.evo.spinMax && u.spin > 0.3) {
      const m = muzzleOf(u);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * u.spin;
      circle(ctx, m.x, m.y, 7);
      ctx.fillStyle = EVO.accent.gatling;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.dash > 0) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (const dy of [-34, -18]) line(ctx, u.x - u.face * 18, u.y + dy * u.scale, u.x - u.face * 44, u.y + dy * u.scale);
    }
  }
  ctx.restore();
}

/** Seconds a bullet, rocket or shell has been flying (they carry no clock of their own: it comes from the distance flown). */
const flightT = (p: Projectile) => Math.hypot(p.x - p.sx, p.y - p.sy) / Math.max(1, p.speed);

/** The tracer look of a bullet: by gun, and for fox rounds a fixed orange (thicker with the fox's level). */
function tracerOf(p: Projectile) {
  const w = p.weapon ?? (p.speed > 1200 ? 'rifle' : p.mini ? 'gatling' : 'pistol');
  if (p.boss) return TRACER.boss;
  if (w === 'gatling') return p.tracer ? TRACER.gatlingTracer : TRACER.gatling;
  return w === 'smg' ? TRACER.smg : w === 'rifle' ? TRACER.rifle : w === 'pistol' ? TRACER.pistol : TRACER.other;
}

export function drawProjectile(ctx: Ctx, p: Projectile) {
  const col = TIER.metal[clamp(p.level, 1, 7) - 1];
  const light = TIER.metalLight[clamp(p.level, 1, 7) - 1];
  const ca = Math.cos(p.angle);
  const sa = Math.sin(p.angle);
  ctx.save();
  if (p.kind === 'wave') {
    // gunblade shock wave: a glowing crescent that thins as it flies, two fading afterimages behind it
    const fade = 1 - Math.min(1, p.t / p.dur);
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    if (ca < 0) ctx.scale(-1, 1);
    ctx.lineCap = 'round';
    for (const [off, al] of [
      [-24, 0.2],
      [-12, 0.45],
      [0, 1],
    ]) {
      ctx.globalAlpha = al;
      ctx.beginPath();
      ctx.arc(-10 + off, 0, 18, -1.1, 1.1);
      ctx.strokeStyle = EVO.accent.gunblade;
      ctx.lineWidth = 6 * fade + 1;
      ctx.stroke();
      ctx.strokeStyle = EVO.flash;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (p.kind === 'shell') {
    // carrot cannon: landing marker, then the giant carrot with a flame behind it
    ellipse(ctx, p.tx, p.ty + 10, p.aoe * 0.7, p.aoe * 0.22);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = EVO.accent.cannon;
    ctx.stroke();
    ctx.setLineDash([]);
    // the giant carrot wobbles slowly as it flies
    const wob = Math.sin(flightT(p) * 6) * 0.15;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + wob);
    ctx.globalCompositeOperation = 'lighter';
    poly(ctx, [-16, -5, -32 - frand(0, 10), 0, -16, 5]);
    ctx.fillStyle = '#ff9a3c';
    ctx.fill();
    ctx.restore();
    drawCarrot(ctx, p.x, p.y, 1.5, p.angle + wob - Math.PI / 2);
    ctx.restore();
    return;
  }
  if (p.kind === 'bomb') {
    // target marker on the road + a giant carrot falling onto it
    const k = Math.min(1, p.t);
    ellipse(ctx, p.tx, p.ty, 10 + 30 * k, (10 + 30 * k) * 0.32);
    ctx.fillStyle = `rgba(20, 10, 30, ${0.12 + 0.2 * k})`;
    ctx.fill();
    ellipse(ctx, p.tx, p.ty, p.aoe * 0.75, p.aoe * 0.24);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(255, 90, 80, ${0.5 + 0.4 * Math.sin(p.t * 30)})`;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40);
    g.addColorStop(0, 'rgba(255, 170, 70, 0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    circle(ctx, p.x, p.y, 40);
    ctx.fill();
    ctx.restore();
    drawCarrot(ctx, p.x, p.y - 8, 2.2, Math.sin(p.t * 20) * 0.08);
    ctx.restore();
    return;
  }
  if (p.kind === 'bullet') {
    // tracer: three plain strokes (faint full length, brighter front, hot core) and a head; no gradients
    const fox = p.side === 'fox' && !p.boss;
    const T = tracerOf(p);
    const flown = Math.hypot(p.x - p.sx, p.y - p.sy);
    const len = Math.min(T.len * (fox ? 0.8 : 1), flown + 4); // never poking out behind the gun
    const w = T.w + (fox ? 0.4 * (clamp(p.level, 1, 7) - 1) : 0);
    const body = fox ? FX.fox.tracer : T.body ?? col;
    const core = fox || p.boss ? FX.fox.tracerCore : FX.rabbit.tracerCore;
    const head = fox || p.boss ? FX.fox.tracerHead : light;
    // fox rounds wobble a little: cheap guns, shaky hands
    const wob = fox ? Math.sin(flightT(p) * 45 + p.offset * 3) * 1.3 : 0;
    const hx = p.x - sa * wob;
    const hy = p.y + ca * wob;
    const tx = p.x - ca * len;
    const ty = p.y - sa * len;
    // the body is painted normally (so fox orange reads as orange on the grey road); the core and head glow
    ctx.lineCap = 'round';
    ctx.strokeStyle = body;
    ctx.lineWidth = w;
    ctx.globalAlpha = 0.35;
    line(ctx, tx, ty, hx, hy);
    ctx.globalAlpha = 0.9;
    line(ctx, lerp(tx, hx, 0.55), lerp(ty, hy, 0.55), hx, hy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = core;
    ctx.lineWidth = w * 0.4;
    line(ctx, lerp(tx, hx, 0.7), lerp(ty, hy, 0.7), hx, hy);
    circle(ctx, hx, hy, T.head);
    ctx.fillStyle = head;
    ctx.fill();
  } else if (p.kind === 'rocket') {
    const fox = p.side === 'fox';
    const barrage = p.weapon === 'barrage' || (p.cluster ?? 0) > 0;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (fox) {
      // the bomber's homemade rocket corkscrews off its line
      const ph = flightT(p) * 50;
      ctx.translate(0, Math.sin(ph) * 5);
      ctx.rotate(Math.cos(ph) * 0.25);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fl = frand(10, 18);
    poly(ctx, [-10, -3.5, -10 - fl, 0, -10, 3.5]);
    ctx.fillStyle = fox ? '#ff7a2b' : '#ff9a3c';
    ctx.fill();
    poly(ctx, [-10, -1.8, -10 - fl * 0.55, 0, -10, 1.8]);
    ctx.fillStyle = '#fff2b0';
    ctx.fill();
    ctx.restore();
    poly(ctx, [-11, -4, -15, -8, -7, -4]);
    fillStroke(ctx, '#3b3644', 1.5);
    poly(ctx, [-11, 4, -15, 8, -7, 4]);
    fillStroke(ctx, '#3b3644', 1.5);
    rr(ctx, -11, -4, 17, 8, 3);
    fillStroke(ctx, fox ? FX.fox.rocket : col, 2);
    if (fox || barrage) {
      ctx.fillStyle = fox ? EVO.art.band : EVO.accent.barrage;
      ctx.fillRect(-3, -3, 3, 6);
    }
    poly(ctx, [6, -4, 13, 0, 6, 4]);
    fillStroke(ctx, fox ? '#c9b8a6' : '#e5e8ee', 2);
  } else if (p.bounce) {
    // awakened cannon: the carrot hops back up for its second blast
    drawCarrot(ctx, p.x, p.y, 1.5, Math.sin(p.t * Math.PI * 2) * 0.3);
  } else if (p.mini) {
    // cluster bomblets: small red and white balls
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    circle(ctx, 0, 0, 3.6);
    fillStroke(ctx, EVO.art.band, 1.4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3.4, -0.8, 6.8, 1.6);
  } else {
    // a grenade: its landing spot darkens under it, and it blinks red just before it lands
    const k = Math.min(1, p.t);
    const rx = 6 + 12 * (1 - k);
    ellipse(ctx, p.tx, p.ty, rx, rx * 0.35);
    ctx.fillStyle = `rgba(20, 10, 30, ${0.15 + 0.2 * k})`;
    ctx.fill();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.scale(0.85, 0.85);
    ctx.translate(-6, -1);
    drawWeapon(ctx, 'grenade', p.level, 2.2);
    if (k > 0.7) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p.t * 40);
      circle(ctx, 6, -2, 2);
      ctx.fillStyle = '#ff3b30';
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Carrot stash HP: floating number + bar at the left end of the road, shaking red when foxes steal. */
function drawBaseHp(ctx: Ctx, b: Battle) {
  const r = L.baseHp;
  const hurt = b.leakFlash > 0;
  ctx.save();
  if (hurt) ctx.translate(frand(-2, 2), frand(-1.5, 1.5));
  drawCarrot(ctx, r.x + 10, r.y - 15, 0.8, 0.45);
  label(ctx, String(Math.ceil(b.baseHp)), r.x + 26, r.y - 13, 24, { align: 'left', color: hurt ? '#ff8a80' : COLOR.white });
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  fillStroke(ctx, COLOR.hpBack, 2.5);
  const shown = Math.max(0, b.baseShown / b.baseMax);
  const ratio = Math.max(0, b.baseHp / b.baseMax);
  const iw = r.w - 5;
  if (shown > ratio) {
    rr(ctx, r.x + 2.5, r.y + 2.5, iw * shown, r.h - 5, (r.h - 5) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (ratio > 0) {
    rr(ctx, r.x + 2.5, r.y + 2.5, iw * ratio, r.h - 5, (r.h - 5) / 2);
    ctx.fillStyle = ratio > 0.3 ? COLOR.hpGood : COLOR.hpBad;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(r.x + 5, r.y + 3, Math.max(0, iw * ratio - 6), 2);
  }
  ctx.restore();
}

/** "x12 COMBO" counter at the top of the battle; grows on each knock-out, gets hotter in colour. */
function drawCombo(ctx: Ctx, b: Battle) {
  if (b.combo < 2 || b.phase === 'cleared' || b.phase === 'victory') return;
  const c = b.combo;
  const color = c >= 40 ? '#ff5a4f' : c >= 20 ? '#ff9f43' : c >= 10 ? '#ffd84a' : COLOR.white;
  const s = 1 + b.comboPulse * 0.4 + Math.min(0.4, c / 100);
  ctx.save();
  ctx.globalAlpha = Math.min(1, b.comboT / 0.5);
  ctx.translate(W / 2, L.comboY);
  ctx.scale(s, s);
  label(ctx, `x${c}`, 0, 0, 34, { color, lw: 8 });
  label(ctx, 'COMBO', 0, 24, 14, { color: COLOR.white });
  ctx.restore();
  // time left to keep the combo alive
  const w = 70;
  const frac = Math.max(0, b.comboT / BAL.comboWindow);
  rr(ctx, W / 2 - w / 2, L.comboY + 36, w, 5, 2.5);
  ctx.fillStyle = 'rgba(40, 32, 48, 0.5)';
  ctx.fill();
  rr(ctx, W / 2 - w / 2, L.comboY + 36, w * frac, 5, 2.5);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Carrot airstrike charge: fills up clockwise, glows and says "TAP THE ROAD" when ready. */
function drawBombCharge(ctx: Ctx, b: Battle, time: number) {
  const { x, y, r } = L.bomb;
  const ready = b.bombReady;
  const frac = 1 - b.bombCd / BAL.bombCooldown;
  if (ready) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, `rgba(255, 200, 80, ${0.45 + 0.25 * Math.sin(time * 6)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, r * 2);
    ctx.fill();
    ctx.restore();
  }
  circle(ctx, x, y, r);
  fillStroke(ctx, ready ? '#ff9f43' : COLOR.hudPill, 2.5);
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.55;
  drawCarrot(ctx, x, y + 1, 0.8, 0.6 + (ready ? Math.sin(time * 8) * 0.12 : 0));
  ctx.restore();
  if (!ready) {
    ctx.beginPath();
    ctx.arc(x, y, r - 1, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  } else if (b.bombUses < 3) {
    const pulse = 1 + Math.sin(time * 7) * 0.08;
    ctx.save();
    ctx.translate(x + r + 8, y);
    ctx.scale(pulse, pulse);
    label(ctx, 'TAP THE ROAD!', 0, 0, 14, { align: 'left', color: COLOR.toast });
    ctx.restore();
  }
}

/** The fox a rabbit squad is focusing its fire on gets a turning red target marker (2+ shooters on it). */
function drawFocus(ctx: Ctx, units: Unit[], time: number) {
  const count = new Map<Unit, number>();
  for (const u of units) {
    if (u.side !== 'rabbit' || u.melee || !u.target || u.target.dead || u.aim < 0.5) continue;
    count.set(u.target, (count.get(u.target) ?? 0) + 1);
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const [t, n] of count) {
    if (n < 2) continue;
    const x = t.x;
    const y = t.y - t.z - 24 * t.scale;
    const r = 15 * t.scale + 2 * Math.sin(time * 6);
    ctx.globalAlpha = Math.min(0.9, 0.35 + n * 0.15);
    ctx.strokeStyle = '#ff4b4b';
    ctx.lineWidth = 2;
    circle(ctx, x, y, r);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 4; i++) {
      const a = time * 1.5 + (i * Math.PI) / 2;
      line(ctx, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
    }
  }
  ctx.restore();
}

/** Speech bubbles: "!" when a fox pack charges or a rabbit spots a target; a sweat drop when one falls back hurt. */
/** The boss's war cry: a pulsing red ring under every fox while it lasts. */
function drawRally(ctx: Ctx, b: Battle, sorted: Unit[], time: number) {
  if (b.rallyT <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fade = Math.min(1, b.rallyT / 0.6);
  for (const u of sorted) {
    if (u.side !== 'fox') continue;
    ctx.globalAlpha = (0.3 + 0.15 * Math.sin(time * 10 + u.id)) * fade;
    ellipse(ctx, u.x, u.y, 22 * u.scale, 8 * u.scale);
    ctx.fillStyle = '#ff3b30';
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A brute winding up a bull rush: the row it will charge down lights up red on the road (exactly the rows it can
 * hit), filling from the brute toward its target as the rush comes, with chevrons pointing the way.
 */
function drawRushLanes(ctx: Ctx, sorted: Unit[]) {
  for (const u of sorted) {
    const k = rushOf(u);
    if (k <= 0) continue;
    const x1 = u.x - 12 * u.scale;
    const x0 = Math.max((u.windTarget ? u.windTarget.x : x1 - 160) - 40, 60);
    if (x1 - x0 < 20) continue;
    const y0 = u.dashY - RAM_ROW;
    const h = RAM_ROW * 2;
    const fill = x1 - (x1 - x0) * (1 - (1 - k) ** 2);
    ctx.save();
    ctx.fillStyle = FX.kind.boss;
    ctx.globalAlpha = 0.1 + 0.08 * k;
    rr(ctx, x0, y0, x1 - x0, h, 12);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    rr(ctx, fill, y0, x1 - fill, h, 12);
    ctx.fill();
    ctx.strokeStyle = FX.kind.boss;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    const n = Math.max(1, Math.round((x1 - x0) / 48));
    for (let i = 0; i < n; i++) {
      const cx = x1 - ((i + 0.5) / n) * (x1 - x0);
      ctx.globalAlpha = cx >= fill ? 0.85 : 0.3; // a chevron lights up as the charge-up passes it
      ctx.beginPath();
      ctx.moveTo(cx + 6, u.dashY - 9);
      ctx.lineTo(cx - 5, u.dashY);
      ctx.lineTo(cx + 6, u.dashY + 9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Speed streaks behind sprinting foxes. */
function drawDashLines(ctx: Ctx, sorted: Unit[]) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  for (const u of sorted) {
    if (u.boostT <= 0 || !u.moving) continue;
    const back = -u.face;
    for (let i = 0; i < 3; i++) {
      const y = u.y - u.z - (12 + i * 14) * u.scale;
      const x0 = u.x + back * (16 + i * 5) * u.scale;
      ctx.globalAlpha = Math.min(1, u.boostT * 3) * (0.8 - i * 0.2);
      ctx.lineWidth = 2.6 - i * 0.6;
      line(ctx, x0, y, x0 + back * (18 + i * 6), y);
    }
  }
  ctx.restore();
}

/** Smoke bombs: a billowing grey cloud that half hides the foxes inside it. */
function drawSmoke(ctx: Ctx, b: Battle, time: number) {
  for (const sm of b.smokes) {
    const grow = Math.min(1, sm.t / 0.35);
    const fade = Math.min(1, (sm.life - sm.t) / 0.8);
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + time * 0.3;
      const rr0 = sm.r * (0.25 + 0.45 * hash(i + 3)) * grow;
      const x = sm.x + Math.cos(a) * rr0;
      const y = sm.y - 18 + Math.sin(a) * rr0 * 0.45;
      const r = sm.r * (0.38 + 0.12 * Math.sin(time * 1.7 + i)) * grow;
      ctx.globalAlpha = 0.5 * fade;
      circle(ctx, x, y, r);
      ctx.fillStyle = i % 2 ? '#c9c4d2' : '#e3dfe8';
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEmotes(ctx: Ctx, units: Unit[]) {
  for (const u of units) {
    if (u.stun > 0) {
      // dizzy: little stars circling the head
      const top = u.y - u.z - 74 * u.scale;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = u.stun * 9 + (i / 3) * Math.PI * 2;
        ctx.save();
        ctx.translate(u.x + Math.cos(a) * 14 * u.scale, top + Math.sin(a) * 4);
        starPath(ctx, 0, 0, 5, 2.2, 5);
        fillStroke(ctx, '#ffd84a', 1.4);
        ctx.restore();
      }
      ctx.restore();
    }
    if (u.emoteT <= 0 || !u.emote) continue;
    const age = 1.1 - u.emoteT;
    const pop = easeOutBack(Math.min(1, age / 0.16));
    const fade = Math.min(1, u.emoteT / 0.2);
    const top = u.y - u.z - (u.side === 'rabbit' ? 84 : 80) * u.scale;
    ctx.save();
    ctx.globalAlpha = fade;
    if (u.emote === 'sweat') {
      ctx.translate(u.x - u.face * 12 * u.scale, top + 26 * u.scale + age * 10);
      ctx.scale(pop, pop);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.quadraticCurveTo(5, 0, 0, 4);
      ctx.quadraticCurveTo(-5, 0, 0, -7);
      fillStroke(ctx, '#8fd6ff', 1.6);
    } else {
      ctx.translate(u.x, top - 6);
      ctx.scale(pop, pop);
      rr(ctx, -8, -10, 16, 17, 6);
      fillStroke(ctx, u.side === 'fox' ? '#ff5a4f' : '#ffffff', 2);
      poly(ctx, [-3, 6, 3, 6, -2, 11]);
      ctx.fillStyle = u.side === 'fox' ? '#ff5a4f' : '#ffffff';
      ctx.fill();
      label(ctx, '!', 0, -1, 15, { color: u.side === 'fox' ? '#ffffff' : COLOR.ink, outline: u.side === 'fox' ? COLOR.ink : '#ffffff', lw: 3 });
    }
    ctx.restore();
  }
}

/** Wind streaks rushing past while the squads sprint to the next street (front: fewer, thinner, over the units). */
function drawSpeedLines(ctx: Ctx, b: Battle, front: boolean) {
  const sp = b.travelSpeed;
  if (sp < 0.05) return;
  ctx.save();
  ctx.lineCap = 'round';
  const n = front ? 12 : 36;
  for (let i = 0; i < n; i++) {
    const j = i + (front ? 100 : 0);
    const y = 20 + hash(j) * (L.sceneBottom - 30);
    const len = (90 + hash(j + 3) * 260) * sp;
    const span = W * 2 + 500;
    const x = W + 250 - ((b.phaseT * 3600 * (0.7 + hash(j + 9) * 0.6) + hash(j + 5) * span) % span); // phaseT stops while paused
    ctx.globalAlpha = (front ? 0.35 : 0.25 + 0.4 * hash(j + 11)) * sp;
    ctx.strokeStyle = hash(j + 17) < 0.15 ? '#ffe9a8' : '#ffffff';
    ctx.lineWidth = front ? 1.2 : 1.5 + hash(j + 13) * 3;
    line(ctx, x, y, x + len, y);
  }
  ctx.restore();
}

/** Everything that sells the speed of the sprint, drawn over the road. */
function drawTravel(ctx: Ctx, b: Battle, sorted: Unit[]) {
  if (b.phase !== 'travel') return;
  const T = b.phaseT;
  const sp = b.travelSpeed;
  // posts and bushes right in front of the camera whip past twice as fast as the street
  if (sp > 0.05) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const span = W + 700;
      const x = ((((i * 430 - b.travelOffset * 1.8) % span) + span) % span) - 350;
      const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      g.addColorStop(0, 'rgba(40, 30, 50, 0)');
      g.addColorStop(0.5, `rgba(40, 30, 50, ${0.5 * sp})`);
      g.addColorStop(1, 'rgba(40, 30, 50, 0)');
      ctx.fillStyle = g;
      if (i === 1) ctx.fillRect(x - 60, L.roadBottom - 70, 120, L.sceneBottom - L.roadBottom + 70); // a bush
      else ctx.fillRect(x - 60, 0, 120, L.sceneBottom); // a lamp post
    }
    ctx.restore();
  }
  // shock cones in front of every sprinter
  if (sp > 0.4) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const u of sorted) {
      if (u.side !== 'rabbit' || u.sprint < 1) continue;
      const cx = u.x + 4 * u.scale;
      const cy = u.y - 26 * u.scale;
      for (const [r, a] of [
        [30, 0.55],
        [44, 0.3],
      ] as [number, number][]) {
        ctx.globalAlpha = a * sp;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.4, cy, r * u.scale, r * 0.9 * u.scale, 0, -1.0, 1.0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  drawSpeedLines(ctx, b, true);
  // tunnel vision at top speed
  if (sp > 0.05) {
    const g = ctx.createRadialGradient(W / 2, 400, 120, W / 2, 400, 420);
    g.addColorStop(0, 'rgba(20, 10, 30, 0)');
    g.addColorStop(1, `rgba(20, 10, 30, ${0.45 * sp})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, L.sceneBottom);
  }
  // the launch flash
  if (b.flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.85 * b.flash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, L.sceneBottom);
    ctx.restore();
  }
  // GO!!! slammed in at the launch
  const go = T - TRAVEL.launch;
  if (go > 0 && go < 0.7) {
    const k = Math.min(1, go / 0.12);
    ctx.save();
    ctx.globalAlpha = go > 0.5 ? (0.7 - go) / 0.2 : 1;
    ctx.translate(W / 2, 300);
    ctx.scale(2.2 - 1.2 * k, 2.2 - 1.2 * k);
    ctx.rotate(-0.08);
    label(ctx, 'GO!!!', 0, 0, 72, { color: '#ffd84a', lw: 12 });
    ctx.restore();
  }
  // distance and speed: 19 km in two seconds
  if (T > TRAVEL.launch - 0.1) {
    const km = TRAVEL.km * b.travelK;
    const kmh = Math.round(((TRAVEL.km * 3600) / (TRAVEL.stop - TRAVEL.launch)) * 1.2 * sp);
    const pop = 1 + 0.15 * sp * Math.abs(Math.sin(T * 30));
    ctx.save();
    ctx.translate(W / 2, 190);
    ctx.scale(pop, pop);
    label(ctx, `${km.toFixed(1)} KM`, 0, 0, 44, { color: '#ffffff', lw: 9 });
    ctx.restore();
    label(ctx, `${kmh.toLocaleString('en-US')} KM/H`, W / 2, 228, 18, { color: sp > 0.5 ? '#ff9f43' : COLOR.toast });
  }
}

/** Ghost copies trailing behind sprinting rabbits. */
function drawAfterimages(ctx: Ctx, b: Battle, sorted: Unit[]) {
  const sp = b.travelSpeed;
  if (b.phase !== 'travel' || sp < 0.3) return;
  for (const u of sorted) {
    if (u.side !== 'rabbit' || u.sprint < 1) continue;
    for (let k = 3; k >= 1; k--) {
      ctx.save();
      ctx.globalAlpha = 0.22 * (1 - k / 4) * sp;
      drawUnit(ctx, u, -k * 20 * sp);
      ctx.restore();
    }
  }
}

export function drawField(ctx: Ctx, b: Battle, time = 0) {
  ctx.save();
  if (b.shake > 0) ctx.translate(frand(-b.shake, b.shake), frand(-b.shake, b.shake) * 0.6);
  // the camera punch: a directional jolt from cannons, rails and slams, on top of the random shake
  if (b.kickX || b.kickY) ctx.translate(b.kickX, b.kickY);
  drawSpeedLines(ctx, b, false);
  b.fx.draw(ctx, 0);
  const sorted = b.units.filter((u) => !u.dead).sort((a, c) => a.y - c.y); // retired soldiers vanish even while paused
  // awakened supers stand in a soft gold glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const u of sorted) {
    if (!u.awake) continue;
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(time * 4 + u.id);
    ellipse(ctx, u.x, u.y, 20 * u.scale, 7 * u.scale);
    ctx.fillStyle = EVO.awake;
    ctx.fill();
  }
  ctx.restore();
  drawAfterimages(ctx, b, sorted);
  drawRally(ctx, b, sorted, time);
  drawRushLanes(ctx, sorted);
  drawDashLines(ctx, sorted);
  for (const u of sorted) drawUnit(ctx, u);
  drawSmoke(ctx, b, time);
  drawTelegraphs(ctx, sorted);
  drawFocus(ctx, sorted, time);
  // scope boost: faint red laser sight from the gun to the target while aiming
  ctx.save();
  ctx.lineWidth = 1.2;
  for (const u of sorted) {
    const t = u.target;
    if (!u.scoped || u.evo?.pierce || !t || t.dead || u.aim < 0.6) continue;
    const sx = u.x + u.face * 30 * u.scale;
    const sy = u.y - u.z - 21 * u.scale;
    const tx = t.x;
    const ty = t.y - t.z - 22 * t.scale;
    // the laser brightens while the shooter holds its breath before the shot
    ctx.strokeStyle = `rgba(255, 60, 60, ${0.32 + 0.38 * windOf(u)})`;
    line(ctx, sx, sy, tx, ty);
    circle(ctx, tx, ty, 2.2);
    ctx.fillStyle = 'rgba(255, 70, 70, 0.85)';
    ctx.fill();
  }
  ctx.restore();
  for (const p of b.projs) drawProjectile(ctx, p);
  b.fx.draw(ctx, 1);
  for (const u of sorted) if (u.hpShown < u.maxHp && u.kind !== 'boss' && u.x > -10) hpBar(ctx, u);
  drawEmotes(ctx, sorted);
  ctx.restore();
  drawTravel(ctx, b, sorted);

  // red edge when foxes steal carrots
  if (b.leakFlash > 0) {
    const g = ctx.createLinearGradient(0, 0, 110, 0);
    g.addColorStop(0, `rgba(255, 50, 60, ${(0.6 * b.leakFlash) / 0.5})`);
    g.addColorStop(1, 'rgba(255, 50, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.roadTop, 110, L.roadBottom - L.roadTop);
  }

  drawBaseHp(ctx, b);
  drawBombCharge(ctx, b, time);
  drawCombo(ctx, b);

  if (b.boss && !b.boss.dead) {
    const br = L.bossBar;
    const ratio = Math.max(0, b.boss.hp / b.boss.maxHp);
    const chip = Math.max(0, b.boss.hpShown / b.boss.maxHp);
    label(ctx, 'BIG RED', W / 2, br.y - 13, 18, { color: '#ffb0a8' });
    rr(ctx, br.x, br.y, br.w, br.h, 8);
    fillStroke(ctx, COLOR.hpBack, 2.5);
    if (chip > ratio) {
      rr(ctx, br.x + 3, br.y + 3, (br.w - 6) * chip, br.h - 6, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    if (ratio > 0) {
      rr(ctx, br.x + 3, br.y + 3, (br.w - 6) * ratio, br.h - 6, 5);
      ctx.fillStyle = COLOR.hpBad;
      ctx.fill();
    }
  }

  if (b.banner && b.phase !== 'victory') {
    const t = b.banner.t;
    const alpha = t < 0.25 ? t / 0.25 : t > 1.8 ? Math.max(0, (2.2 - t) / 0.4) : 1;
    const pop = t < 0.3 ? 0.6 + 0.4 * easeOutBack(t / 0.3) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, L.bannerY);
    ctx.scale(pop, pop);
    label(ctx, b.banner.text, 0, 0, 48, { color: b.banner.color, lw: 9 });
    if (b.banner.sub) label(ctx, b.banner.sub, 0, 40, 22, { color: COLOR.toast });
    ctx.restore();
  }
}

export function drawPaused(ctx: Ctx) {
  ctx.fillStyle = 'rgba(12, 8, 22, 0.45)';
  ctx.fillRect(0, 0, W, L.sceneBottom);
  label(ctx, 'PAUSED', W / 2, 300, 52, { lw: 9 });
  label(ctx, 'tap the road to keep fighting', W / 2, 346, 18, { color: COLOR.textDim });
}
