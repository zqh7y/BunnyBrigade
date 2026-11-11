import { music, sfx } from './audio';
import { Battle, type Econ, type Phase } from './battle';
import {
  AWAKEN_LEVEL,
  BAL,
  CASES,
  CELL_LOCKS,
  ITEMS,
  RECIPES,
  TOP_ODDS,
  WEAPONS,
  canTurn,
  cls,
  isBaseRecipe,
  isSuper,
  itemSellValue,
  recipesUsing,
  rollClass,
  slotPower,
  type CaseKind,
  type CellLock,
  type ItemType,
  type Recipe,
  type SuperId,
} from './data';
import { drawField, drawPaused } from './draw/field';
import { Street } from './draw/street';
import { drawRoll } from './draw/roll';
import { drawDefeat, drawDrag, drawEvolution, drawHud, drawPanel, drawPrep, drawStageClear, drawStats, drawWaveClear } from './draw/ui';
import { Effects } from './effects';
import { Inventory, makeItem, type Fusion, type Item } from './inventory';
import { CASE, COLOR, EVO, H, L, ROLL, TIER, W, caseFlyPos, trayRect } from './theme';
import { easeOutBack, inRect, rand, type Ctx, type Rect } from './util';

export interface Drag {
  item: Item;
  from: 'grid' | 'tray';
  col: number;
  row: number;
  trayIndex: number;
  offX: number;
  offY: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  moved: boolean;
}

export type Preview =
  | { mode: 'merge'; target: Item }
  | { mode: 'fuse'; target: Item; fusion: Fusion; gain: number }
  | { mode: 'nofuse'; target: Item; why: string }
  | { mode: 'place'; col: number; row: number; ok: boolean }
  | { mode: 'tray'; index: number }
  | { mode: 'sell' };

/** The evolution reveal in progress (about 1.6 s of real time). */
export interface Evolution {
  t: number;
  host: Item; // the piece that became the super (kept its id, so its squad upgrades in place)
  snaps: { it: Item; r: Rect }[]; // the two ingredients as they looked before, flying into the host
  result: SuperId;
  level: number;
  feed: boolean;
  first: boolean; // first time this recipe was fused this run
  awake: boolean; // the super just became Awakened (A-class)
  fused: boolean; // the flash at 0.4 s has happened
}

export interface CaseCard {
  type: ItemType;
  level: number;
}

/**
 * A case being opened as a roll. The case drops and pops open, then one big medallion flicks through random
 * pieces, faster at first and slowing down, and lands. A rare prize (A-class or better) first lands as a lower
 * class of the same piece, then cracks and breaks through, class by class, up to the real prize. The prize is
 * shown, then flies to the tray.
 */
export interface CaseRun {
  kind: CaseKind;
  pity: boolean; // this one was the guaranteed A-class or better
  t: number;
  cards: CaseCard[]; // every piece the roll flicks through; the last is what it lands on
  times: number[]; // when each appears
  prize: CaseCard; // what you get
  ups: number[]; // classes the landed piece breaks through to, ending at the prize's class ([] for most prizes)
  upAt: number[]; // when each break-through happens
  stage: number; // break-throughs done
  shown: number; // index of the piece on show (-1 while the case is still opening)
  shownAt: number; // when the piece (or class) on show appeared, for its pop
  win: number; // index of the last card
  rumbleT: number;
  landed: boolean; // the real prize is on show
  revealT: number;
  hold: number; // seconds the prize is shown before it flies to the tray
  fly: number; // 0..1
  slot: number; // tray slot it flies to
  counted: boolean; // already counted towards the pity guarantee
}

const EVO_KEY = 'bunny-brigade-evo';
const FUSE_AT = 0.4; // seconds into the reveal when the pieces fuse
const EVO_END = 1.6;
const A_CLASS = 5;

/** Every starting-locked grid cell and how it opens. */
const LOCKS = Object.entries(CELL_LOCKS).map(([k, lock]) => {
  const [c, r] = k.split(',').map(Number);
  return { c, r, lock };
});

const AUTO_KEY = 'bunny-brigade-auto';
const BEST_KM_KEY = 'bunny-brigade-best-km';

/** Ties the battle and the backpack grid together and handles taps, drags, merges, evolutions and cases. */
export class Game {
  econ: Econ = { cash: BAL.startCash, gems: BAL.startGems };
  /** Starts as a 4x3 block; the cells around it open with cash, by reaching stages, or with knock-outs. */
  inv = new Inventory(L.grid.cols, L.grid.rows, L.tray.count, (c, r) => c <= 3 && r >= 1 && r <= 3);
  battle = new Battle(this.econ);
  street = new Street();
  uiFx = new Effects();
  /** Effects drawn above the stage clear panel (the reward gems). */
  winFx = new Effects();
  speed = 1;
  paused = false;
  showStats = false;
  drag: Drag | null = null;
  time = 0;
  power = 0;
  /** Power number as shown: rolls up towards `power`. */
  powerShown = 0;
  powerBump = 0;
  /** Last button pressed, for the "sink" animation. */
  press: { r: Rect; t: number } | null = null;
  cashBump = 0;
  gemBump = 0;
  /**
   * AUTO battle (saved): a wave starts by itself after BAL.autoStart seconds of prep nobody is using, the carrot
   * airstrike drops itself on the biggest crowd of foxes, and the squads leave for the next street on their own.
   */
  auto = false;
  /** Seconds of untouched prep counted towards the auto start. */
  autoWait = 0;
  /** The distance counter as shown: rolls up towards battle.km. */
  kmShown = 0;
  kmBump = 0;
  /** The longest distance ever run (saved). */
  bestKm = 0;
  private lastKm = 0;
  private bestKmDirty = false;
  // cases
  case: CaseRun | null = null;
  cases = 0; // cash cases opened (their price climbs)
  pity = 0; // cases in a row without an A-class or better
  // unlocks
  kos = 0; // knock-outs this run (they open KO slots)
  private cellBuys = 0;
  // stage clear
  /** Real seconds since the stage was cleared (the stamp, then the reward panel). */
  winT = 0;
  /** When the reward panel is complete and its button works. */
  readonly winReady = 3;
  private gemsFlown = false;
  private lastPhase: Phase = 'prep';
  /** Shakes the panel when it is tapped while locked during a wave. */
  panelShake = 0;
  private waveStartT = -9;
  private caseEndT = -9; // when the last roll closed
  // evolutions
  evo: Evolution | null = null;
  punch = 0; // screen zoom punch at the fusion flash
  flash = 0; // white screen flash
  /** One-time tutorial gift: the partner for the first C-class recipe piece (opened as a free roll as soon as it can be). */
  evoGift: { type: ItemType; level: number } | null = null;
  runFound = new Set<SuperId>(); // fused this run
  discovered = new Set<SuperId>(); // ever fused (saved)
  awakened = new Set<SuperId>(); // ever made Awakened (saved)
  private evoTaught = false;
  private hinted = new Set<ItemType>();
  private readyCount = 0;
  private readyToasted = false;
  private gainCache = { key: '', gain: 0 };
  private lastCash = BAL.startCash;
  private lastGems = BAL.startGems;
  /** item id -> time it was placed / merged / bought, for the bounce. */
  private pops = new Map<number, number>();

  constructor() {
    this.loadEvo();
    this.loadPrefs();
    this.inv.place(makeItem('rabbit'), 1, 1);
    this.inv.place(makeItem('knife'), 2, 1);
    this.inv.place(makeItem('pistol'), 2, 2);
    this.inv.tray[0] = makeItem('smg');
    this.inv.tray[1] = makeItem('ammo'); // first gear piece, so the boost system shows up right away
    this.syncArmy();
    this.powerShown = this.power;
  }

  get caseCost() {
    return BAL.caseCost + Math.floor(this.cases * BAL.caseCostStep);
  }

  /** Cases left until the guaranteed A-class or better (1 = the next one). */
  get pityLeft() {
    return Math.max(1, BAL.pity - this.pity);
  }

  /** Price of the next cash grid cell. */
  get cellCost() {
    return BAL.cellCost + this.cellBuys * BAL.cellCostStep;
  }

  /** Cases, merges, evolutions and moving pieces only happen between waves. */
  get canManage() {
    const p = this.battle.phase;
    return p === 'prep' || p === 'cleared';
  }

  cellLock(c: number, r: number): CellLock {
    return CELL_LOCKS[`${c},${r}`] ?? { kind: 'cash' };
  }

  /** big = the power jump of an evolution: a larger, pink "+N". */
  syncArmy(big = false) {
    // a piece lifted off the grid still counts at its old spot, so a sync mid-drag
    // (the evolution flash) never kills the squads it arms
    const d = this.drag;
    const held = d && d.from === 'grid' && this.inv.fits(d.item.w, d.item.h, d.col, d.row) ? d : null;
    if (held) this.inv.place(held.item, held.col, held.row);
    const roster = this.inv.roster();
    if (held) this.inv.remove(held.item);
    this.battle.syncRoster(roster);
    const before = this.power;
    this.power = roster.reduce((a, s) => a + slotPower(s), 0);
    const diff = this.power - before;
    if (diff > 0 && before > 0) {
      const t = L.powerTab;
      this.uiFx.text(t.x + t.w + 26, t.y + t.h / 2 - (big ? 24 : 0), `+${diff}`, big ? EVO.glow : COLOR.cash, big ? 30 : 22, big ? 1.4 : 1);
      this.powerBump = 1;
    }
    this.checkEvoReady();
  }

  private allPieces(): Item[] {
    return [...this.inv.items, ...this.inv.tray.filter((t): t is Item => !!t)];
  }

  /** Every piece (grid or tray) that has an identical partner to merge with. */
  mergeable(): Item[] {
    const all = this.allPieces();
    return all.filter((a) => all.some((b) => this.inv.canMerge(a, b)));
  }

  /** Every pair (grid or tray) that can evolve or feed right now. */
  fusePairs(): [Item, Item][] {
    const all = this.allPieces();
    const out: [Item, Item][] = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (this.inv.canFuse(all[i], all[j])) out.push([all[i], all[j]]);
    return out;
  }

  /** E-class equivalents owned of a type (a C-class piece counts as 4). */
  ownedL1(type: ItemType) {
    let n = 0;
    for (const it of this.allPieces()) if (it.type === type) n += 2 ** (it.level - 1);
    if (this.drag?.item.type === type) n += 2 ** (this.drag.item.level - 1);
    return n;
  }

  bestLevel(type: ItemType) {
    let best = 0;
    for (const it of this.drag ? [...this.allPieces(), this.drag.item] : this.allPieces()) if (it.type === type) best = Math.max(best, it.level);
    return best;
  }

  /** The not-yet-made base recipe the player is closest to, and the half they need most. */
  featured(): { recipe: Recipe; need: ItemType } | null {
    const target = 2 ** (BAL.evoMinLevel - 1);
    let best: { recipe: Recipe; need: ItemType } | null = null;
    let bestMiss = Infinity;
    for (const r of RECIPES) {
      if (!isBaseRecipe(r) || this.runFound.has(r.result)) continue;
      const a = this.ownedL1(r.main);
      const b = this.ownedL1(r.partner);
      const miss = Math.max(0, target - a) + Math.max(0, target - b);
      if (miss < bestMiss) {
        bestMiss = miss;
        best = { recipe: r, need: a <= b ? r.main : r.partner };
      }
    }
    return best;
  }

  togglePause() {
    if (!this.battle.over) this.paused = !this.paused;
  }

  isPressed(r: Rect) {
    return !!this.press && this.press.r === r && this.time - this.press.t < 0.13;
  }

  popScale(id: number) {
    const e = this.evo;
    if (e && e.host.id === id) {
      // the evolved piece is hidden until the flash, then springs in
      if (e.t < FUSE_AT) return 0.001;
      if (e.t < FUSE_AT + 0.35) return Math.max(0.001, easeOutBack((e.t - FUSE_AT) / 0.35));
    }
    const t0 = this.pops.get(id);
    if (t0 === undefined) return 1;
    const k = (this.time - t0) / 0.35;
    if (k >= 1) {
      this.pops.delete(id);
      return 1;
    }
    return 1 + Math.sin(k * Math.PI) * 0.16 * (1 - k);
  }

  private pop(it: Item) {
    this.pops.set(it.id, this.time);
  }

  update(dt: number) {
    this.time += dt;
    this.uiFx.update(dt);
    this.street.update(dt, this.battle);
    // these run before the pause check, so a reveal or a case always finishes
    this.updateEvo(dt);
    this.updateCase(dt);
    this.cashBump = Math.max(0, this.cashBump - dt * 4);
    this.gemBump = Math.max(0, this.gemBump - dt * 4);
    this.updateKm(dt);
    this.powerBump = Math.max(0, this.powerBump - dt * 3);
    this.powerShown += (this.power - this.powerShown) * Math.min(1, dt * 5);
    if (Math.abs(this.power - this.powerShown) < 0.5) this.powerShown = this.power;
    if (this.econ.cash > this.lastCash) this.cashBump = 1;
    if (this.econ.gems > this.lastGems) this.gemBump = 1;
    this.lastCash = this.econ.cash;
    this.lastGems = this.econ.gems;
    for (const e of this.battle.events) {
      for (let i = 0; i < Math.min(5, e.reward); i++) this.uiFx.coin(e.x + i * 6, e.y - i * 4, L.cash.x + 20, L.cash.y + L.cash.h / 2);
      sfx.play('coin', 0, { x: e.x });
    }
    this.kos += this.battle.events.length;
    this.battle.events.length = 0;
    this.checkUnlocks();
    this.updateWin(dt);
    this.panelShake = Math.max(0, this.panelShake - dt * 3);
    // the tutorial gift opens as a free roll as soon as the grid can be managed and the tray has room
    if (this.evoGift && this.canManage && !this.case && !this.drag && this.inv.tray.includes(null)) this.openCase('free');
    // the soundtrack follows the battle, muffled while a case rolls, an evolution plays or the game is paused
    const ph = this.battle.phase;
    music.set(ph === 'fight' ? (this.battle.isBossWave ? 'boss' : 'fight') : ph === 'victory' || ph === 'travel' || ph === 'defeat' ? ph : 'prep');
    music.muffle(!!(this.case || this.evo || this.paused || this.showStats));
    if (this.paused || this.showStats) return;
    this.updateAuto(dt);
    // slow motion on big moments (boss knock-out, multi kills, evolutions, rare cases), counted in real time
    const slow = this.battle.slowmo > 0;
    this.battle.slowmo = Math.max(0, this.battle.slowmo - dt);
    let sim = dt * this.speed * (slow ? 0.3 : 1);
    while (sim > 0) {
      const step = Math.min(sim, 1 / 40);
      this.battle.update(step);
      sim -= step;
    }
  }

  /**
   * Stage clear timeline (real time): the stamp, the panel, then the reward gems fly to the counter and are
   * added when they arrive. winT is 0 whenever the stage is not cleared, so a new clear always starts at the stamp.
   */
  private updateWin(dt: number) {
    const b = this.battle;
    const phase = b.phase;
    this.winFx.update(dt);
    if (phase === 'cleared' && this.lastPhase !== 'cleared') {
      for (let i = 0; i < Math.min(6, b.clearBonus); i++) this.winFx.coin(W / 2 + (i - 2.5) * 16, L.ribbonY + 52, L.cash.x + 20, L.cash.y + L.cash.h / 2);
    }
    if (phase === 'fight' && this.lastPhase !== 'fight') this.cancelDrag(); // a held piece goes back when the wave starts
    if (phase !== 'victory') {
      this.winT = 0;
      this.gemsFlown = false;
      this.creditGems(); // never lose the reward, whatever ended the party
    } else {
      if (this.lastPhase !== 'victory') {
        this.winT = 0; // also undoes a stray tap on the frame the stage was cleared
        this.paused = false;
      }
      const before = this.winT;
      this.winT += dt;
      // the reward stars pop in one by one (drawStageClear shows them at the same times)
      for (let i = 0; i < b.stars; i++) {
        const at = 1.95 + i * 0.28;
        if (before < at && this.winT >= at) sfx.play('star', i);
      }
      if (!this.gemsFlown && this.winT >= 2.9) {
        this.gemsFlown = true;
        sfx.play('gems');
        const n = Math.min(12, b.lastReward);
        for (let i = 0; i < n; i++) this.winFx.gem(W / 2 - 70 + rand(-30, 30), L.endPanel.y + 250, L.gems.x + L.gems.w - 22, L.gems.y + L.gems.h / 2, i * 0.06);
      }
      if (this.winT >= 3.8) this.creditGems();
    }
    this.lastPhase = phase;
  }

  /** The distance counter rolls up to the battle's kilometres, bumps when a wave pays some, and keeps the record. */
  private updateKm(dt: number) {
    const b = this.battle;
    this.kmBump = Math.max(0, this.kmBump - dt * 3);
    if (b.km > this.lastKm + 0.3 && b.phase !== 'travel') this.kmBump = 1;
    this.lastKm = b.km;
    this.kmShown = b.phase === 'travel' ? b.km : this.kmShown + (b.km - this.kmShown) * Math.min(1, dt * 4);
    if (Math.abs(b.km - this.kmShown) < 0.05) this.kmShown = b.km;
    if (b.km > this.bestKm + 1e-6) {
      this.bestKm = b.km;
      this.bestKmDirty = true;
    }
    if (this.bestKmDirty && b.phase !== 'travel') {
      this.bestKmDirty = false;
      try {
        localStorage.setItem(BEST_KM_KEY, this.bestKm.toFixed(1));
      } catch {
        /* storage blocked: the record lasts this session only */
      }
    }
  }

  /** Seconds left before an AUTO wave starts (shown on the START button). */
  get autoLeft() {
    return Math.max(0, BAL.autoStart - this.autoWait);
  }

  toggleAuto() {
    this.auto = !this.auto;
    this.autoWait = 0;
    try {
      localStorage.setItem(AUTO_KEY, this.auto ? '1' : '0');
    } catch {
      /* storage blocked: AUTO lasts this session only */
    }
  }

  /** AUTO battle: start the wave after an untouched prep, drop the airstrike on the biggest crowd, move on after a stage. */
  private updateAuto(dt: number) {
    const b = this.battle;
    if (!this.auto) {
      this.autoWait = 0;
      return;
    }
    if (b.phase === 'prep' && !this.drag && !this.case && !this.evo && this.power > 0) {
      // (with no squad on the road it waits: a wave started then could only be lost)
      this.autoWait += dt;
      if (this.autoWait >= BAL.autoStart && b.startWave()) {
        this.autoWait = 0;
        this.panelShake = 0;
        this.waveStartT = this.time;
      }
    } else if (b.phase !== 'prep') this.autoWait = 0;
    if (b.bombReady) {
      const spot = this.bombSpot();
      if (spot) b.dropBomb(spot.x, spot.y);
    }
    if (b.phase === 'victory' && !this.case && !this.evo && this.winT >= this.winReady + BAL.autoStart) b.startTravel();
  }

  /** Where the airstrike hurts most: the fox with the most foxes around it (3 or more, or Big Red), on screen. */
  private bombSpot(): { x: number; y: number } | null {
    const foxes = this.battle.units.filter((u) => u.side === 'fox' && !u.dead && u.x > 30 && u.x < W - 30);
    const r2 = (BAL.bombAoe * 0.8) ** 2;
    let best: { x: number; y: number } | null = null;
    let bestN = 2;
    for (const f of foxes) {
      let n = f.kind === 'boss' ? 3 : 0;
      let sx = 0;
      let sy = 0;
      let k = 0;
      for (const o of foxes) {
        if ((o.x - f.x) ** 2 + (o.y - f.y) ** 2 > r2) continue;
        n++;
        sx += o.x;
        sy += o.y;
        k++;
      }
      if (n > bestN) {
        bestN = n;
        best = { x: sx / k, y: sy / k };
      }
    }
    return best;
  }

  private loadPrefs() {
    try {
      this.auto = localStorage.getItem(AUTO_KEY) === '1';
      this.bestKm = Number(localStorage.getItem(BEST_KM_KEY)) || 0;
    } catch {
      /* storage blocked: defaults */
    }
  }

  private creditGems() {
    if (this.battle.pendingGems <= 0) return;
    this.econ.gems += this.battle.pendingGems;
    this.battle.pendingGems = 0;
  }

  render(ctx: Ctx) {
    ctx.save();
    if (this.punch > 0) {
      const s = 1 + 0.03 * this.punch;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
    }
    this.street.draw(ctx, this.battle);
    drawField(ctx, this.battle, this.time);
    drawPrep(ctx, this);
    drawWaveClear(ctx, this);
    if (this.paused) drawPaused(ctx);
    drawHud(ctx, this);
    drawPanel(ctx, this);
    drawEvolution(ctx, this);
    drawDrag(ctx, this);
    drawRoll(ctx, this);
    this.uiFx.draw(ctx);
    if (this.showStats) drawStats(ctx, this);
    if (this.battle.phase === 'victory') drawStageClear(ctx, this);
    else if (this.battle.phase === 'defeat') drawDefeat(ctx, this);
    this.winFx.draw(ctx);
    ctx.restore();
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 * this.flash;
      ctx.fillStyle = EVO.flash;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- helpers

  private toast(text: string, color: string = COLOR.toast) {
    this.uiFx.text(W / 2, L.panel.y + L.panel.h / 2, text, color, text.length > 28 ? 18 : 24, text.length > 28 ? 1.8 : 1.1);
  }

  private cellAt(x: number, y: number) {
    const g = L.grid;
    if (x < g.x || y < g.y) return null;
    const col = Math.floor((x - g.x) / g.cell);
    const row = Math.floor((y - g.y) / g.cell);
    if (col >= g.cols || row >= g.rows) return null;
    return { col, row };
  }

  private trayIndexAt(x: number, y: number) {
    for (let i = 0; i < L.tray.count; i++) if (inRect(x, y, trayRect(i))) return i;
    return -1;
  }

  itemRect(it: Item): Rect {
    const g = L.grid;
    if (it.col >= 0) return { x: g.x + it.col * g.cell, y: g.y + it.row * g.cell, w: it.w * g.cell, h: it.h * g.cell };
    return trayRect(Math.max(0, this.inv.tray.indexOf(it)));
  }

  /** The piece under the pointer, on the grid or in the tray. */
  private pieceAt(x: number, y: number): Item | null {
    const cell = this.cellAt(x, y);
    if (cell) {
      const o = this.inv.itemAt(cell.col, cell.row);
      if (o) return o;
    }
    const ti = this.trayIndexAt(x, y);
    return ti >= 0 ? this.inv.tray[ti] : null;
  }

  /** What would happen if the dragged piece were dropped right now. */
  dropPreview(): Preview | null {
    const d = this.drag;
    if (!d || !d.moved) return null;
    const { px: x, py: y, item } = d;
    const o = this.pieceAt(x, y);
    if (o && this.inv.canMerge(item, o)) return { mode: 'merge', target: o };
    if (o && o !== item) {
      const f = this.inv.canFuse(item, o);
      if (f) return { mode: 'fuse', target: o, fusion: f, gain: this.predictGain(d, f) };
      if (this.inv.fuseRelated(item, o)) {
        const why = item.level !== o.level ? 'Fusing needs the same class' : item.level < BAL.evoMinLevel ? `Evolving starts at ${cls(BAL.evoMinLevel)}` : 'Already the top class (SSS)';
        return { mode: 'nofuse', target: o, why };
      }
    }
    if (inRect(x, y, L.sell)) return { mode: 'sell' };
    const ti = this.trayIndexAt(x, y);
    if (ti >= 0) return this.inv.tray[ti] ? null : { mode: 'tray', index: ti };
    if (inRect(x, y, L.panel)) {
      const g = L.grid;
      const col = Math.round((x - d.offX - g.x) / g.cell);
      const row = Math.round((y - d.offY - g.y) / g.cell);
      return { mode: 'place', col, row, ok: this.inv.fits(item.w, item.h, col, row) };
    }
    return null;
  }

  private tryRotate(it: Item, col: number, row: number): boolean {
    const spot = this.inv.spotNear(it.h, it.w, col, row, it.w, it.h);
    if (!spot) return false;
    [it.w, it.h] = [it.h, it.w];
    this.inv.place(it, spot.col, spot.row);
    return true;
  }

  private returnDrag(d: Drag) {
    if (d.from === 'grid') {
      this.inv.place(d.item, d.col, d.row);
      return;
    }
    const i = this.inv.tray[d.trayIndex] ? this.inv.tray.indexOf(null) : d.trayIndex;
    if (i >= 0) {
      this.inv.tray[i] = d.item;
      return;
    }
    // never lose a piece: last resort, the best free grid spot (turned only if it fits no other way)
    const s = this.inv.bestSpot(d.item, true);
    if (s) {
      d.item.w = s.w;
      d.item.h = s.h;
      this.inv.place(d.item, s.col, s.row);
    }
  }

  /** Any piece a case can hold, weighted by how common it is. */
  private randomType(): ItemType {
    const types = (Object.keys(ITEMS) as ItemType[]).filter((t) => ITEMS[t].weight > 0);
    const total = types.reduce((a, t) => a + ITEMS[t].weight, 0);
    let r = Math.random() * total;
    for (const t of types) {
      r -= ITEMS[t].weight;
      if (r <= 0) return t;
    }
    return 'pistol';
  }

  private rollType(): ItemType {
    if (!this.allPieces().some((it) => it.type === 'rabbit')) return 'rabbit';
    // some cases bring the missing half of the recipe you are closest to
    if (Math.random() < BAL.featuredChance) {
      const f = this.featured();
      if (f) return f.need;
    }
    return this.randomType();
  }

  private refuse(text: string) {
    sfx.play('denied');
    this.toast(text);
  }

  // ---------------------------------------------------------------- cases

  /**
   * Pay for a case and start the roll. The prize is decided now; the roll is built so it lands on it.
   * Returns false when no case started (refused, or an evolution is mid-flight).
   */
  private openCase(kind: CaseKind): boolean {
    if (!this.canManage) {
      this.lockedTap('Cases open between waves');
      return false;
    }
    if (this.evo && !this.evo.fused) return false; // the pieces are still flying together: wait for the flash
    const slot = this.inv.tray.indexOf(null);
    if (slot < 0) {
      this.refuse('Tray is full: place or sell a piece first');
      return false;
    }
    if (kind === 'basic') {
      if (this.econ.cash < this.caseCost) {
        this.refuse('Not enough cash');
        return false;
      }
      this.econ.cash -= this.caseCost;
      this.cases++;
    } else if (kind === 'elite') {
      if (this.econ.gems < BAL.eliteCost) {
        this.refuse('Not enough gems');
        return false;
      }
      this.econ.gems -= BAL.eliteCost;
    }
    this.evo = null; // a reveal past its flash ends here, so the case box never hides it half-way
    const pity = kind !== 'free' && this.pity >= BAL.pity - 1;
    const forced = kind === 'free' ? this.evoGift : null;
    if (forced) this.evoGift = null;
    const level = forced ? forced.level : rollClass(pity ? TOP_ODDS : CASES[kind].odds);
    const type = forced ? forced.type : this.rollType();

    // a rare prize lands as a lower class of the same piece first, then breaks through class by class
    const ups: number[] = [];
    for (let lv = A_CLASS; lv <= level; lv++) ups.push(lv);
    const landLevel = ups.length ? (Math.random() < 0.5 ? 2 : 3) : level;
    // the roll: once the case has popped open, pieces flick by every 40 ms at first, each a little slower than the last
    const dur = kind === 'elite' ? 2.5 : kind === 'free' ? 1.9 : 2.1;
    const cards: CaseCard[] = [];
    const times: number[] = [];
    let t = ROLL.open;
    let gap = 0.04;
    while (t < ROLL.open + dur) {
      let card: CaseCard = { type: this.randomType(), level: rollClass(CASES[kind].show) };
      // never the same piece twice in a row, so every flick is a visible change
      for (let tries = 0; tries < 4 && cards.length && card.type === cards[cards.length - 1].type; tries++) card = { type: this.randomType(), level: card.level };
      cards.push(card);
      times.push(t);
      t += gap;
      gap *= 1.13;
    }
    // a near miss: the piece just before a common prize is an S or SSS
    if (!ups.length && Math.random() < 0.4) cards[cards.length - 1] = { type: this.randomType(), level: Math.random() < 0.8 ? 6 : 7 };
    cards.push({ type, level: landLevel });
    times.push(t);
    this.case = {
      kind,
      pity,
      t: 0,
      cards,
      times,
      prize: { type, level },
      ups,
      upAt: ups.map((_, i) => t + ROLL.calm + ROLL.charge + i * (ROLL.gap + ROLL.charge)),
      stage: 0,
      shown: -1,
      shownAt: 0,
      win: cards.length - 1,
      rumbleT: 0,
      landed: false,
      revealT: 0,
      hold: level >= 6 ? 2.4 : level >= A_CLASS ? 1.7 : 0.9,
      fly: 0,
      slot,
      counted: false,
    };
    this.uiFx.list = this.uiFx.list.filter((p) => p.kind !== 'text');
    sfx.play('caseIn');
    return true;
  }

  /** The piece on show in the roll right now (null while the case is still opening). */
  rollCard(c: CaseRun): CaseCard | null {
    if (c.shown < 0) return null;
    if (c.shown < c.win) return c.cards[c.shown];
    return { type: c.prize.type, level: c.stage > 0 ? c.ups[c.stage - 1] : c.cards[c.win].level };
  }

  /** 0..1 while the landed piece is cracking towards its next class; -1 otherwise. */
  rollCharge(c: CaseRun): number {
    if (c.landed || c.shown < c.win || c.stage >= c.ups.length) return -1;
    const k = 1 - (c.upAt[c.stage] - c.t) / ROLL.charge;
    return k > 0 ? Math.min(1, k) : -1;
  }

  /** A tap while a case is open: land the roll now, then force each break-through, then collect the prize. */
  private skipCase() {
    const c = this.case;
    if (!c) return;
    if (c.t < 0.35) return; // the case is still dropping in: the second tap of a double tap on the button is not a skip
    if (c.landed) {
      if (c.revealT > 0.35) c.revealT = Math.max(c.revealT, c.hold);
    } else if (c.shown < c.win) c.t = Math.max(c.t, c.times[c.win]);
    else if (c.stage < c.ups.length) c.t = Math.max(c.t, c.upAt[c.stage]);
  }

  private updateCase(dt: number) {
    const c = this.case;
    if (!c) return;
    const prev = c.t;
    c.t += dt;
    const at = (x: number) => prev < x && c.t >= x;
    if (c.landed) {
      c.revealT += dt;
      if (c.revealT >= c.hold) c.fly = Math.min(1, c.fly + dt / 0.36);
      if (c.fly > 0 && c.fly < 1) {
        // a trail of sparkles behind the prize on its way to the tray
        const p = caseFlyPos(c.fly, c.slot);
        this.uiFx.add({ kind: 'star', x: p.x + rand(-14, 14), y: p.y + rand(-14, 14), vy: 30, life: 0.35, size: rand(3, 6), color: TIER.metalLight[c.prize.level - 1], vr: rand(-6, 6) });
      }
      if (c.fly >= 1) this.collectCase(c);
      return;
    }
    // the opening beat: the case lands, then its lid bursts open
    if (at(ROLL.drop)) {
      sfx.play('thud');
      this.punch = Math.max(this.punch, 0.5);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) this.uiFx.add({ kind: 'dust', x: CASE.x + s * rand(40, 70), y: CASE.caseY + 44, vx: s * rand(60, 200), vy: -rand(10, 60), life: 0.5, size: rand(6, 10) });
    }
    if (at(ROLL.pop)) {
      sfx.play('caseOpen');
      for (let i = 0; i < 14; i++) {
        this.uiFx.add({ kind: 'star', x: CASE.x + rand(-40, 40), y: CASE.caseY - 30, vx: rand(-160, 160), vy: -rand(200, 480), grav: 500, life: rand(0.4, 0.7), size: rand(3, 6), color: '#fff3c4', vr: rand(-8, 8) });
      }
    }
    // the flicks
    let flipped = false;
    while (c.shown < c.win && c.t >= c.times[c.shown + 1]) {
      c.shown++;
      flipped = true;
    }
    if (flipped) {
      c.shownAt = c.times[c.shown];
      const card = c.cards[c.shown];
      if (c.shown < c.win) {
        sfx.play('tick', card.level);
        // the last few flicks are slow and heavy
        if (c.times[c.shown + 1] - c.times[c.shown] > 0.14) sfx.play('tock');
        // a spark hops out of the case with every piece
        this.uiFx.add({ kind: 'spark', x: CASE.x + rand(-30, 30), y: CASE.caseY - 34, vx: rand(-70, 70), vy: -rand(180, 340), grav: 520, life: 0.35, size: 2.4, color: TIER.metalLight[card.level - 1] });
      } else if (!c.ups.length) this.landCase(c);
      else {
        // it lands like a common prize... for a moment
        sfx.play('reveal', card.level);
        this.uiFx.burst(CASE.x, CASE.y, TIER.metalLight[card.level - 1], 12);
      }
    }
    // break-throughs: the landed piece cracks, then shatters into its next class
    if (c.shown === c.win && !c.landed) {
      while (!c.landed && c.stage < c.ups.length && c.t >= c.upAt[c.stage]) this.breakThrough(c);
      if (!c.landed && this.rollCharge(c) >= 0) {
        const next = c.ups[c.stage];
        const start = c.upAt[c.stage] - ROLL.charge;
        for (const th of [0.05, 0.4, 0.72]) if (at(start + ROLL.charge * th)) sfx.play('crack', next);
        c.rumbleT -= dt;
        if (c.rumbleT <= 0) {
          c.rumbleT = 0.45;
          sfx.play('rumble');
        }
        // sparks of the next class's colour are sucked into the medallion
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rand(140, 220);
          this.uiFx.add({ kind: 'star', x: CASE.x + Math.cos(a) * r, y: CASE.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2.4, life: 0.4, size: rand(3, 5), color: TIER.metalLight[next - 1] });
        }
      }
    }
  }

  /** The landed piece shatters and comes back one class higher (the last time, as the real prize). */
  private breakThrough(c: CaseRun) {
    const from = this.rollCard(c)!.level;
    const to = c.ups[c.stage];
    c.shownAt = c.upAt[c.stage];
    c.stage++;
    c.rumbleT = 0;
    this.uiFx.shards(CASE.x, CASE.y, [TIER.tile[from - 1], TIER.tileLight[from - 1], TIER.tileDark[from - 1]], 18);
    this.uiFx.shock(CASE.x, CASE.y, 190, TIER.metalLight[to - 1]);
    this.uiFx.list = this.uiFx.list.filter((p) => p.text !== 'UPGRADE!'); // never two on top of each other
    this.uiFx.text(CASE.x, CASE.y - CASE.r - 150, 'UPGRADE!', TIER.metalLight[to - 1], 26, 0.9);
    this.punch = 1;
    this.flash = Math.max(this.flash, 0.6);
    sfx.play('shatter');
    sfx.play('upgrade', c.stage);
    if (c.stage >= c.ups.length) this.landCase(c);
  }

  /** The real prize is on show: count it, and celebrate according to its class. */
  private landCase(c: CaseRun) {
    c.landed = true;
    c.revealT = 0;
    const lv = c.prize.level;
    this.countPity(c);
    const x = CASE.x;
    const y = CASE.y;
    const color = TIER.metalLight[lv - 1];
    sfx.play('reveal', lv);
    this.uiFx.burst(x, y, color, 12 + lv * 3);
    this.uiFx.burst(x, y, '#ffffff', 6 + lv);
    this.punch = Math.max(this.punch, lv >= A_CLASS ? 1 : 0.35 + lv * 0.1);
    if (lv >= 4) {
      this.uiFx.confetti(x - 150, y + 120, 14 + (lv - 4) * 22);
      this.uiFx.confetti(x + 150, y + 120, 14 + (lv - 4) * 22);
    }
    if (lv >= A_CLASS) this.uiFx.add({ kind: 'glow', x, y, life: 0.5, size: 260, color });
    if (lv >= 6) {
      this.flash = 1;
      this.uiFx.burst(x, y, '#ffffff', 24);
    }
  }

  /** Counted when the prize is revealed (or collected early), so the "A+ IN n" labels never give the result away. */
  private countPity(c: CaseRun) {
    if (c.counted) return;
    c.counted = true;
    if (c.kind !== 'free') this.pity = c.prize.level >= A_CLASS ? 0 : this.pity + 1;
  }

  private collectCase(c: CaseRun) {
    this.countPity(c);
    this.case = null;
    this.caseEndT = this.time;
    const card = c.prize;
    const item = makeItem(card.type, card.level);
    const slot = this.inv.tray[c.slot] === null ? c.slot : this.inv.tray.indexOf(null);
    if (slot >= 0) {
      this.inv.tray[slot] = item;
      const r = trayRect(slot);
      this.uiFx.burst(r.x + r.w / 2, r.y + r.h / 2, TIER.metalLight[card.level - 1], 12);
    } else {
      const s = this.inv.bestSpot(item, true);
      if (s) {
        item.w = s.w;
        item.h = s.h;
        this.inv.place(item, s.col, s.row);
        this.syncArmy();
      } else {
        const v = itemSellValue(item.type, item.level);
        this.econ.cash += v;
        this.toast(`No room: sold for ${v} cash`);
        return;
      }
    }
    this.pop(item);
    sfx.play('drop');
    this.onLevelUp(item, false);
    this.checkEvoReady();
  }

  /** A tap on the grid, tray or case buttons during a wave: say why nothing happens, and shake the panel. */
  private lockedTap(text = 'Locked until the wave ends!') {
    this.panelShake = 1;
    this.refuse(text);
  }

  // ---------------------------------------------------------------- grid cells

  /** Cells that open on their own: on reaching a stage, or after enough knock-outs. */
  private checkUnlocks() {
    for (const { c, r, lock } of LOCKS) {
      if (lock.kind === 'cash' || this.inv.isOpen(c, r)) continue;
      if (lock.kind === 'stage' ? this.battle.stage >= lock.stage : this.kos >= lock.count) {
        this.openCell(c, r, lock.kind === 'stage' ? `STAGE ${lock.stage} REWARD: NEW SLOT!` : `${lock.count} KNOCK-OUTS: NEW SLOT!`);
      }
    }
  }

  private openCell(col: number, row: number, toast?: string) {
    this.inv.unlock(col, row);
    const g = L.grid;
    const cx = g.x + (col + 0.5) * g.cell;
    const cy = g.y + (row + 0.5) * g.cell;
    this.uiFx.burst(cx, cy, COLOR.cash, 16);
    this.uiFx.add({ kind: 'ring', x: cx, y: cy, life: 0.45, size: 56 });
    this.uiFx.add({ kind: 'glow', x: cx, y: cy, life: 0.4, size: 70, color: COLOR.cash });
    this.uiFx.text(cx, cy - 18, 'NEW SLOT!', COLOR.cash, 18, 1);
    sfx.play('unlock');
    if (toast) this.toast(toast, COLOR.cash);
  }

  /** A tap on a locked cell: buy it, or say what opens it. */
  private tryUnlock(col: number, row: number) {
    if (!this.canManage) return this.lockedTap();
    const lock = this.cellLock(col, row);
    if (lock.kind === 'stage') return this.refuse(`Opens when you reach Stage ${lock.stage}`);
    if (lock.kind === 'ko') return this.refuse(`Opens after ${lock.count} knock-outs (${Math.min(this.kos, lock.count)}/${lock.count})`);
    const cost = this.cellCost;
    if (this.econ.cash < cost) return this.refuse(`Need ${cost} cash for this slot`);
    this.econ.cash -= cost;
    this.cellBuys++;
    this.openCell(col, row);
  }

  // ---------------------------------------------------------------- evolutions

  private loadEvo() {
    try {
      const raw = localStorage.getItem(EVO_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { discovered?: string[]; awakened?: string[] };
      for (const s of d.discovered ?? []) if (isSuper(s)) this.discovered.add(s);
      for (const s of d.awakened ?? []) if (isSuper(s)) this.awakened.add(s);
    } catch {
      /* storage blocked or corrupt: keep the record in memory only */
    }
  }

  private saveEvo() {
    try {
      localStorage.setItem(EVO_KEY, JSON.stringify({ discovered: [...this.discovered], awakened: [...this.awakened] }));
    } catch {
      /* ignore */
    }
  }

  /** A chime (and once per run a toast) whenever a new evolution becomes possible. */
  private checkEvoReady() {
    const pairs = this.fusePairs();
    if (pairs.length > this.readyCount) {
      sfx.play('evoReady');
      if (!this.readyToasted) {
        this.readyToasted = true;
        const [a, b] = pairs[0];
        this.toast(`EVO READY! Drop the ${ITEMS[a.type].name} on the ${ITEMS[b.type].name}`, EVO.glow);
      }
    }
    this.readyCount = pairs.length;
  }

  /**
   * The first time a recipe piece reaches C-class in a run, tell the player what it can become.
   * The very first time (from a merge), the free case becomes its partner at that class, so the first evolution happens early.
   */
  private onLevelUp(it: Item, merged: boolean) {
    if (it.level < BAL.evoMinLevel || this.hinted.has(it.type)) return;
    const base = recipesUsing(it.type).filter(isBaseRecipe);
    if (!base.length) return;
    this.hinted.add(it.type);
    if (this.allPieces().some((o) => this.inv.canFuse(it, o))) return; // checkEvoReady says it
    const r = base[0];
    const partner = r.main === it.type ? r.partner : r.main;
    const pName = ITEMS[partner].name;
    if (merged && !this.evoTaught && !this.evoGift) {
      this.evoGift = { type: partner, level: it.level };
      this.evoTaught = true; // the tutorial gift is given once per run (it opens as a free roll)
      if (!this.inv.tray.includes(null)) this.toast('EVOLUTION UNLOCKED! Free roll when the tray has room', EVO.glow);
    } else {
      this.toast(`${cls(it.level)} ${ITEMS[it.type].name} can EVOLVE with a ${cls(it.level)} ${pName}`, EVO.glow);
    }
  }

  /** Power change a fusion would cause, computed on the real inventory and then undone (cached per drag + target). */
  private predictGain(d: Drag, f: Fusion): number {
    const other = f.main === d.item ? f.other : f.main;
    // also keyed on where the drag came from and the current power, so it never shows a number from an older layout
    const key = `${d.item.id}:${other.id}:${f.level}:${d.from}:${d.col}:${d.row}:${d.trayIndex}:${this.power}`;
    if (this.gainCache.key === key) return this.gainCache.gain;
    const pieces = [...this.allPieces(), d.item];
    const saved = {
      items: [...this.inv.items],
      tray: [...this.inv.tray],
      fields: pieces.map((it) => ({ it, type: it.type, level: it.level, w: it.w, h: it.h, col: it.col, row: it.row })),
    };
    this.applyFusion(d, f);
    const after = this.inv.roster().reduce((a, s) => a + slotPower(s), 0);
    this.inv.items = saved.items;
    this.inv.tray = saved.tray;
    for (const s of saved.fields) Object.assign(s.it, { type: s.type, level: s.level, w: s.w, h: s.h, col: s.col, row: s.row });
    const gain = after - this.power;
    this.gainCache = { key, gain };
    return gain;
  }

  /**
   * Moves the pieces for a fusion and turns the host into the super. The main ingredient keeps its cells;
   * if it was in the tray, the super takes the partner's freed grid spot when it fits. Returns the host.
   */
  private applyFusion(d: Drag, f: Fusion): Item {
    const { main, other } = f;
    const dragged = d.item;
    const otherSpot = other === dragged ? (d.from === 'grid' ? { col: d.col, row: d.row } : null) : other.col >= 0 ? { col: other.col, row: other.row } : null;
    const ow = other.w;
    const oh = other.h;
    // the used-up piece leaves the grid / tray (a dragged one is simply not put back)
    if (other !== dragged) {
      if (other.col >= 0) this.inv.remove(other);
      else {
        const i = this.inv.tray.indexOf(other);
        if (i >= 0) this.inv.tray[i] = null;
      }
    }
    if (main === dragged && d.from === 'grid') this.inv.place(main, d.col, d.row);
    let host = main;
    if (main.col < 0) {
      let w = main.w;
      let h = main.h;
      let spot = otherSpot ? this.inv.spotNear(w, h, otherSpot.col, otherSpot.row, ow, oh) : null;
      if (!spot && otherSpot && w !== h && canTurn(main.type)) {
        spot = this.inv.spotNear(h, w, otherSpot.col, otherSpot.row, ow, oh);
        if (spot) [w, h] = [h, w];
      }
      const mainTray = main === dragged ? d.trayIndex : this.inv.tray.indexOf(main);
      if (spot) {
        host = other; // keeps the partner's id, so the squad it armed is upgraded in place
        other.w = w;
        other.h = h;
        this.inv.place(other, spot.col, spot.row);
        if (main !== dragged && mainTray >= 0) this.inv.tray[mainTray] = null;
      } else if (main === dragged) {
        this.returnDrag(d);
      }
    }
    host.type = f.result;
    host.level = f.level;
    return host;
  }

  private fuse(d: Drag, f: Fusion) {
    const g = L.grid;
    const rectOf = (it: Item): Rect => (it === d.item ? { x: d.px - d.offX, y: d.py - d.offY, w: it.w * g.cell, h: it.h * g.cell } : this.itemRect(it));
    // snapshots taken before anything moves (copies with id -1 so they never bounce)
    const snaps = [f.main, f.other].map((it) => ({ it: { ...it, id: -1 }, r: rectOf(it) }));
    const host = this.applyFusion(d, f);
    this.gainCache.key = '';
    // Awakened: fusing two A-class (or better) partners, or feeding a super up to A-class
    const awake = f.feed ? f.level === AWAKEN_LEVEL : f.level >= AWAKEN_LEVEL;
    const first = !f.feed && !this.runFound.has(f.result);
    if (first) {
      this.runFound.add(f.result);
      this.econ.gems += BAL.evoGems;
    }
    this.discovered.add(f.result);
    if (awake) this.awakened.add(f.result);
    this.saveEvo();
    this.evoTaught = true;
    this.evo = { t: 0, host, snaps, result: f.result, level: f.level, feed: f.feed, first, awake, fused: false };
    sfx.play('evoRise');
    this.battle.slowmo = Math.max(this.battle.slowmo, f.feed && !awake ? 0.5 : 1.2);
  }

  /** The reveal timeline: pieces fly in, flash + squad upgrade at 0.4 s, banner, done at 1.6 s. */
  private updateEvo(dt: number) {
    this.punch = Math.max(0, this.punch - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 8);
    const e = this.evo;
    if (!e) return;
    e.t += dt;
    const lite = e.feed && !e.awake;
    const r = this.itemRect(e.host);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const color = e.awake ? EVO.awake : EVO.accent[e.result];
    if (e.t < FUSE_AT && !lite) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.uiFx.add({ kind: 'star', x: cx + Math.cos(a) * 90, y: cy + Math.sin(a) * 90, vx: -Math.cos(a) * 220, vy: -Math.sin(a) * 220, life: 0.4, size: 4, color: EVO.rim[(i + Math.floor(e.t * 20)) % EVO.rim.length] });
      }
    }
    if (!e.fused && e.t >= FUSE_AT) {
      e.fused = true;
      this.syncArmy(true);
      this.uiFx.add({ kind: 'glow', x: cx, y: cy, life: 0.3, size: lite ? 90 : 170, color: EVO.flash });
      this.uiFx.shock(cx, cy, lite ? 70 : 110, color);
      this.uiFx.burst(cx, cy, color, lite ? 12 : 24);
      if (!lite) this.uiFx.burst(cx, cy, '#ffffff', 12);
      this.punch = lite ? 0.4 : 1;
      this.flash = lite ? 0 : 1;
      sfx.play(e.awake ? 'awaken' : 'evolve');
      const armed = this.battle.evolveSquad(e.host.id, color, e.awake, lite ? 0.5 : e.awake ? 1.6 : 1.2);
      const name = WEAPONS[e.result].name;
      if (e.awake) this.battle.announce('AWAKENED!', `★ ${name}`, EVO.awake);
      else if (e.first) {
        this.battle.announce('NEW SUPER WEAPON!', `${name}  ·  +${BAL.evoGems} gems`, EVO.glow);
        this.battle.fx.confetti(W / 2, L.roadTop + 20);
      } else if (!e.feed) this.battle.announce(`${name.toUpperCase()}!`, 'EVOLVED!', color);
      if (!armed) this.toast('Touch a rabbit to arm it', EVO.glow);
    }
    if (e.t >= EVO_END) this.evo = null;
  }

  // ---------------------------------------------------------------- input

  pointerDown(x: number, y: number) {
    sfx.unlock();
    if (this.drag) return; // a piece is already held
    const hit = (r: Rect) => {
      if (!inRect(x, y, r)) return false;
      this.press = { r, t: this.time };
      sfx.play('click');
      return true;
    };
    if (this.battle.over) {
      // the stage clear / defeat panel comes first; a case still spinning under it is hurried, then collected
      if (this.battle.phase === 'victory' && this.winT < this.winReady) {
        this.winT = this.winReady; // tap: skip to the full reward panel
        if (this.case) this.skipCase();
      } else if (hit(L.overlayBtn)) {
        if (this.case) this.collectCase(this.case);
        if (this.battle.phase === 'victory') this.battle.startTravel();
        else this.battle.retry();
      } else if (this.case) this.skipCase();
      return;
    }
    if (this.case) return this.skipCase(); // any tap hurries or collects the case
    if (this.showStats) {
      this.showStats = false;
      return;
    }
    if (hit(L.pause)) return this.togglePause();
    if (hit(L.speed)) {
      this.speed = this.speed === 1 ? 2 : 1;
      return;
    }
    if (hit(L.auto)) return this.toggleAuto();
    this.autoWait = 0; // any other tap in prep gives the player the full countdown again
    if (hit(L.caseBtn)) return void this.openCase('basic');
    if (hit(L.eliteBtn)) return void this.openCase('elite');
    if (hit(L.mute)) {
      sfx.toggleMute();
      return;
    }
    if (hit(L.stats)) {
      this.showStats = true;
      return;
    }
    if (this.paused && y < L.sceneBottom) {
      this.paused = false;
      return;
    }
    // prep: the START button on the road
    // a tap meant for the roll that just closed: its medallion sat right on START
    if (this.battle.phase === 'prep' && this.time - this.caseEndT < 0.6 && inRect(x, y, L.startBtn)) return;
    if (this.battle.phase === 'prep' && hit(L.startBtn)) {
      if (this.battle.startWave()) {
        this.panelShake = 0;
        this.waveStartT = this.time;
      }
      return;
    }
    // tap the road during a wave: carrot airstrike
    if (y > L.roadTop - 10 && y < L.roadBottom) {
      if (this.battle.phase !== 'fight') return;
      if (this.time - this.waveStartT < 0.4 && inRect(x, y, L.startBtn)) return; // the second tap of a double tap on START
      if (!this.battle.dropBomb(x, y)) {
        sfx.play('denied');
        this.battle.fx.text(x, y - 20, 'recharging...', COLOR.textDim, 15, 0.6);
      }
      return;
    }

    const g = L.grid;
    // the grid and tray are locked during a wave
    if (!this.canManage && (this.cellAt(x, y) || this.trayIndexAt(x, y) >= 0)) return this.lockedTap();
    const evoBusy = (it: Item) => !!this.evo && this.evo.t < FUSE_AT && this.evo.host === it;
    const lift = (it: Item) => {
      // picking up the new super after its flash simply ends the reveal (the army is already synced)
      if (this.evo?.host === it) this.evo = null;
      this.gainCache.key = '';
      sfx.play('pick');
    };
    const cell = this.cellAt(x, y);
    if (cell) {
      if (!this.inv.isOpen(cell.col, cell.row)) return this.tryUnlock(cell.col, cell.row);
      const it = this.inv.itemAt(cell.col, cell.row);
      if (!it || evoBusy(it)) return;
      const col = it.col;
      const row = it.row;
      this.inv.remove(it);
      lift(it);
      this.drag = { item: it, from: 'grid', col, row, trayIndex: -1, offX: x - (g.x + col * g.cell), offY: y - (g.y + row * g.cell), px: x, py: y, sx: x, sy: y, moved: false };
      return;
    }
    const ti = this.trayIndexAt(x, y);
    const it = ti >= 0 ? this.inv.tray[ti] : null;
    if (it && !evoBusy(it)) {
      this.inv.tray[ti] = null;
      lift(it);
      this.drag = { item: it, from: 'tray', col: -1, row: -1, trayIndex: ti, offX: (it.w * g.cell) / 2, offY: (it.h * g.cell) / 2, px: x, py: y, sx: x, sy: y, moved: false };
    }
  }

  pointerMove(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    d.px = x;
    d.py = y;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 8) d.moved = true;
  }

  pointerUp(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    this.pointerMove(x, y);
    const it = d.item;

    if (!d.moved) {
      // a tap: rotate a grid piece, or put a tray piece where it helps most
      this.drag = null;
      if (d.from === 'grid') {
        if (!canTurn(it.type)) {
          // rabbits always stand up: a tap just makes them hop
          this.inv.place(it, d.col, d.row);
          this.pop(it);
          sfx.play('pick');
        } else if (it.w !== it.h && this.tryRotate(it, d.col, d.row)) {
          this.pop(it);
          sfx.play('drop');
          this.syncArmy();
        } else {
          this.inv.place(it, d.col, d.row);
          if (it.w !== it.h) this.refuse('No room to rotate');
        }
      } else {
        const spot = this.inv.bestSpot(it);
        if (spot) {
          it.w = spot.w;
          it.h = spot.h;
          this.inv.place(it, spot.col, spot.row);
          this.pop(it);
          sfx.play('drop');
          this.syncArmy();
        } else {
          this.inv.tray[d.trayIndex] = it;
          // auto-place keeps the shape the piece has in the tray: say so when only the other way round would fit
          this.refuse(this.inv.bestSpot(it, true) ? 'No room this way round' : 'Grid is full');
        }
      }
      return;
    }

    const prev = this.dropPreview();
    this.drag = null;
    if (prev?.mode === 'fuse') return this.fuse(d, prev.fusion); // army syncs at the flash
    if (prev?.mode === 'nofuse') {
      this.returnDrag(d);
      this.refuse(prev.why);
      return;
    }
    if (prev?.mode === 'merge') {
      const target = prev.target;
      if (isSuper(target.type) && target.level + 1 === AWAKEN_LEVEL) {
        // two B-class supers: an Awakened A-class super, with the full reveal
        const g = L.grid;
        const snaps = [
          { it: { ...it, id: -1 }, r: { x: d.px - d.offX, y: d.py - d.offY, w: it.w * g.cell, h: it.h * g.cell } },
          { it: { ...target, id: -1 }, r: this.itemRect(target) },
        ];
        target.level++;
        this.awakened.add(target.type);
        this.saveEvo();
        this.evo = { t: 0, host: target, snaps, result: target.type, level: target.level, feed: false, first: false, awake: true, fused: false };
        sfx.play('evoRise');
        this.battle.slowmo = Math.max(this.battle.slowmo, 1.2);
        return; // army syncs at the flash
      }
      target.level++;
      this.pop(target);
      const r = this.itemRect(target);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const lv = target.level;
      const color = TIER.metalLight[lv - 1];
      this.uiFx.burst(cx, cy, color, 20);
      this.uiFx.add({ kind: 'ring', x: cx, y: cy, life: 0.4, size: 70 });
      this.uiFx.add({ kind: 'glow', x: cx, y: cy, life: 0.3, size: 90, color });
      this.uiFx.text(cx, cy - 10, `${cls(lv).toUpperCase()}!`, color, lv >= A_CLASS ? 32 : 26, lv >= A_CLASS ? 1.4 : 1);
      if (lv >= A_CLASS) {
        // merging up to A, S or SSS is a big moment
        this.uiFx.confetti(cx, cy - 20, 20 + (lv - A_CLASS) * 25);
        this.punch = lv >= 6 ? 1 : 0.6;
        if (lv >= 6) this.flash = 0.8;
        sfx.play('reveal', lv);
      } else sfx.play('merge', lv);
      this.onLevelUp(target, true);
    } else if (prev?.mode === 'place' && prev.ok) {
      this.inv.place(it, prev.col, prev.row);
      this.pop(it);
      sfx.play('drop');
    } else if (prev?.mode === 'tray') {
      this.inv.tray[prev.index] = it;
      sfx.play('drop');
    } else if (prev?.mode === 'sell') {
      const v = itemSellValue(it.type, it.level);
      this.econ.cash += v;
      this.uiFx.text(L.sell.x + L.sell.w / 2, L.sell.y - 10, `+${v}`, COLOR.cash, 22);
      sfx.play('sell');
    } else {
      this.returnDrag(d);
      sfx.play('drop');
    }
    this.syncArmy();
  }

  cancelDrag() {
    if (!this.drag) return;
    this.returnDrag(this.drag);
    this.drag = null;
    this.syncArmy();
  }
}
