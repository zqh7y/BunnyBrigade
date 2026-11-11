import { TRAVEL, type Battle } from '../battle';
import { STREETS, streetOf } from '../data';
import { COLOR, H, L, W } from '../theme';
import { circle, clamp, ellipse, line, pick, poly, rand, rr, type Ctx } from '../util';
import { blobs, cloud, drawFront, drawSky } from './scene';
import {
  drawBalloon,
  drawButterflies,
  drawCat,
  drawFireflies,
  drawGrass,
  drawKite,
  drawMotes,
  drawNeon,
  drawSteam,
  drawTwinkles,
  drawWatcher,
  drawWindmill,
  seatWatcher,
  updateWatcher,
  windowWatcher,
  type Watcher,
} from './streetLife';

/*
 * The living street: the static backdrop comes from two cached layers per street (scene.ts), and everything
 * that moves is drawn on top every frame. Trees and bushes sway in the wind and whip away from explosions,
 * leaves blow off them and settle on the road, birds sit on the roofs and scatter at blasts, chimneys smoke,
 * and each street has one thing of its own (a flag, a fountain, string lights).
 */

const G = L.sidewalkTop;

type TreeKind = 'round' | 'maple' | 'pine';

interface Tree {
  x: number;
  s: number;
  kind: TreeKind;
  pot?: boolean;
  ang: number; // current lean (radians)
  vel: number;
  phase: number;
}

interface Bush {
  x0: number;
  x1: number;
  wob: number;
  vel: number;
}

interface Bird {
  px: number; // perch
  py: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'sit' | 'fly' | 'away' | 'back';
  t: number;
  face: number;
  flap: number;
  peck: number;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  land: number; // y where it settles on the road
  life: number;
  color: string;
  s: number;
  seed: number;
}

interface Cloud {
  x: number;
  y: number;
  s: number;
}

interface Lights {
  x0: number;
  x1: number;
  y: number;
  off: number;
  vel: number;
}

interface Look {
  trees: Tree[];
  bushes: Bush[];
  birds: Bird[];
  clouds: Cloud[];
  cloudFill: [string, string];
  smoke: [number, number][];
  flag?: [number, number];
  spray?: [number, number];
  lights?: Lights;
  birdColor: string;
  // street life (streetLife.ts)
  watchers: Watcher[];
  cheer: boolean; // the townsfolk are cheering (a wave or the stage was just cleared)
  grass: [string, string]; // blade, flower
  windmill?: [number, number];
  balloon?: boolean;
  kite?: boolean;
  twinkles?: boolean;
  butterflies?: [number, number][];
  motes?: string;
  fireflies?: boolean;
  neon?: [number, number, number, number];
  cat?: [number, number];
  steam?: [number, number];
}

const tree = (x: number, s: number, kind: TreeKind, pot = false): Tree => ({ x, s, kind, pot, ang: 0, vel: 0, phase: rand(0, 6) });
const bush = (x0: number, x1: number): Bush => ({ x0, x1, wob: 0, vel: 0 });
const birds = (perches: [number, number][]): Bird[] =>
  perches.map(([px, py]) => ({ px, py, x: px, y: py, vx: 0, vy: 0, state: 'sit', t: rand(0.5, 3), face: Math.random() < 0.5 ? -1 : 1, flap: 0, peck: 0 }));

function makeLooks(): Look[] {
  return [
    {
      trees: [tree(162, 0.9, 'round'), tree(440, 1.05, 'round'), tree(526, 0.95, 'round')],
      bushes: [bush(150, 178), bush(284, 306), bush(412, 548)],
      birds: birds([
        [44, 172],
        [70, 172],
        [118, 172],
        [233, 174],
        [332, 142],
        [384, 142],
      ]),
      clouds: [
        { x: 60, y: 160, s: 1 },
        { x: 300, y: 140, s: 1.2 },
        { x: 470, y: 196, s: 0.7 },
      ],
      cloudFill: ['#fbfcfb', 'rgba(185, 208, 222, 0.6)'],
      smoke: [[261, 176]],
      flag: [496, 160],
      birdColor: '#5f5a6c',
      watchers: [windowWatcher(190, 246, 30, 28), windowWatcher(320, 174, 26, 32), windowWatcher(370, 228, 26, 32), windowWatcher(20, 262, 76, 50)],
      cheer: false,
      grass: ['#8fae7c', '#f0c86e'],
      windmill: [188, 196],
      balloon: true,
      motes: '#fff6d8',
      steam: [392, L.roadTop + 36],
    },
    {
      trees: [tree(36, 1.15, 'maple'), tree(372, 1, 'maple'), tree(494, 1.1, 'round'), tree(532, 0.85, 'pine')],
      bushes: [bush(150, 172), bush(204, 222), bush(318, 346)],
      birds: birds([
        [270, 196],
        [72, 293],
        [204, 293],
        [410, 313],
        [452, 313],
      ]),
      clouds: [
        { x: 80, y: 120, s: 0.9 },
        { x: 270, y: 90, s: 1.1 },
        { x: 440, y: 150, s: 0.8 },
      ],
      cloudFill: ['#fdf8f0', 'rgba(220, 200, 180, 0.55)'],
      smoke: [],
      spray: [430, G - 42],
      birdColor: '#5f5a6c',
      watchers: [seatWatcher(106, 304), seatWatcher(134, 304), seatWatcher(262, 306)],
      cheer: false,
      grass: ['#93b37a', '#e48d9b'],
      kite: true,
      butterflies: [
        [42, 300],
        [362, 302],
        [210, 312],
      ],
      motes: '#fff3c8',
    },
    {
      trees: [tree(64, 0.8, 'round', true), tree(476, 0.85, 'round', true)],
      bushes: [],
      birds: birds([
        [30, 122],
        [72, 122],
        [130, 86],
        [190, 86],
        [362, 108],
        [404, 108],
        [462, 132],
        [524, 132],
      ]),
      clouds: [
        { x: 90, y: 70, s: 1 },
        { x: 330, y: 112, s: 0.8 },
        { x: 470, y: 56, s: 1.1 },
      ],
      cloudFill: ['#f8d6cb', 'rgba(180, 130, 170, 0.5)'],
      smoke: [
        [167, 58],
        [501, 104],
      ],
      lights: { x0: 124, x1: 416, y: 206, off: 0, vel: 0 },
      birdColor: '#6a6478',
      watchers: [windowWatcher(157.3, 108, 24, 30), windowWatcher(114.7, 156, 24, 30), windowWatcher(347.3, 130, 24, 30), windowWatcher(495.3, 154, 24, 30), windowWatcher(210, 274, 70, 44)],
      cheer: false,
      grass: ['#7f9a7c', '#ffd98a'],
      twinkles: true,
      fireflies: true,
      neon: [226, 216, 78, 22],
      cat: [383, 100],
      steam: [150, L.roadTop + 36],
    },
  ];
}

const LEAF_COLORS: Record<TreeKind, string[]> = {
  round: ['#97b686', '#b5cf8f', '#d9c56b'],
  maple: ['#e0a15a', '#d9824a', '#f0c86e', '#c9664a'],
  pine: ['#7fa07a', '#97b686'],
};
const BULBS = ['#ffd98a', '#ff9f8a', '#9fe0ff', '#c8ffa0'];

function layer(ratio: number, paint: (c: Ctx) => void) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W * ratio));
  c.height = Math.max(1, Math.round(L.sceneBottom * ratio));
  const k = c.getContext('2d')!;
  k.setTransform(ratio, 0, 0, ratio, 0, 0);
  paint(k);
  return c;
}

/** Top of a tree's trunk and its crown centre, after its current lean. */
function crownOf(t: Tree) {
  const h = 30 * t.s;
  const base = t.pot ? -12 * t.s : 0;
  const tipX = Math.sin(t.ang) * h * 0.7;
  return { x: t.x + tipX, y: G + base - h - 16 * t.s };
}

export class Street {
  private sky: HTMLCanvasElement[] = [];
  private front: HTMLCanvasElement[] = [];
  private looks = makeLooks();
  private leaves: Leaf[] = [];
  time = 0;
  wind = 0.4;
  windDir = 1;
  private gust = 0;
  private gustT = 9;
  private leafT = 1;
  private lastOff = 0;
  private scrollV = 0;
  /** How far the clouds have drifted (accumulated, so a change of wind changes their speed, not their place). */
  private cloudX = 0;

  /** (Re)paints the cached layers at the canvas resolution. */
  build(ratio: number) {
    for (let v = 0; v < STREETS.length; v++) {
      this.sky[v] = layer(ratio, (c) => drawSky(c, v));
      this.front[v] = layer(ratio, (c) => drawFront(c, v));
    }
  }

  update(dt: number, b: Battle) {
    this.time += dt;
    const cur = streetOf(b.stage);
    const travel = b.phase === 'travel';
    const off = travel ? b.travelOffset : 0;
    this.scrollV = dt > 0 && off >= this.lastOff ? (off - this.lastOff) / dt : 0;
    this.lastOff = off;

    // wind: slow swells, the odd gust, and a hard headwind while running to the next street
    // only a street that is really scrolling makes a headwind (scrollV is 0 while paused)
    const fast = travel && this.scrollV > 0 ? b.travelSpeed : 0;
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = rand(7, 14);
      this.gust = rand(0.5, 0.9);
      if (!travel) for (let i = 0; i < 5; i++) this.ambientLeaf(cur);
    }
    this.gust *= Math.exp(-dt * 0.7);
    const swell = 0.35 + 0.2 * Math.sin(this.time * 0.11) + 0.12 * Math.sin(this.time * 0.37 + 1);
    const target = travel ? swell + 1.3 * fast : swell + this.gust;
    this.wind += (target - this.wind) * Math.min(1, dt * 2);
    // the wind turns round smoothly, so flags, smoke and spray swing over instead of jumping
    const dirTarget = fast > 0.15 ? -1 : 1;
    this.windDir += (dirTarget - this.windDir) * Math.min(1, dt * 3);
    this.cloudX += dt * (5 + 8 * this.wind);

    for (const bl of b.blasts) this.blast(cur, bl.x, bl.y, bl.r);
    b.blasts.length = 0;

    for (const look of this.looks) {
      for (const t of look.trees) {
        const sway = this.windDir * this.wind * 0.06 + Math.sin(this.time * 1.7 + t.phase) * 0.022 * (0.4 + this.wind) + Math.sin(this.time * 4.3 + t.phase * 2) * 0.006 * this.wind;
        t.vel += ((sway - t.ang) * 30 - t.vel * 4.5) * dt;
        t.ang = clamp(t.ang + t.vel * dt, -0.5, 0.5);
      }
      for (const s of look.bushes) {
        s.vel += (-s.wob * 40 - s.vel * 5) * dt;
        s.wob = clamp(s.wob + s.vel * dt, -1.2, 1.2);
      }
      if (look.lights) {
        const l = look.lights;
        l.vel += (-l.off * 25 - l.vel * 2.5) * dt;
        l.off = clamp(l.off + l.vel * dt, -20, 30);
      }
      for (const bd of look.birds) this.updateBird(bd, dt);
    }
    this.looks.forEach((look, v) => {
      look.cheer = v === cur && (b.phase === 'cleared' || b.phase === 'victory');
      for (const wt of look.watchers) updateWatcher(wt, dt, look.cheer, b.phase === 'fight');
    });

    // leaves
    this.leafT -= dt * (0.4 + this.wind) * (travel ? 8 : 1);
    if (this.leafT <= 0) {
      this.leafT = rand(0.6, 1.4);
      if (fast > 0.2) this.streamLeaf();
      else if (!travel) this.ambientLeaf(cur); // while travelling the trees on screen belong to other streets
    }
    for (const f of this.leaves) {
      if (f.y < f.land) {
        f.vx += (this.windDir * this.wind * 50 - f.vx) * dt * 1.2;
        f.vy += (34 - f.vy) * dt * 2;
        f.x += f.vx * dt + Math.sin(this.time * 3 + f.seed) * 18 * dt - this.scrollV * 0.5 * dt;
        f.y = Math.min(f.land, f.y + f.vy * dt);
        f.rot += f.vr * dt;
      } else {
        // settled on the road: rides along with the ground while travelling, then fades
        f.x -= this.scrollV * dt;
        f.life -= dt * 0.3;
      }
    }
    this.leaves = this.leaves.filter((f) => f.life > 0 && f.x > -60 && f.x < W + 60);
  }

  private updateBird(bd: Bird, dt: number) {
    switch (bd.state) {
      case 'sit':
        bd.x = bd.px;
        bd.y = bd.py;
        bd.peck = Math.max(0, bd.peck - dt);
        bd.t -= dt;
        if (bd.t <= 0) {
          bd.t = rand(1.5, 4);
          if (Math.random() < 0.5) bd.face *= -1;
          else bd.peck = 0.5;
        }
        break;
      case 'fly':
        bd.vy -= 60 * dt;
        bd.x += bd.vx * dt;
        bd.y += bd.vy * dt;
        bd.flap += dt * 28;
        if (bd.y < -30 || bd.x < -40 || bd.x > W + 40) {
          bd.state = 'away';
          bd.t = rand(5, 11);
        }
        break;
      case 'away':
        bd.t -= dt;
        if (bd.t <= 0) {
          bd.state = 'back';
          bd.x = Math.random() < 0.5 ? -30 : W + 30;
          bd.y = rand(30, 120);
        }
        break;
      case 'back': {
        const dx = bd.px - bd.x;
        const dy = bd.py - bd.y;
        const d = Math.hypot(dx, dy);
        bd.flap += dt * 22;
        if (d < 4) {
          bd.state = 'sit';
          bd.t = rand(1, 3);
        } else {
          const step = Math.min(d, 150 * dt);
          bd.x += (dx / d) * step;
          bd.y += (dy / d) * step;
          bd.face = dx >= 0 ? 1 : -1;
        }
        break;
      }
    }
  }

  /** An explosion on the road: nearby trees whip away from it and shed leaves, bushes shake, birds scatter. */
  private blast(v: number, x: number, y: number, r: number) {
    const look = this.looks[v];
    const power = clamp(r / 60, 0.3, 2);
    for (const t of look.trees) {
      const dx = t.x - x;
      const f = 1 - Math.hypot(dx, (G - y) * 0.6) / 420;
      if (f <= 0) continue;
      const dir = Math.sign(dx) || 1;
      t.vel += dir * f * power * 1.6;
      if (f > 0.35) {
        const c = crownOf(t);
        for (let i = 0; i < Math.round(f * power * 5); i++) {
          this.spawnLeaf(c.x + rand(-12, 12) * t.s, c.y + rand(-10, 10) * t.s, dir * rand(80, 220) * f, -rand(80, 180) * f, pick(LEAF_COLORS[t.kind]));
        }
      }
    }
    for (const s of look.bushes) {
      const mid = (s.x0 + s.x1) / 2;
      const f = 1 - Math.hypot(mid - x, (G - y) * 0.6) / 380;
      if (f > 0) s.vel += (Math.sign(mid - x) || 1) * f * power * 2.5;
    }
    if (look.lights) look.lights.vel += power * 18 * Math.max(0, 1 - Math.abs((look.lights.x0 + look.lights.x1) / 2 - x) / 500);
    for (const bd of look.birds) {
      if (bd.state !== 'sit' && bd.state !== 'back') continue;
      if (Math.hypot(bd.x - x, bd.y - y) > 260 + 120 * power) continue;
      bd.state = 'fly';
      bd.vx = (Math.sign(bd.x - x) || 1) * rand(120, 220);
      bd.vy = -rand(120, 200);
      bd.face = Math.sign(bd.vx);
      bd.flap = rand(0, 6);
    }
  }

  private spawnLeaf(x: number, y: number, vx: number, vy: number, color: string) {
    if (this.leaves.length > 90) return;
    this.leaves.push({ x, y, vx, vy, rot: rand(0, 6), vr: rand(-6, 6), land: rand(G + 8, L.roadBottom - 4), life: 1, color, s: rand(0.8, 1.3), seed: rand(0, 6) });
  }

  private ambientLeaf(v: number) {
    const trees = this.looks[v].trees;
    if (!trees.length) return;
    const t = pick(trees);
    const c = crownOf(t);
    this.spawnLeaf(c.x + rand(-14, 14) * t.s, c.y + rand(-8, 10) * t.s, this.windDir * this.wind * 40, rand(-10, 10), pick(LEAF_COLORS[t.kind]));
  }

  /** Leaves whipping past while the rabbits sprint to the next street. */
  private streamLeaf() {
    this.spawnLeaf(W + 20, rand(150, L.roadBottom - 20), -rand(500, 900), rand(-20, 30), pick([...LEAF_COLORS.round, ...LEAF_COLORS.maple]));
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx: Ctx, b: Battle) {
    const cur = streetOf(b.stage);
    if (b.phase === 'travel') {
      // TRAVEL.screens streets fly past (this one, the others in turn, and the next one last), motion-blurred:
      // a few copies trailing behind, averaged (copy k drawn at alpha 1/(k+1))
      const n = STREETS.length;
      const off = b.travelOffset;
      const copies = this.scrollV > 700 ? 4 : this.scrollV > 150 ? 2 : 1;
      const step = Math.min(34, (this.scrollV / 60 / copies) * 1.7);
      for (let k = 0; k < copies; k++) {
        ctx.save();
        ctx.globalAlpha = 1 / (k + 1);
        for (let i = 0; i <= TRAVEL.screens; i++) {
          const x0 = i * W - off + k * step;
          if (x0 > -W && x0 < W) this.drawScreen(ctx, (cur + i) % n, x0, k === 0);
        }
        ctx.restore();
      }
    } else this.drawScreen(ctx, cur, 0);
    this.drawLeaves(ctx);
    ctx.fillStyle = COLOR.ground;
    ctx.fillRect(0, L.sceneBottom, W, H - L.sceneBottom);
    const g = ctx.createLinearGradient(0, L.sceneBottom, 0, L.sceneBottom + 26);
    g.addColorStop(0, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.sceneBottom, W, 26);
  }

  /** full = false: only the two cached layers (the trailing motion-blur copies while travelling). */
  private drawScreen(ctx: Ctx, v: number, x0: number, full = true) {
    const look = this.looks[v];
    ctx.save();
    ctx.translate(x0, 0);
    if (x0 !== 0) {
      ctx.beginPath();
      ctx.rect(0, 0, W, L.sceneBottom);
      ctx.clip();
    }
    if (!full) {
      if (this.sky[v]) ctx.drawImage(this.sky[v], 0, 0, W, L.sceneBottom);
      if (this.front[v]) ctx.drawImage(this.front[v], 0, 0, W, L.sceneBottom);
      ctx.restore();
      return;
    }
    if (this.sky[v]) ctx.drawImage(this.sky[v], 0, 0, W, L.sceneBottom);
    // behind the buildings: stars, the balloon, the windmill, the kite, then the clouds
    if (look.twinkles) drawTwinkles(ctx, this.time);
    if (look.balloon) drawBalloon(ctx, this.time);
    for (const c of look.clouds) {
      const span = W + 200;
      const x = ((((c.x + this.cloudX - x0 * 0.15) % span) + span) % span) - 100;
      cloud(ctx, x, c.y, c.s, look.cloudFill[0], look.cloudFill[1]);
    }
    if (look.windmill) drawWindmill(ctx, look.windmill[0], look.windmill[1], this.time, this.wind);
    if (look.kite) drawKite(ctx, this.time, this.wind, this.windDir);
    if (this.front[v]) ctx.drawImage(this.front[v], 0, 0, W, L.sceneBottom);
    if (look.neon) drawNeon(ctx, look.neon[0], look.neon[1], look.neon[2], look.neon[3], this.time);
    for (const wt of look.watchers) drawWatcher(ctx, wt, this.time, look.cheer);
    for (const [sx, sy] of look.smoke) this.drawSmoke(ctx, sx, sy);
    if (look.steam) drawSteam(ctx, look.steam[0], look.steam[1], this.time, this.wind, this.windDir);
    if (look.flag) this.drawFlag(ctx, look.flag[0], look.flag[1]);
    if (look.cat) drawCat(ctx, look.cat[0], look.cat[1], this.time);
    for (const t of look.trees) this.drawTree(ctx, t);
    for (const s of look.bushes) this.drawBush(ctx, s);
    if (look.spray) this.drawSpray(ctx, look.spray[0], look.spray[1]);
    if (look.lights) this.drawLights(ctx, look.lights);
    for (const bd of look.birds) if (bd.state !== 'away') this.drawBird(ctx, bd, look.birdColor);
    drawGrass(ctx, this.time, this.wind, this.windDir, look.grass[0], look.grass[1]);
    if (look.butterflies) drawButterflies(ctx, look.butterflies, this.time);
    if (look.motes) drawMotes(ctx, this.time, this.wind, look.motes);
    if (look.fireflies) drawFireflies(ctx, this.time);
    ctx.restore();
  }

  private drawTree(ctx: Ctx, t: Tree) {
    const s = t.s;
    const h = 30 * s;
    const wind = this.wind;
    const tipX = Math.sin(t.ang) * h * 0.7;
    ctx.save();
    ctx.translate(t.x, G);
    let base = 0;
    if (t.pot) {
      rr(ctx, -12 * s, -14 * s, 24 * s, 14 * s, 3 * s);
      ctx.fillStyle = '#8a6a7a';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#6c5060';
      ctx.stroke();
      base = -12 * s;
    }
    ctx.beginPath();
    ctx.moveTo(-4 * s, base);
    ctx.quadraticCurveTo(-4 * s, base - h * 0.5, tipX - 3 * s, base - h);
    ctx.lineTo(tipX + 3 * s, base - h);
    ctx.quadraticCurveTo(4 * s, base - h * 0.5, 4 * s, base);
    ctx.closePath();
    ctx.fillStyle = '#8a6a55';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#6f5444';
    ctx.stroke();
    ctx.translate(tipX, base - h);
    ctx.rotate(t.ang * 0.9);
    // each clump of leaves rustles on its own
    const rustle = (i: number) => Math.sin(this.time * 3.1 + i * 1.7 + t.phase) * (0.4 + wind) * 0.9 * s;
    if (t.kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        const w = (20 - i * 5) * s;
        const y0 = (8 - i * 12) * s;
        ctx.fillStyle = '#6a8c66';
        poly(ctx, [-w + rustle(i), y0 + 2 * s, rustle(i) * 1.5, y0 - 22 * s, w + rustle(i), y0 + 2 * s]);
        ctx.fill();
        ctx.fillStyle = '#7fa07a';
        poly(ctx, [-w + rustle(i), y0, rustle(i) * 1.5, y0 - 22 * s, w + rustle(i), y0]);
        ctx.fill();
      }
    } else {
      const maple = t.kind === 'maple';
      blobs(
        ctx,
        [
          [rustle(0), -20 * s, 18 * s],
          [-15 * s + rustle(1), -7 * s, 14 * s],
          [15 * s + rustle(2), -7 * s, 14 * s],
          [rustle(3), -1 * s, 15 * s],
        ],
        maple ? '#e0a15a' : '#97b686',
        maple ? '#c9844a' : '#7c9d6c',
      );
      if (maple) {
        ctx.fillStyle = '#f0c86e';
        for (const [dx, dy] of [
          [-9, -14],
          [8, -22],
          [12, -4],
        ]) {
          circle(ctx, dx * s + rustle(dx), dy * s, 3.2 * s);
          ctx.fill();
        }
      }
      circle(ctx, -6 * s + rustle(0), -26 * s, 6 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBush(ctx: Ctx, b: Bush) {
    const pts: [number, number, number][] = [];
    for (let x = b.x0, i = 0; x <= b.x1; x += 15, i++) {
      const dx = Math.sin(this.time * 2.4 + x * 0.09) * (0.5 + this.wind) * 1.2 + b.wob * 6;
      pts.push([x + dx, G - 8 - (i % 2) * 2, 11]);
    }
    blobs(ctx, pts, '#90b17f', '#789a69');
  }

  private drawSmoke(ctx: Ctx, sx: number, sy: number) {
    for (let i = 0; i < 6; i++) {
      const a = (this.time * 0.45 + i / 6) % 1;
      const x = sx + a * 34 * this.wind * this.windDir + Math.sin(a * 6 + i) * 3;
      circle(ctx, x, sy - a * 60, 4 + a * 9);
      ctx.fillStyle = `rgba(235, 232, 240, ${0.45 * (1 - a)})`;
      ctx.fill();
    }
  }

  private drawFlag(ctx: Ctx, fx: number, fy: number) {
    ctx.strokeStyle = '#6f6b7d';
    ctx.lineWidth = 2;
    line(ctx, fx, fy, fx, fy - 30);
    // the cloth: a strip whose far end ripples more, blowing the way the wind goes
    const pts: [number, number, number][] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wave = Math.sin(this.time * 9 - u * 5) * 2.8 * u * (0.5 + this.wind);
      pts.push([fx + this.windDir * u * 22, fy - 30 + wave, fy - 18 + wave * 0.8]);
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][2]);
    ctx.closePath();
    ctx.fillStyle = '#e8823a';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#c46a2a';
    ctx.stroke();
  }

  private drawSpray(ctx: Ctx, cx: number, cy: number) {
    ctx.fillStyle = 'rgba(220, 240, 248, 0.7)';
    rr(ctx, cx - 1.5, cy - 24, 3, 24, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(205, 230, 240, 0.9)';
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const a = (this.time * 0.9 + i / 16) % 1;
      const x = cx + side * a * 26 + this.windDir * this.wind * a * 9;
      const y = cy - 24 + a * a * 30 - a * (1 - a) * 4 * 10;
      circle(ctx, x, y, 1.9 * (1 - a * 0.4));
      ctx.fill();
    }
  }

  private drawLights(ctx: Ctx, l: Lights) {
    const sag = 30 + l.off + Math.sin(this.time * 1.2) * 2 * this.wind;
    const cx = (l.x0 + l.x1) / 2 + this.windDir * this.wind * 10;
    const cy = l.y + sag * 2;
    ctx.strokeStyle = '#4a4658';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(l.x0, l.y);
    ctx.quadraticCurveTo(cx, cy, l.x1, l.y);
    ctx.stroke();
    const n = 14;
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const x = (1 - u) ** 2 * l.x0 + 2 * u * (1 - u) * cx + u * u * l.x1;
      const y = (1 - u) ** 2 * l.y + 2 * u * (1 - u) * cy + u * u * l.y + 4;
      const col = BULBS[i % BULBS.length];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.25 + 0.15 * Math.sin(this.time * 3 + i);
      circle(ctx, x, y, 9);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
      circle(ctx, x, y, 3);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }

  private drawBird(ctx: Ctx, bd: Bird, color: string) {
    ctx.save();
    ctx.translate(bd.x, bd.y);
    ctx.scale(bd.face, 1);
    ctx.fillStyle = color;
    if (bd.state === 'sit') {
      const peck = bd.peck > 0 ? Math.abs(Math.sin(bd.peck * 12)) * 2.5 : 0;
      poly(ctx, [-4, -6, -10, -8.5, -9, -4]);
      ctx.fill();
      ellipse(ctx, 0, -5, 6, 4.2);
      ctx.fill();
      circle(ctx, 4, -9 + peck, 3);
      ctx.fill();
      poly(ctx, [6.5, -9.6 + peck, 9.6, -8.6 + peck, 6.5, -7.8 + peck]);
      ctx.fillStyle = '#e8b84a';
      ctx.fill();
      circle(ctx, 4.9, -9.9 + peck, 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#6f5444';
      ctx.lineWidth = 1;
      line(ctx, -1, -1.2, -1, 0);
      line(ctx, 2, -1.2, 2, 0);
    } else {
      const f = Math.sin(bd.flap);
      ellipse(ctx, 0, 0, 6, 3.4);
      ctx.fill();
      circle(ctx, 5, -2, 2.7);
      ctx.fill();
      poly(ctx, [7, -2.6, 9.8, -1.8, 7, -1]);
      ctx.fillStyle = '#e8b84a';
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      poly(ctx, [-3, -1, -7, -1 - 9 * f, 3, -1]);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLeaves(ctx: Ctx) {
    // leaves at full opacity share one path per colour; only the fading ones are drawn alone
    const byColor = new Map<string, Leaf[]>();
    for (const f of this.leaves) {
      if (f.life < 0.5) {
        ctx.globalAlpha = f.life * 2;
        ellipse(ctx, f.x, f.y, 3.4 * f.s, 1.6 * f.s, f.rot);
        ctx.fillStyle = f.color;
        ctx.fill();
        continue;
      }
      const list = byColor.get(f.color);
      if (list) list.push(f);
      else byColor.set(f.color, [f]);
    }
    ctx.globalAlpha = 1;
    for (const [color, list] of byColor) {
      ctx.beginPath();
      for (const f of list) {
        ctx.moveTo(f.x + Math.cos(f.rot) * 3.4 * f.s, f.y + Math.sin(f.rot) * 3.4 * f.s);
        ctx.ellipse(f.x, f.y, 3.4 * f.s, 1.6 * f.s, f.rot, 0, Math.PI * 2);
      }
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}
