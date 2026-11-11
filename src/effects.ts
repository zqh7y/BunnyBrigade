import { KILL_FLIGHT, MUZZLE, type ImpactKind, type KillHow } from './attackfx';
import { sfx } from './audio';
import type { FoxKind, WeaponId } from './data';
import type { FoxStyle, RabbitStyle, Style } from './looks';
import { drawFox, drawFoxHat, drawHelmet, drawRabbit, type Look } from './draw/characters';
import { drawCash, drawGem } from './draw/icons';
import { COLOR, EVO, FX } from './theme';
import { circle, easeOutBack, ellipse, fchance, fillStroke, fpick, frand, hash, label, lerp, poly, rr, starPath, type Ctx } from './util';

/*
 * Particles: flashes, sparks, smoke, impact marks, comic words, flying bodies. All of their randomness is frand
 * (never Math.random), so effects can be added or tuned without moving a single gameplay roll.
 */

/** Enough about a unit to draw its body flying away after it is knocked out. */
export interface BodySnap {
  side: 'rabbit' | 'fox';
  kind: FoxKind | 'rabbit';
  style: Style;
  weapon: WeaponId;
  level: number;
  rLevel: number;
  scale: number;
  face: number;
  char?: boolean; // blasted or fried: drawn as a dark silhouette with wide white eyes
}

export type FxKind =
  | 'spark'
  | 'flash'
  | 'glow'
  | 'smoke'
  | 'fire'
  | 'ring'
  | 'puff'
  | 'text'
  | 'debris'
  | 'slash'
  | 'star'
  | 'casing'
  | 'body'
  | 'dust'
  | 'paw' // a rabbit's paw print on the road, fading
  | 'stepRing' // the little ring a landing foot makes on the road
  | 'scorch'
  | 'chunk'
  | 'beam'
  | 'coin'
  | 'splat'
  | 'confetti'
  | 'shock'
  | 'fw'
  | 'gem'
  | 'shard'
  | 'ghost'
  | 'pow' // comic word in a starburst
  | 'impact' // opaque comic hit star
  | 'fluff' // a tuft of the victim's fur
  | 'zap' // a flickering electric arc
  | 'decal'; // a scuff, crack or crater on the road

export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
  face: number;
  layer: 0 | 1; // 0 = on the ground under the units, 1 = above them
  stretch: number;
  text?: string;
  hat?: 'helmet' | 'fox';
  level?: number;
  ground?: number;
  snap?: BodySnap;
  x2?: number;
  y2?: number;
  sx?: number;
  sy?: number;
  shape?: number; // flash / slash / impact / decal variant, or a body's knock-out style
  color2?: string; // a second colour (flash core)
  bounce?: number; // how much of its fall speed it keeps when it hits the ground (default 0.32)
  alt?: boolean; // mirrored variant (backhand slash)
  orbit?: number; // circles (sx, sy) at this radius instead of flying (dizzy stars)
}

type Spawn = Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>;

const MAX_PARTICLES = 1800;
const MAX_POWS = 4;
const MAX_DECALS = 30;
const MAX_CHARRED = 4;
const KILLS: KillHow[] = ['pop', 'slice', 'bonk', 'blast', 'zap', 'bowl'];

/** Extra details for Effects.impact. */
export interface ImpactOpts {
  tint?: string; // slash / bash / spark colour (weapon accent, fox kind colour)
  slash?: number; // slash shape for blade impacts
  alt?: boolean; // backhand: the slash mirrored
  ang?: number; // the shot's angle (heavy rounds)
  ground?: number; // the victim's feet (dust, road marks)
  cheap?: boolean; // no flash (fast gatling rounds)
}

/** Explosion looks: rabbit rocket, fox homemade rocket, grenade dirt, carrot cannon. */
export type BlastStyle = 'clean' | 'dirty' | 'dirt' | 'carrot';

/** Glow is a soft radial blob: one small picture per colour, drawn scaled, instead of a gradient per glow per frame. */
const GLOW = new Map<string, HTMLCanvasElement>();
function glowSprite(c: string) {
  let g = GLOW.get(c);
  if (!g) {
    g = document.createElement('canvas');
    g.width = g.height = 64;
    const k = g.getContext('2d')!;
    const gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, c);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    k.fillStyle = gr;
    k.fillRect(0, 0, 64, 64);
    if (GLOW.size > 48) GLOW.clear();
    GLOW.set(c, g);
  }
  return g;
}

export class Effects {
  list: Particle[] = [];
  private powCd = 0;
  private pows = 0;
  private decals = 0;
  private charred = 0;

  add(p: Spawn) {
    if (this.list.length > MAX_PARTICLES) return;
    const life = p.life ?? 0.5;
    this.list.push({ vx: 0, vy: 0, size: 4, color: '#ffffff', rot: 0, vr: 0, grav: 0, drag: 0, face: 1, layer: 1, stretch: 1, ...p, life, max: life });
  }

  /** How full the particle pool is (0..1). Optional effects drop out as it fills. */
  get load() {
    return this.list.length / MAX_PARTICLES;
  }

  /** An optional particle (casings, wisps, embers, tufts, decals, trails): skipped under load. */
  opt(p: Spawn) {
    if (this.load < 0.6) this.add(p);
  }

  /** A very optional particle (rifle vapour, cooling smoke): skipped early. */
  opt2(p: Spawn) {
    if (this.load < 0.4) this.add(p);
  }

  private sparks(x: number, y: number, n: number, center: number, spread: number, lo: number, hi: number, color: string, size = 2, life: [number, number] = [0.15, 0.3]) {
    for (let i = 0; i < n; i++) {
      const a = center + frand(-spread, spread);
      const s = frand(lo, hi);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(life[0], life[1]), size, color, drag: 4 });
    }
  }

  /**
   * Muzzle flash, glow and smoke for a gun shot. ang = world angle the gun points at. Each gun has its own flash
   * silhouette (attackfx MUZZLE); foxes flash orange with dark smoke and embers; the boss's flashes are bigger.
   */
  muzzle(x: number, y: number, ang: number, weapon: WeaponId, color: string, fox = false, boss = false) {
    const m = MUZZLE[weapon] ?? MUZZLE.pistol!;
    const P = fox ? FX.fox : FX.rabbit;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const size = m.size * (boss ? 1.4 : 1);
    const flash = { kind: 'flash' as const, life: m.life, color: P.flash, color2: P.core, stretch: m.stretch, shape: m.shape };
    this.add({ ...flash, x, y, rot: ang + (m.shape === 1 ? frand(-0.35, 0.35) : 0), size });
    if (boss) this.add({ ...flash, x: x - ca * 6, y: y - sa * 6, rot: ang + frand(-0.35, 0.35), size: size * 0.75 });
    this.add({ kind: 'glow', x, y, life: 0.1, size: m.glow * (boss ? 1.3 : 1), color: fox ? FX.fox.glow : color });
    const smoke = fox ? FX.fox.smoke : FX.rabbit.smoke;
    if (m.shape === 5) {
      // carrot cannon: a white smoke ring, a cone of smoke and a couple of leaves
      this.shock(x, y, 40, '#f4f1f7', 0.45);
      for (let i = 0; i < m.smoke; i++) {
        const a = ang + frand(-0.45, 0.45);
        const s = frand(60, 150);
        this.add({ kind: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15, life: frand(0.45, 0.8), size: frand(5, 8), color: '#f1eef4', drag: 3 });
      }
      for (let i = 0; i < 2; i++) this.leaf(x, y);
    } else if (m.shape === 2) {
      // rifle: a shock ring, the brake vents puffing up and down, one wisp forward
      this.shock(x, y, 16, P.flash, 0.18);
      for (const side of [-1, 1]) this.opt({ kind: 'smoke', x: x - ca * 4, y: y - sa * 4, vx: -sa * side * 45 + ca * 10, vy: ca * side * 45 - 10, life: frand(0.4, 0.6), size: frand(2.5, 3.5), color: smoke, drag: 3 });
      this.opt({ kind: 'smoke', x, y, vx: ca * 40, vy: frand(-30, -15), life: 0.55, size: 3, color: smoke, drag: 2 });
    } else if (m.shape !== 4) {
      const n = Math.floor(m.smoke) + (fchance(m.smoke % 1) ? 1 : 0) + (fox ? 1 : 0);
      for (let i = 0; i < n; i++) this.opt({ kind: 'smoke', x, y, vx: ca * frand(20, 45), vy: frand(-35, -15), life: frand(0.45, 0.7), size: frand(2.5, 4), color: smoke, drag: 2 });
    }
    if (fox && fchance(0.5)) this.ember(x, y, ca);
    if (m.shape === 4) {
      // rockets: backblast out of the tube's back end
      const bx = x - ca * 44;
      const by = y - sa * 44;
      this.add({ ...flash, shape: 6, x: bx, y: by, rot: ang + Math.PI, size: 10, life: 0.07 });
      for (let i = 0; i < m.smoke; i++) {
        this.add({ kind: 'smoke', x: bx, y: by + frand(-3, 3), vx: -ca * frand(50, 130), vy: frand(-25, 10), life: frand(0.4, 0.7), size: frand(5, 8), color: fox ? smoke : '#dedae4', drag: 3 });
      }
      for (let i = 0; i < 3; i++) {
        const s = frand(60, 140);
        this.add({ kind: 'fire', x: bx, y: by, vx: -ca * s, vy: -sa * s + frand(-20, 20), life: frand(0.12, 0.22), size: frand(3, 5), color: fpick(fox ? FX.boom.dirty : ['#fff1a8', '#ffd25e', '#ffa63a']), drag: 4 });
      }
    }
  }

  /** Spent brass (or a belt link, or a grenade pin with shape 1) ejected from a gun, bouncing once on the road. */
  casing(x: number, y: number, face: number, ground: number, w = 5, h = 2.4, color = '#e8b84a', vy = -170) {
    this.opt({ kind: 'casing', x, y, vx: -face * frand(40, 90), vy: vy + frand(-30, 30), grav: 900, vr: frand(-20, 20), life: 0.9, color, ground, sx: w, sy: h });
  }

  /** Lingering tracer line (rifle: width 2.5, railgun: 10). */
  beam(x: number, y: number, x2: number, y2: number, color: string, size = 4, life?: number) {
    this.add({ kind: 'beam', x, y, x2, y2, life: life ?? (size > 6 ? 0.2 : 0.12), color, size });
  }

  /** Coloured expanding ring (evolutions, muzzles, impacts). */
  shock(x: number, y: number, size: number, color: string, life = 0.4) {
    this.add({ kind: 'shock', x, y, life, size, color });
  }

  /** Small cheap blast for cluster bomblets (13 particles instead of a full explosion). */
  miniBlast(x: number, y: number, r: number, ground: number) {
    this.add({ kind: 'glow', x, y, life: 0.14, size: r * 1.6, color: '#ffd27a' });
    this.add({ kind: 'ring', x, y, life: 0.25, size: r });
    this.add({ kind: 'scorch', x, y: ground, life: 1.5, size: r * 0.5, layer: 0 });
    for (let i = 0; i < 4; i++) {
      this.add({ kind: 'fire', x: x + frand(-r, r) * 0.3, y: y + frand(-r, r) * 0.25, vx: frand(-30, 30), vy: frand(-50, 0), life: frand(0.2, 0.32), size: frand(r * 0.25, r * 0.4), color: fpick(['#fff1a8', '#ffa63a', '#ff6a2b']) });
    }
    for (let i = 0; i < 6; i++) {
      const a = frand(0, Math.PI * 2);
      const s = frand(100, 240);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.15, 0.3), size: 2, color: '#ffd36b', drag: 3 });
    }
  }

  /** The old generic hit: a white flash and sparks (still used by evolutions and anything without an impact kind). */
  hit(x: number, y: number, color: string, n = 4) {
    this.add({ kind: 'flash', x, y, rot: frand(0, Math.PI), life: 0.06, size: 6, color: '#ffffff', stretch: 1 });
    for (let i = 0; i < n; i++) {
      const a = frand(0, Math.PI * 2);
      const s = frand(60, 170);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.15, 0.3), size: frand(1.6, 2.6), color, drag: 4 });
    }
  }

  /**
   * A slash mark. shape: 0 crescent, 1 thin knife arc, 2 jagged fox slash, 3 X cross, 5 ninja shadow crescent,
   * 6 gunblade double arc. alpha < 1 for a whiff.
   */
  slash(x: number, y: number, face: number, color: string, shape = 0, alt = false, alpha = 1) {
    const life = shape === 3 || shape === 5 ? 0.22 : shape === 6 ? 0.2 : shape === 2 ? 0.18 : 0.16;
    const size = shape === 1 ? 20 : shape === 2 ? 14 * 1.3 : shape === 3 || shape === 5 ? 24 : shape === 6 ? 24 : 18;
    this.add({ kind: 'slash', x, y, face, color, life, size, shape, alt, stretch: alpha });
    if (shape === 0 && alpha >= 1) this.hit(x, y, '#ffffff');
  }

  /** A swing that met nothing: a faint slash, no flash. */
  whiff(x: number, y: number, face: number, color: string, shape = 0, alt = false) {
    this.slash(x, y, face, color, shape, alt, 0.4);
  }

  /**
   * Where a hit lands, by material (see ImpactKind). fox: the attacker is a fox (orange sparks, dark outlines).
   * dir: +1 = the blow travels right. fur: the victim's fur colour (the tufts it sheds). scale: the victim's size.
   */
  impact(x: number, y: number, kind: ImpactKind, fox: boolean, dir: number, crit: boolean, fur: string, scale = 1, o: ImpactOpts = {}) {
    const m = (crit ? 1.5 : 1) * Math.max(0.8, Math.min(1.5, scale));
    const spark = fox ? FX.fox.spark : FX.rabbit.spark;
    const base = dir >= 0 ? 0 : Math.PI;
    const ground = o.ground ?? y + 20 * scale;
    const face = fox ? -1 : 1;
    const star = (size: number, points: number, color: string, rot = frand(-0.3, 0.3), stretch = 1) => this.add({ kind: 'impact', x, y, size: size * m, shape: points, color, rot, stretch, face, life: frand(0.09, 0.12) });
    const flash = (size: number, shape = 6, stretch = 1, rot = frand(0, Math.PI)) => this.add({ kind: 'flash', x, y, rot, life: 0.05, size: size * m, color: '#ffffff', color2: '#fffbe0', stretch, shape });
    switch (kind) {
      case 'pellet':
        if (!o.cheap) flash(4);
        this.sparks(x, y, 2, base, 1.1, 80, 150, spark, 1.4, [0.12, 0.2]);
        if (fchance(0.25)) this.fluff(x, y, fur, dir);
        break;
      case 'bullet':
        flash(6);
        this.sparks(x, y, 3, base, 1, 80, 180, spark, 1.8);
        this.shock(x, y, 10 * m, spark, 0.12);
        if (fchance(0.5)) this.fluff(x, y, fur, dir);
        break;
      case 'heavy': {
        const ang = o.ang ?? base;
        flash(9, 6, 2.2, ang);
        this.sparks(x, y, 5, ang, 0.5, 160, 320, spark, 2);
        this.shock(x, y, 16 * m, spark, 0.18);
        this.fluff(x, y, fur, dir);
        this.fluff(x, y, fur, dir);
        this.decal(x + dir * 20, ground, 0, 5);
        break;
      }
      case 'blade':
        this.slash(x, y, dir, o.tint ?? '#ffffff', o.slash ?? 1, o.alt);
        if (crit) this.slash(x, y, dir, '#ffffff', 3);
        this.sparks(x, y, 2, base, 0.9, 90, 200, fox ? spark : '#ffffff', 1.6);
        this.fluff(x, y, fur, dir);
        break;
      case 'stab':
        star(9, 4, FX.fox.slash, base, 1.8);
        this.sparks(x, y, 2, base, 0.6, 100, 200, spark, 1.8);
        this.fluff(x, y, fur, dir);
        break;
      case 'shadow':
        this.slash(x, y, dir, FX.kind.ninja, 5, o.alt);
        this.sparks(x, y, 3, base, 1, 90, 220, FX.kind.ninjaCore, 1.8);
        this.fluff(x, y, fur, dir);
        break;
      case 'blunt':
        star(16, 8, '#ffffff');
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + frand(-1.3, 1.3);
          const s = frand(60, 120);
          this.add({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, size: frand(4, 5.5), color: FX.hit.star, drag: 3, vr: frand(-6, 6) });
        }
        this.shock(x, y, 18 * m, '#ffffff', 0.25);
        this.dust(x - dir * 6, ground);
        this.dust(x + dir * 6, ground);
        this.decal(x + dir * 4, ground, 1, 14);
        this.fluff(x, y, fur, dir);
        break;
      case 'punch':
        star(crit ? 11 : 10, 8, '#ffffff');
        for (let i = 0; i < 2; i++) {
          const a = -Math.PI / 2 + frand(-1.2, 1.2);
          const s = frand(60, 110);
          this.add({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, size: frand(3.5, 4.5), color: FX.hit.star, drag: 3, vr: frand(-6, 6) });
        }
        this.fluff(x, y, fur, dir);
        break;
      case 'bash':
        flash(14, 7, 1, 0);
        this.sparks(x, y, 4, base, 0.7, 120, 240, o.tint ?? spark, 2);
        this.shock(x, y, 20 * m, o.tint ?? FX.hit.bash, 0.25);
        this.fluff(x, y, fur, dir);
        break;
      case 'zap':
        this.sparks(x, y, 3, base, 1.4, 90, 200, FX.hit.zap, 1.8);
        this.add({ kind: 'zap', x, y, size: 14 * m, color: FX.hit.zap, life: 0.15 });
        if (crit) this.add({ kind: 'zap', x, y, size: 20, color: '#ffffff', life: 0.12 });
        break;
      case 'blast':
        break; // the explosion is the impact
    }
  }

  /** A tuft of fur knocked off the victim (white or cream rabbits, orange foxes), so who got hit reads. */
  fluff(x: number, y: number, fur: string, dir: number) {
    this.opt({ kind: 'fluff', x: x + frand(-3, 3), y: y + frand(-4, 4), vx: frand(-60, 60) + dir * 40, vy: frand(-80, -30), grav: 140, drag: 2.5, vr: frand(-6, 6), rot: frand(0, 6), life: frand(0.5, 0.8), size: frand(2, 3), color: fur });
  }

  /** A comic word in a starburst (rabbit: yellow burst, red letters; fox: orange burst, cream letters). Rate-limited. */
  pow(x: number, y: number, text: string, fox = false, size = 24) {
    if (!text || this.powCd > 0 || this.pows >= MAX_POWS) return;
    this.powCd = 0.16;
    this.pows++;
    this.add({ kind: 'pow', x, y, text, size, life: 0.55, rot: frand(-0.25, 0.25), vy: -30, drag: 3, face: fox ? -1 : 1, color: fox ? FX.fox.word : FX.rabbit.word });
  }

  /** A comic word over a unit's head (bigger for bigger hits). */
  powAt(u: { x: number; y: number; z: number; scale: number }, text: string, fox = false, dealt = 0) {
    this.pow(u.x + frand(-6, 6), u.y - u.z - 70 * u.scale, text, fox, 22 + Math.min(10, dealt / 15));
  }

  /** A bullet that missed: it glances off the road (a bouncing spark, a tick of flash, a scuff at the dodger's feet). */
  ricochet(x: number, y: number, ang: number, fox = false, ground?: number) {
    this.add({ kind: 'spark', x, y, vx: -Math.cos(ang) * 160, vy: -180, grav: 500, life: 0.3, size: 1.8, color: fox ? FX.fox.spark : FX.rabbit.spark });
    this.add({ kind: 'flash', x, y, rot: frand(0, 3), life: 0.05, size: 4, color: '#ffffff', stretch: 1 });
    if (ground !== undefined) this.decal(x, ground, 0, 4);
  }

  /** A shot taken on a riot shield's face: sparks glance back toward the shooter (face = the way the shield faces). */
  deflect(x: number, y: number, face: number, fox = false) {
    this.add({ kind: 'flash', x, y, rot: frand(0, 3), life: 0.06, size: 5, color: '#ffffff', stretch: 1, shape: 6 });
    this.sparks(x, y, 3, face > 0 ? -0.4 : Math.PI + 0.4, 0.7, 120, 220, fox ? FX.fox.spark : FX.rabbit.spark, 1.8);
  }

  /** A mark left on the road for a few seconds: shape 0 scuff, 1 crack, 2 crater. */
  decal(x: number, y: number, shape: number, size: number, life = 3) {
    if (this.decals >= MAX_DECALS || this.load >= 0.6) return;
    this.decals++;
    this.add({ kind: 'decal', x, y, shape, size, life, rot: frand(0, 6), layer: 0 });
  }

  /** The grenade pin popping out at the start of the throw. */
  pin(x: number, y: number, face: number) {
    this.opt({ kind: 'casing', x, y, vx: -face * frand(20, 50), vy: -200, grav: 900, vr: frand(-14, 14), life: 0.8, color: FX.hit.pin, ground: y + 34, sx: 3, sy: 3, shape: 1 });
  }

  /** Railgun charging: green sparks sucked into the muzzle. */
  suck(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const a = frand(0, Math.PI * 2);
      this.add({ kind: 'spark', x: x + Math.cos(a) * 24, y: y + Math.sin(a) * 24, vx: -Math.cos(a) * 160, vy: -Math.sin(a) * 160, life: 0.15, size: 1.6, color: FX.hit.zap });
    }
  }

  /** Railgun coils venting after a shot. */
  steam(x: number, y: number) {
    for (let i = 0; i < 2; i++) this.opt({ kind: 'smoke', x: x + frand(-6, 6), y, vx: frand(-10, 10), vy: frand(-50, -30), life: 0.5, size: 3, color: '#ffffff', drag: 1.5 });
  }

  /** A rifle round's vapour trail. */
  vapour(x: number, y: number, x2: number, y2: number) {
    for (let i = 1; i <= 4; i++) this.opt2({ kind: 'smoke', x: lerp(x, x2, i / 5), y: lerp(y, y2, i / 5), vy: -8, life: 0.5, size: 1.8, color: '#ffffff' });
  }

  /** A carrot leaf fluttering down. */
  leaf(x: number, y: number) {
    this.opt({ kind: 'confetti', x, y, vx: frand(-40, 40), vy: frand(-60, -10), grav: 300, drag: 1.5, vr: frand(-10, 10), rot: frand(0, 6), life: 0.6, size: 2.6, color: fpick(FX.boom.leaf) });
  }

  /** Smoke curling off hot gatling barrels. */
  cool(x: number, y: number) {
    this.opt2({ kind: 'smoke', x, y, vx: frand(-8, 8), vy: frand(-35, -20), life: 0.6, size: 2.5, color: '#e6e2ea', drag: 1 });
  }

  /** A falling ember (fox guns, the bomber's rocket). */
  ember(x: number, y: number, along = 0) {
    this.opt({ kind: 'spark', x, y, vx: along * frand(40, 90) + frand(-20, 20), vy: frand(-60, -20), grav: 400, life: 0.35, size: 1.6, color: FX.fox.ember });
  }

  /** Electric crackles along a railgun beam. */
  zapLine(x: number, y: number, x2: number, y2: number) {
    for (const k of [0.25, 0.5, 0.75]) this.add({ kind: 'zap', x: lerp(x, x2, k), y: lerp(y, y2, k), size: 16, color: FX.hit.zap, life: 0.15 });
  }

  /** Explosions: 'clean' rabbit rocket, 'dirty' fox rocket (dark smoke, embers, KABLAM!), 'dirt' grenade, 'carrot' cannon. */
  explosion(x: number, y: number, r: number, ground: number, style: BlastStyle = 'clean') {
    const dirty = style === 'dirty';
    this.add({ kind: 'glow', x, y, life: 0.18, size: r * 1.8, color: dirty ? '#ff9a4a' : '#ffd27a' });
    this.add({ kind: 'ring', x, y, life: 0.35, size: r });
    this.add({ kind: 'scorch', x, y: ground, life: style === 'carrot' ? 4 : 3, size: r * 0.55, layer: 0 });
    const fires = dirty ? FX.boom.dirty : ['#fff1a8', '#ffd25e', '#ffa63a', '#ff6a2b'];
    for (let i = 0; i < (style === 'dirt' ? 5 : 8); i++) {
      this.add({
        kind: 'fire',
        x: x + frand(-r, r) * 0.35,
        y: y + frand(-r, r) * 0.3,
        vx: frand(-40, 40),
        vy: frand(-70, 0),
        life: frand(0.25, 0.45),
        size: frand(r * 0.25, r * 0.45),
        color: fpick(fires),
      });
    }
    for (let i = 0; i < (dirty ? 12 : 9); i++) {
      this.add({
        kind: 'smoke',
        x: x + frand(-r, r) * 0.4,
        y: y + frand(-r, r) * 0.3,
        vx: frand(-30, 30),
        vy: frand(-55, -15),
        life: frand(0.5, 0.9),
        size: frand(r * 0.2, r * 0.35) * (dirty ? 1.2 : 1),
        drag: 1.5,
        color: dirty ? FX.boom.dirtySmoke : '#5a5564',
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = frand(0, Math.PI * 2);
      const s = frand(120, 320);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.2, 0.4), size: 2.5, color: dirty ? FX.fox.spark : '#ffd36b', drag: 3 });
    }
    const chunks = style === 'dirt' ? 10 : style === 'carrot' ? 8 : 6;
    const chunk = style === 'dirt' ? FX.boom.dirt : style === 'carrot' ? FX.boom.carrot : '#4a4152';
    for (let i = 0; i < chunks; i++) {
      this.add({ kind: 'chunk', x, y, vx: frand(-160, 160), vy: frand(-320, -160), grav: 900, vr: frand(-15, 15), life: 0.9, size: frand(2, 3.5), color: chunk, ground: ground + frand(-6, 6) });
    }
    if (style === 'clean') this.shock(x, y, r * 1.1, '#fff3c4');
    if (dirty) {
      for (let i = 0; i < 4; i++) this.add({ kind: 'spark', x, y, vx: frand(-140, 140), vy: frand(-260, -120), grav: 400, life: frand(0.5, 0.8), size: 2, color: FX.fox.ember, drag: 0.5 });
      this.pow(x + frand(-8, 8), y - r * 0.6 - 20, 'KABLAM!', true, 26);
    }
    if (style === 'dirt') {
      // a ring of dust rolling out along the road, and a crater
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frand(-0.3, 0.3);
        this.add({ kind: 'dust', x, y: ground - 2, vx: Math.cos(a) * 120, vy: Math.sin(a) * 40, drag: 3, life: 0.6, size: frand(5, 8), layer: 0 });
      }
      this.decal(x, ground, 2, r * 0.5, 4);
    }
    if (style === 'carrot') {
      this.shock(x, y, r * 1.3, EVO.accent.cannon, 0.45);
      for (let i = 0; i < 10; i++) {
        const a = frand(-Math.PI * 0.9, -Math.PI * 0.1);
        const s = frand(160, 360);
        this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 500, drag: 1.5, vr: frand(-12, 12), rot: frand(0, 6), life: frand(0.7, 1.1), size: frand(2.5, 3.5), color: fpick(FX.boom.leaf) });
      }
    }
  }

  /**
   * Knock-out: a splat, a puff, the hat flying off, and the body tumbling away, thrown by how it was knocked out
   * (sliced flies low, bonked flies far and bounces, blasted and fried bodies are charred, bowled ones skid).
   */
  death(x: number, y: number, snap: BodySnap, dir: number, how: KillHow = 'pop') {
    if ((how === 'blast' || how === 'zap') && this.charred >= MAX_CHARRED) how = 'pop';
    const s = snap.scale;
    const boss = snap.kind === 'boss';
    const fly = KILL_FLIGHT[how];
    const body = how === 'blast' || how === 'zap' ? { ...snap, char: true } : snap;
    if (body.char) this.charred++;
    this.add({ kind: 'splat', x, y: y - 22 * s, life: 0.75, size: 26 * s, color: snap.side === 'fox' ? '#2a2233' : '#e4ebff', rot: frand(0, Math.PI * 2) });
    this.puff(x, y, s * 0.7);
    this.add({
      kind: 'debris',
      x: x + 3 * snap.face * s,
      y: y - 46 * s,
      vx: dir * frand(50, 110),
      vy: frand(-290, -210) * (how === 'blast' ? 1.5 : 1),
      grav: 800,
      vr: frand(-10, 10),
      life: 1.2,
      size: s,
      ground: y - 3,
      hat: snap.side === 'rabbit' ? 'helmet' : 'fox',
      level: snap.rLevel,
      face: snap.face,
      snap,
    });
    this.add({
      kind: 'body',
      x,
      y: y - 20 * s,
      vx: dir * frand(70, 140) * (boss ? 0.4 : 1) * fly.vx,
      vy: frand(-230, -160) * fly.vy,
      grav: 760,
      vr: dir * frand(5, 9) * (boss ? 0.5 : 1) * fly.vr,
      life: boss ? 1.3 : 0.8,
      size: s,
      ground: y - 14 * s,
      snap: body,
      bounce: fly.bounce,
      shape: KILLS.indexOf(how),
    });
    if (how === 'slice') this.add({ kind: 'beam', x: x - 16 * s, y: y - 44 * s, x2: x + 16 * s, y2: y - 8 * s, life: 0.14, color: '#ffffff', size: 7 });
    if (how === 'bonk') for (let i = 0; i < 3; i++) this.add({ kind: 'star', x, y, sx: x, sy: y - 50 * s, orbit: 14 * s, stretch: (i * Math.PI * 2) / 3, life: 0.9, size: 5, color: FX.hit.star, vr: 4 });
    if (how === 'zap') for (let i = 0; i < 4; i++) this.add({ kind: 'zap', x: x + frand(-12, 12) * s, y: y - frand(10, 50) * s, size: 12, color: FX.hit.zap, life: frand(0.12, 0.25) });
    if (how === 'bowl') for (let i = 0; i < 3; i++) this.add({ kind: 'dust', x: x + dir * (10 + i * 16), y: y - 2, vx: dir * frand(20, 60), vy: frand(-14, -4), life: 0.5, size: frand(4, 6), layer: 0 });
  }

  /** A white afterimage left behind by a teleport, a dodge or a dash. */
  ghost(x: number, y: number, snap: BodySnap) {
    this.add({ kind: 'ghost', x, y, life: 0.4, size: snap.scale, snap });
  }

  puff(x: number, y: number, scale = 1) {
    for (let i = 0; i < 8; i++) {
      this.add({
        kind: 'puff',
        x: x + frand(-12, 12) * scale,
        y: y - frand(8, 34) * scale,
        vx: frand(-30, 30),
        vy: frand(-40, -5),
        life: frand(0.35, 0.6),
        size: frand(7, 12) * scale,
      });
    }
  }

  dust(x: number, y: number) {
    this.add({ kind: 'dust', x: x + frand(-3, 3), y: y - 2, vx: frand(-12, 12), vy: frand(-14, -4), life: 0.4, size: frand(3, 5), layer: 0 });
  }

  /**
   * A rabbit's foot landing (`left` / right foot): a quick ring on the road, a little cloud of dust kicked back
   * and a paw print that fades.
   */
  step(x: number, y: number, face: number, scale: number, left: boolean) {
    const fy = y + (left ? -3 : 3) * scale;
    this.add({ kind: 'stepRing', x, y: fy, life: 0.3, size: scale, layer: 0 });
    for (let i = 0; i < 3; i++) {
      this.add({ kind: 'dust', x: x + frand(-3, 3), y: fy - 2, vx: -face * frand(25, 65), vy: frand(-26, -8), drag: 2.5, life: frand(0.45, 0.7), size: frand(6, 9) * scale, layer: 0 });
    }
    this.add({ kind: 'paw', x: x + face * 2, y: fy, life: 1.6, size: scale * 1.3, face, layer: 0 });
  }

  fuse(x: number, y: number) {
    this.add({ kind: 'spark', x, y, vx: frand(-60, 60), vy: frand(-90, -20), life: 0.18, size: 1.5, color: '#ffd36b', drag: 3 });
  }

  text(x: number, y: number, s: string, color: string = COLOR.white, size = 20, life = 0.9) {
    this.add({ kind: 'text', x, y, vy: -50, drag: 1.6, text: s, color, size, life });
  }

  burst(x: number, y: number, color: string = COLOR.toast, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + frand(-0.2, 0.2);
      const s = frand(80, 200);
      this.add({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.4, 0.7), size: frand(4, 7), color, drag: 3, vr: frand(-6, 6) });
    }
  }

  confetti(x: number, y: number, n = 60) {
    const cols = ['#ff6b6b', '#ffd84a', '#5ad66c', '#5aa8ff', '#c48bff', '#ff9f43'];
    for (let i = 0; i < n; i++) {
      const a = frand(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = frand(220, 560);
      this.add({
        kind: 'confetti',
        x: x + frand(-50, 50),
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        grav: 520,
        drag: 1.5,
        vr: frand(-12, 12),
        rot: frand(0, 6),
        life: frand(1.3, 2),
        size: frand(3, 5),
        color: fpick(cols),
      });
    }
  }

  /** A puff of smoke left behind by rockets and shells (the bomber's homemade rocket smokes dark and thick). */
  trail(x: number, y: number, color = '#dcd8e2', size = 4) {
    this.add({ kind: 'smoke', x, y, vx: frand(-10, 10), vy: frand(-20, -5), life: 0.45, size, color });
  }

  /** A bill flying from (x, y) to the cash counter. */
  coin(x: number, y: number, tx: number, ty: number) {
    this.add({ kind: 'coin', x, y, sx: x, sy: y, x2: tx, y2: ty, life: frand(0.65, 0.85), rot: frand(-0.5, 0.5), vr: frand(-6, 6) });
  }

  /** A gem flying from (x, y) to the gem counter. */
  gem(x: number, y: number, tx: number, ty: number, delay = 0) {
    this.add({ kind: 'gem', x, y, sx: x, sy: y, x2: tx, y2: ty, life: frand(0.75, 0.95) + delay, rot: 0, vr: frand(-4, 4), stretch: delay });
  }

  /** A medallion shattering: jagged pieces of its colours fly out and fall. */
  shards(x: number, y: number, colors: string[], n = 16) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + frand(-0.25, 0.25);
      const s = frand(220, 560);
      this.add({ kind: 'shard', x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, grav: 1100, drag: 0.6, rot: frand(0, 6), vr: frand(-14, 14), life: frand(0.6, 0.95), size: frand(9, 20), color: colors[i % colors.length] });
    }
  }

  /** A firework shell rising from (x, y); it bursts into falling glitter when its fuse runs out. */
  firework(x: number, y: number, color: string) {
    this.add({ kind: 'fw', x, y, vx: frand(-40, 40), vy: -frand(400, 500), grav: 520, life: frand(0.48, 0.64), size: 3, color });
  }

  private burstFirework(x: number, y: number, color: string) {
    sfx.play('firework', 0, { x });
    this.add({ kind: 'glow', x, y, life: 0.3, size: 90, color });
    this.add({ kind: 'flash', x, y, rot: frand(0, 3), life: 0.1, size: 18, color: '#ffffff', stretch: 1 });
    const n = 36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + frand(-0.1, 0.1);
      const s = frand(160, 280);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 150, drag: 1.6, life: frand(0.7, 1.1), size: 3.2, color: i % 3 ? color : '#ffffff' });
    }
    for (let i = 0; i < 6; i++) this.add({ kind: 'star', x: x + frand(-40, 40), y: y + frand(-40, 40), vy: 30, life: frand(0.4, 0.8), size: frand(3, 5), color: '#fff6d8', vr: frand(-4, 4) });
  }

  update(dt: number) {
    this.powCd = Math.max(0, this.powCd - dt);
    const bursts: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      p.rot += p.vr * dt;
      if (p.kind === 'fw') {
        if (p.life <= 0) bursts.push(p);
        else if (fchance(0.7)) this.add({ kind: 'spark', x: p.x, y: p.y, vx: frand(-20, 20), vy: frand(20, 60), life: 0.25, size: 1.8, color: '#ffe9a8', drag: 2 });
      }
      if (p.kind === 'gem') {
        // waits out its delay (kept in stretch), then flies like a bill
        const fly = p.max - p.stretch;
        const t = 1 - Math.max(0, Math.min(1, p.life / fly));
        const e = t * t * (3 - 2 * t);
        p.x = lerp(p.sx ?? p.x, p.x2 ?? p.x, e);
        p.y = lerp(p.sy ?? p.y, p.y2 ?? p.y, e) - Math.sin(t * Math.PI) * 90;
        continue;
      }
      if (p.kind === 'coin') {
        const t = 1 - Math.max(0, p.life / p.max);
        const e = t * t * (3 - 2 * t);
        p.x = lerp(p.sx ?? p.x, p.x2 ?? p.x, e);
        p.y = lerp(p.sy ?? p.y, p.y2 ?? p.y, e) - Math.sin(t * Math.PI) * 80;
        continue;
      }
      if (p.orbit) {
        // dizzy stars circling where a unit was bonked out
        p.stretch += dt * 9;
        p.x = (p.sx ?? p.x) + Math.cos(p.stretch) * p.orbit;
        p.y = (p.sy ?? p.y) + Math.sin(p.stretch) * p.orbit * 0.35;
        continue;
      }
      if (p.kind === 'body' && p.snap?.char && fchance(0.3)) this.opt({ kind: 'smoke', x: p.x + frand(-4, 4), y: p.y - 6, vx: frand(-8, 8), vy: -24, life: 0.4, size: 4, color: FX.hit.charSmoke, drag: 1 });
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ground !== undefined && p.y > p.ground && p.vy > 0) {
        p.y = p.ground;
        p.vy *= -(p.bounce ?? 0.32);
        p.vx *= 0.5;
        p.vr *= 0.4;
      }
    }
    // keep the living ones in order (drawing order matters), counting the capped kinds on the way
    let n = 0;
    let pows = 0;
    let decals = 0;
    let charred = 0;
    for (const p of this.list) {
      if (p.life <= 0) continue;
      this.list[n++] = p;
      if (p.kind === 'pow') pows++;
      else if (p.kind === 'decal') decals++;
      else if (p.kind === 'body' && p.snap?.char) charred++;
    }
    this.list.length = n;
    this.pows = pows;
    this.decals = decals;
    this.charred = charred;
    for (const p of bursts) this.burstFirework(p.x, p.y, p.color);
  }

  draw(ctx: Ctx, layer: 0 | 1 = 1) {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const a = Math.max(0, p.life / p.max);
      const u = 1 - a;
      ctx.save();
      switch (p.kind) {
        case 'spark':
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        case 'flash':
          drawFlash(ctx, p);
          break;
        case 'glow': {
          if (typeof document === 'undefined') break;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.75;
          ctx.drawImage(glowSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        }
        case 'smoke':
          ctx.globalAlpha = a * 0.55;
          circle(ctx, p.x, p.y, p.size * (1 + u * 1.2));
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        case 'fire':
          ctx.globalAlpha = a;
          circle(ctx, p.x, p.y, p.size * (0.5 + u * 0.8));
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = a;
          circle(ctx, p.x, p.y, p.size * (0.25 + u * 0.9));
          ctx.strokeStyle = '#fff3c4';
          ctx.lineWidth = 5 * a + 0.5;
          ctx.stroke();
          break;
        case 'puff':
          ctx.globalAlpha = a;
          circle(ctx, p.x, p.y, p.size * (0.7 + u * 0.8));
          ctx.fillStyle = '#f4f1f7';
          ctx.fill();
          break;
        case 'dust':
          ctx.globalAlpha = a * 0.5;
          circle(ctx, p.x, p.y, p.size * (0.6 + u * 0.9));
          ctx.fillStyle = '#d9cdbf';
          ctx.fill();
          break;
        case 'paw': {
          // pad and three toes, squashed flat onto the road, pointing the way the rabbit walks
          ctx.globalAlpha = Math.min(1, a * 1.6) * 0.42;
          ctx.translate(p.x, p.y);
          ctx.scale(p.face * p.size, p.size * 0.6);
          ctx.fillStyle = '#3a3040';
          ellipse(ctx, 0, 0, 4.2, 3.4);
          ctx.fill();
          for (const [tx, ty] of [
            [5, -3.6],
            [6.2, 0],
            [5, 3.6],
          ]) {
            circle(ctx, tx, ty, 1.7);
            ctx.fill();
          }
          break;
        }
        case 'stepRing':
          ctx.globalAlpha = a * 0.7;
          ellipse(ctx, p.x, p.y, p.size * (4 + u * 11), p.size * (1.5 + u * 4));
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'scorch':
          ctx.globalAlpha = Math.min(1, a * 2) * 0.3;
          ellipse(ctx, p.x, p.y, p.size, p.size * 0.32);
          ctx.fillStyle = '#231a28';
          ctx.fill();
          break;
        case 'decal':
          drawDecal(ctx, p, a);
          break;
        case 'casing': {
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const w = p.sx ?? 5;
          const h = p.sy ?? 2.4;
          if (p.shape === 1) {
            // a grenade pin: a little ring
            circle(ctx, 0, 0, w);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(-w / 2, -h / 2, w, h);
          }
          break;
        }
        case 'chunk':
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
          break;
        case 'beam':
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * a;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x2 ?? p.x, p.y2 ?? p.y);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = p.size * 0.35 * a;
          ctx.stroke();
          break;
        case 'shock':
          ctx.globalAlpha = a;
          circle(ctx, p.x, p.y, p.size * (0.2 + u * 0.95));
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 6 * a + 1;
          ctx.stroke();
          break;
        case 'text': {
          // numbers pop in big, then settle and float up
          const age = p.max - p.life;
          const pop = 1 + 0.55 * Math.max(0, 1 - age / 0.12);
          ctx.globalAlpha = Math.min(1, a * 2.5);
          label(ctx, p.text ?? '', p.x, p.y, p.size * pop, { color: p.color });
          break;
        }
        case 'pow':
          drawPow(ctx, p);
          break;
        case 'impact': {
          // an opaque comic hit star: pops out, then shrinks away
          const k = p.size * (u < 0.3 ? 0.6 + (u / 0.3) * 0.6 : 1.2 - (u - 0.3) * 0.6);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(p.stretch, 1);
          starPath(ctx, 0, 0, k, k * 0.45, p.shape ?? 8);
          fillStroke(ctx, p.color, 2 / Math.max(1, p.stretch * 0.8), p.face < 0 ? FX.fox.slashEdge : COLOR.ink);
          break;
        }
        case 'fluff': {
          const s = p.size;
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.arc(0, 0, s, 0, Math.PI * 2);
          ctx.moveTo(0.9 * s + 0.75 * s, -0.3 * s);
          ctx.arc(0.9 * s, -0.3 * s, 0.75 * s, 0, Math.PI * 2);
          ctx.moveTo(-0.6 * s + 0.65 * s, 0.5 * s);
          ctx.arc(-0.6 * s, 0.5 * s, 0.65 * s, 0, Math.PI * 2);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = 'rgba(42, 34, 51, 0.55)';
          ctx.stroke();
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        }
        case 'zap': {
          // a jagged bolt across the spot, new every frame so it flickers: green edge, white-hot core
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          const ang = frand(0, Math.PI * 2);
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          for (let i = 0; i <= 4; i++) {
            const along = (i / 4 - 0.5) * 2 * p.size;
            const off = i === 0 || i === 4 ? 0 : frand(-0.4, 0.4) * p.size;
            const x = p.x + ca * along - sa * off;
            const y = p.y + sa * along + ca * off;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3.2;
          ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          break;
        }
        case 'confetti':
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.sin(p.rot * 1.7)) * 0.8 + 0.2);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
          break;
        case 'debris':
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(p.size * p.face, p.size);
          if (p.hat === 'helmet') drawHelmet(ctx, p.level ?? 1);
          else if (p.hat && p.snap) drawFoxHat(ctx, p.snap.style as FoxStyle);
          break;
        case 'ghost': {
          const s = p.snap;
          if (!s) break;
          ctx.globalAlpha = a * 0.55;
          ctx.translate(p.x, p.y - u * 6);
          ctx.scale(s.scale, s.scale);
          const look: Look = { face: s.face, walk: 0, moving: false, aim: 0, aimAngle: 0, atk: 0, flash: true, blink: false, hop: 0, weapon: s.weapon, level: s.level, noShadow: true };
          if (s.side === 'rabbit') drawRabbit(ctx, { ...look, style: s.style as RabbitStyle, rLevel: s.rLevel });
          else drawFox(ctx, { ...look, style: s.style as FoxStyle });
          break;
        }
        case 'body': {
          const s = p.snap;
          if (!s) break;
          // fried bodies flicker between charred and white-hot
          const fried = p.shape === KILLS.indexOf('zap');
          const char = !!s.char && (!fried || (Math.floor(p.life * 20) & 1) === 1);
          ctx.globalAlpha = Math.min(1, a * 2.5);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const k = s.scale * (0.75 + 0.25 * Math.min(1, a * 2));
          ctx.scale(k, k);
          ctx.translate(0, 20);
          const look: Look = {
            face: s.face,
            walk: 0,
            moving: false,
            aim: 0,
            aimAngle: 0,
            atk: 0,
            flash: s.char ? !char : u < 0.1,
            blink: false,
            hop: 0,
            weapon: s.weapon,
            level: s.level,
            noShadow: true,
            hatless: true,
            ko: !s.char, // a charred body keeps its wide white eyes
            char,
          };
          if (s.side === 'rabbit') drawRabbit(ctx, { ...look, style: s.style as RabbitStyle, rLevel: s.rLevel });
          else drawFox(ctx, { ...look, style: s.style as FoxStyle });
          break;
        }
        case 'slash':
          drawSlash(ctx, p, a, u);
          break;
        case 'star':
          ctx.globalAlpha = a;
          starPath(ctx, p.x, p.y, p.size, p.size * 0.4, 4, p.rot);
          ctx.fillStyle = p.color;
          ctx.fill();
          if (p.orbit) {
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = COLOR.ink;
            ctx.stroke();
          }
          break;
        case 'coin':
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawCash(ctx, 0, 0, 0.45);
          break;
        case 'gem':
          if (p.max - p.life < p.stretch) break; // still waiting out its delay
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.2);
          drawGem(ctx, 0, 0, 0.6);
          break;
        case 'shard':
          ctx.globalAlpha = Math.min(1, a * 2.5);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(-p.size, p.size * 0.55);
          ctx.lineTo(p.size * 0.9, p.size * 0.45);
          ctx.lineTo(p.size * 0.1, -p.size);
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = COLOR.ink;
          ctx.stroke();
          break;
        case 'fw':
          ctx.globalCompositeOperation = 'lighter';
          circle(ctx, p.x, p.y, 7);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.globalAlpha = 1;
          circle(ctx, p.x, p.y, p.size);
          ctx.fillStyle = '#fff6d8';
          ctx.fill();
          break;
        case 'splat': {
          // ink splash: pops out fast, then fades
          const s = p.size * (0.45 + 0.55 * Math.min(1, u / 0.08));
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          circle(ctx, 0, 0, s * 0.52);
          ctx.fill();
          for (let i = 0; i < 7; i++) {
            const ang = i * 0.9 + (i % 2) * 0.3;
            const dist = s * (i % 2 ? 0.6 : 0.48);
            circle(ctx, Math.cos(ang) * dist, Math.sin(ang) * dist * 0.85, s * (i % 3 === 0 ? 0.3 : 0.22));
            ctx.fill();
          }
          for (let i = 0; i < 6; i++) {
            const ang = i * 1.1 + 0.4;
            const dist = s * (0.95 + (i % 3) * 0.16);
            circle(ctx, Math.cos(ang) * dist, Math.sin(ang) * dist * 0.85, s * 0.09);
            ctx.fill();
          }
          break;
        }
      }
      ctx.restore();
    }
  }
}

/**
 * Muzzle and impact flashes (additive), one silhouette per gun: 0 cross, 1 fork, 2 spear with brake vents,
 * 3 lens ring, 4 puff, 5 flower, 7 slab; anything else the plain 6-point star. Then a hot core.
 */
function drawFlash(ctx: Ctx, p: Particle) {
  const s = p.size;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  let core = true;
  switch (p.shape) {
    case 0:
      ctx.scale(p.stretch, 1);
      starPath(ctx, s * 0.4, 0, s, s * 0.22, 4);
      ctx.fill();
      break;
    case 1:
      ctx.scale(p.stretch * 0.8, 1);
      poly(ctx, [0, -0.25 * s, 1.7 * s, 0, 0, 0.25 * s]);
      ctx.fill();
      poly(ctx, [0, -0.15 * s, 0.8 * s, -0.6 * s, 0.2 * s, 0]);
      ctx.fill();
      poly(ctx, [0, 0.15 * s, 0.8 * s, 0.6 * s, 0.2 * s, 0]);
      ctx.fill();
      break;
    case 2:
      poly(ctx, [0, -0.3 * s, 2.8 * s, 0, 0, 0.3 * s]);
      ctx.fill();
      for (const k of [-1, 1]) {
        poly(ctx, [0.3 * s, k * 0.15 * s, 0.6 * s, k * 0.9 * s, 0.9 * s, k * 0.15 * s]);
        ctx.fill();
      }
      break;
    case 3:
      ctx.strokeStyle = p.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      circle(ctx, 0.3 * s, 0, 0.6 * s);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-0.5 * s, 0);
      ctx.lineTo(1.6 * s, 0);
      ctx.moveTo(0.3 * s, -0.9 * s);
      ctx.lineTo(0.3 * s, 0.9 * s);
      ctx.stroke();
      break;
    case 4:
      ctx.scale(p.stretch, 1);
      circle(ctx, 0.5 * s, 0, 0.7 * s);
      ctx.fill();
      break;
    case 5:
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const cx = 0.5 * s + Math.cos(a) * 0.6 * s;
        const cy = Math.sin(a) * 0.6 * s;
        ctx.moveTo(cx + 0.38 * s, cy);
        ctx.arc(cx, cy, 0.38 * s, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    case 7:
      rr(ctx, -2.5, -s, 5, 2 * s, 2.5);
      ctx.fill();
      rr(ctx, -1, -s * 0.8, 2, 1.6 * s, 1);
      ctx.fillStyle = p.color2 ?? '#fffbe0';
      ctx.fill();
      core = false;
      break;
    default:
      ctx.scale(p.stretch, 1);
      starPath(ctx, s * 0.45, 0, s, s * 0.35, 6);
      ctx.fill();
  }
  if (!core) return;
  circle(ctx, 0.3 * s, 0, (p.shape === 3 ? 0.3 : 0.42) * s);
  ctx.fillStyle = p.color2 ?? '#fffbe0';
  ctx.fill();
}

/** Slash marks sweep in fast along their arc, then fade. stretch is an alpha multiplier (whiffs are faint). */
function drawSlash(ctx: Ctx, p: Particle, a: number, u: number) {
  const sweep = Math.min(1, u / 0.22);
  ctx.globalAlpha = a * p.stretch;
  ctx.translate(p.x, p.y);
  ctx.scale(p.face, p.alt ? -1 : 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arc = (cx: number, r: number, a0: number, a1: number, color: string, w: number) => {
    ctx.beginPath();
    ctx.arc(cx, 0, r, a0, lerp(a0, a1, sweep));
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  switch (p.shape) {
    case 1:
      // a thin knife arc with a white-hot edge
      arc(-6, p.size, -1.2, 0.9, p.color, 3.5 * a + 0.5);
      arc(-6, p.size, -1.2, 0.9, '#ffffff', 1.2);
      break;
    case 2: {
      // a fox's jagged slash: a zigzag along the arc, dark-red edge, red core
      const pts: number[] = [];
      const n = 6;
      const end = Math.max(1, Math.round(n * sweep));
      for (let i = 0; i <= end; i++) {
        const t = -1.1 + (2.1 * i) / n;
        const r = p.size + (hash(i * 7.3) - 0.5) * 5;
        pts.push(-6 + Math.cos(t) * r, Math.sin(t) * r);
      }
      for (const [color, w] of [
        [FX.fox.slashEdge, 5],
        [FX.fox.slash, 3],
      ] as [string, number][]) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = w * (0.5 + 0.5 * a);
        ctx.stroke();
      }
      break;
    }
    case 3:
      // an X cross (crits): two flat cuts through the hit point, at plus and minus 45 degrees
      for (const r of [-0.8, 0.8]) {
        ctx.save();
        ctx.rotate(r + Math.PI / 2);
        const R = p.size * 1.6;
        arc(-R, R, -0.48, 0.48, p.color, 3 * a + 0.8);
        arc(-R, R, -0.48, 0.48, '#ffffff', 1.2);
        ctx.restore();
      }
      break;
    case 5:
      // the ninja's shadow crescent: dark, with a violet core
      arc(-8, p.size, -1.3, 1.1, FX.kind.ninjaEdge, 7 * a + 1);
      arc(-8, p.size, -1.3, 1.1, FX.kind.ninjaCore, 2.5);
      break;
    case 6:
      // the gunblade's double arc
      arc(-8, 24, -1.3, 1.1, p.color, 5 * a + 1);
      arc(-8, 24, -1.3, 1.1, '#ffffff', 1.8);
      arc(-8, 18, -1.1, 0.9, p.color, 3 * a + 0.6);
      break;
    default:
      arc(-6, p.size, -1.3, 1.0, p.color, 5 * a + 1);
      arc(-6, p.size, -1.3, 1.0, '#ffffff', 2 * a);
  }
}

/** Road marks: a scuff, a crack, a crater; they fade over their last third. */
function drawDecal(ctx: Ctx, p: Particle, a: number) {
  const s = p.size;
  ctx.globalAlpha = Math.min(1, a * 3) * 0.45;
  ctx.translate(p.x, p.y);
  switch (p.shape) {
    case 1: {
      ctx.strokeStyle = FX.hit.decal;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = hash(p.rot * 100 + i) * Math.PI * 2;
        const len = s * (0.6 + 0.4 * hash(p.rot * 50 + i));
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang + 0.3) * len * 0.5, Math.sin(ang + 0.3) * len * 0.5 * 0.4);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len * 0.4);
      }
      ctx.stroke();
      break;
    }
    case 2:
      ellipse(ctx, 0, 0, s, s * 0.35);
      ctx.fillStyle = FX.hit.decal;
      ctx.fill();
      ellipse(ctx, 0, -s * 0.04, s * 0.72, s * 0.22);
      ctx.strokeStyle = FX.hit.decalLight;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    default:
      ellipse(ctx, 0, 0, s, s * 0.35);
      ctx.fillStyle = FX.hit.decal;
      ctx.fill();
      ctx.fillStyle = FX.hit.decalLight;
      ctx.fillRect(-s * 0.5, -1, 1.6, 1.2);
      ctx.fillRect(s * 0.3, 0.5, 1.4, 1.1);
  }
}

/** A comic word: an 11-point starburst (stretched to fit the word) that pops in, then floats and fades. */
function drawPow(ctx: Ctx, p: Particle) {
  const age = p.max - p.life;
  const s = age < 0.1 ? easeOutBack(age / 0.1) : 1;
  const fox = p.face < 0;
  const text = p.text ?? '';
  const font = p.size * 0.62;
  const wide = Math.max(1, (text.length * font * 0.5) / (p.size * 1.55));
  ctx.globalAlpha = Math.min(1, p.life / 0.15);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
  ctx.save();
  ctx.scale(wide, 1);
  starPath(ctx, 0, 0, p.size, p.size * 0.62, 11);
  fillStroke(ctx, p.color, 3, fox ? FX.fox.wordLine : COLOR.ink);
  starPath(ctx, 0, 0, p.size * 0.72, p.size * 0.46, 11);
  ctx.fillStyle = fox ? FX.fox.wordStar : '#ffffff';
  ctx.fill();
  ctx.restore();
  label(ctx, text, 0, 1, font, { color: fox ? FX.fox.wordText : FX.rabbit.wordText, outline: fox ? FX.fox.wordLine : COLOR.ink, lw: 4 });
}
