import {
  BAL,
  GEAR,
  GEAR_FX,
  ITEMS,
  MAX_LEVEL,
  canTurn,
  gearBoosts,
  isGear,
  isSuper,
  isWeapon,
  recipeFor,
  recipeOf,
  type GearType,
  type ItemType,
  type SlotStats,
  type SuperId,
  type WeaponId,
} from './data';

/** A fusion that dropping one piece on another would make. main keeps its cells; other is used up. */
export interface Fusion {
  result: SuperId;
  level: number;
  main: Item;
  other: Item;
  feed: boolean; // feeding a super one of its ingredients: +1 level
}

/** A piece on the grid (or in the tray when col/row are -1). */
export interface Item {
  id: number;
  type: ItemType;
  level: number;
  w: number;
  h: number;
  col: number;
  row: number;
}

/** One squad the grid produces. key = id of the item that owns the squad. */
export interface Slot extends SlotStats {
  key: number;
}

export interface LinkEdge {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
  color?: string;
}

interface Buff {
  rate: number;
  dmg: number;
  range: number;
  extra: number;
  hp: number;
  regen: number;
}

const noBuff = (): Buff => ({ rate: 0, dmg: 0, range: 0, extra: 0, hp: 0, regen: 0 });

let nextId = 1;

export function makeItem(type: ItemType, level = 1): Item {
  const d = ITEMS[type];
  return { id: nextId++, type, level, w: d.w, h: d.h, col: -1, row: -1 };
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * The backpack grid. Rules:
 * - a weapon touching a rabbit (side by side, not diagonal) becomes a squad carrying that weapon;
 * - a rabbit touching no weapon sends a squad that fights with its paws;
 * - gear never fights: it boosts the pieces it touches (see GEAR in data.ts);
 * - only unlocked cells can hold pieces; locked cells next to open ones can be bought.
 */
export class Inventory {
  items: Item[] = [];
  tray: (Item | null)[];
  unlocked: boolean[][];
  unlocks = 0;

  constructor(
    public cols: number,
    public rows: number,
    traySize: number,
    open: (c: number, r: number) => boolean,
  ) {
    this.tray = new Array<Item | null>(traySize).fill(null);
    this.unlocked = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => open(c, r)));
  }

  isOpen(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.unlocked[c][r];
  }

  /** True for a cell that is still locked (how it opens is decided by CELL_LOCKS in the game). */
  canUnlock(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.unlocked[c][r];
  }

  unlock(c: number, r: number) {
    this.unlocked[c][r] = true;
    this.unlocks++;
  }

  get lockedCount() {
    let n = 0;
    for (const col of this.unlocked) for (const open of col) if (!open) n++;
    return n;
  }

  itemAt(c: number, r: number): Item | undefined {
    return this.items.find((it) => c >= it.col && c < it.col + it.w && r >= it.row && r < it.row + it.h);
  }

  fits(w: number, h: number, col: number, row: number): boolean {
    for (let c = col; c < col + w; c++) for (let r = row; r < row + h; r++) if (!this.isOpen(c, r) || this.itemAt(c, r)) return false;
    return true;
  }

  place(it: Item, col: number, row: number) {
    it.col = col;
    it.row = row;
    if (!this.items.includes(it)) this.items.push(it);
  }

  remove(it: Item) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    it.col = -1;
    it.row = -1;
  }

  findSpot(w: number, h: number): { col: number; row: number } | null {
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) if (this.fits(w, h, col, row)) return { col, row };
    return null;
  }

  /**
   * The most useful free spot for a piece (linked weapon, gear touching the most targets...), in the shape it has
   * now. `turn` also tries it turned, as a last resort only when nothing fits the way it is (never for a rabbit,
   * which always stands up).
   */
  bestSpot(it: Item, turn = false): { col: number; row: number; w: number; h: number } | null {
    const own = this.bestSpotShaped(it, [[it.w, it.h]]);
    if (own || !turn || it.w === it.h || !canTurn(it.type)) return own;
    return this.bestSpotShaped(it, [[it.h, it.w]]);
  }

  private bestSpotShaped(it: Item, shapes: [number, number][]): { col: number; row: number; w: number; h: number } | null {
    const ow = it.w;
    const oh = it.h;
    let best: { col: number; row: number; w: number; h: number } | null = null;
    let bestScore = -1;
    for (const [w, h] of shapes) {
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          if (!this.fits(w, h, col, row)) continue;
          it.w = w;
          it.h = h;
          this.place(it, col, row);
          const score = this.spotScore(it);
          this.remove(it);
          if (score > bestScore) {
            bestScore = score;
            best = { col, row, w, h };
          }
        }
      }
    }
    it.w = ow;
    it.h = oh;
    return best;
  }

  private spotScore(it: Item) {
    const touching = this.touching(it);
    if (isGear(it.type)) return touching.filter((o) => gearBoosts(it.type as GearType, o.type)).length * 3;
    if (it.type === 'rabbit') return touching.filter((o) => isWeapon(o.type) && !this.links().has(o)).length * 3 + touching.filter((o) => isGear(o.type)).length;
    return this.links().has(it) ? 3 + touching.filter((o) => isGear(o.type) && gearBoosts(o.type, it.type)).length : 0;
  }

  canMerge(a: Item, b: Item) {
    return a !== b && a.type === b.type && a.level === b.level && a.level < MAX_LEVEL;
  }

  /**
   * Evolution rules. Recipe partners of the SAME level (Lv3+) fuse into their super at that level
   * (Lv5 + Lv5 = Awakened). A super plus a same-level piece of one of its ingredients is a feed: +1 level.
   * Recipe pairs always differ in type, so this never overlaps with canMerge.
   */
  canFuse(a: Item, b: Item): Fusion | null {
    if (a === b || a.level !== b.level || a.level < BAL.evoMinLevel) return null;
    const r = recipeFor(a.type, b.type);
    if (r) {
      const main = a.type === r.main ? a : b;
      return { result: r.result, level: a.level, main, other: main === a ? b : a, feed: false };
    }
    if (BAL.evoFeed && a.level < MAX_LEVEL) {
      for (const [s, o] of [
        [a, b],
        [b, a],
      ] as const) {
        if (!isSuper(s.type)) continue;
        const rr = recipeOf(s.type);
        if (rr.main === o.type || rr.partner === o.type) return { result: s.type, level: a.level + 1, main: s, other: o, feed: true };
      }
    }
    return null;
  }

  /** True when the two pieces belong to the same recipe or feed, whatever their levels (for "wrong level" hints). */
  fuseRelated(a: Item, b: Item) {
    if (a === b) return false;
    if (recipeFor(a.type, b.type)) return true;
    const feeds = (s: Item, o: Item) => isSuper(s.type) && (recipeOf(s.type).main === o.type || recipeOf(s.type).partner === o.type);
    return feeds(a, b) || feeds(b, a);
  }

  /** Free top-left for a w x h piece overlapping the cw x ch area at (col, row), nearest first. */
  spotNear(w: number, h: number, col: number, row: number, cw: number, ch: number): { col: number; row: number } | null {
    const cands: [number, number][] = [];
    for (let c = col - w + 1; c < col + cw; c++) for (let r = row - h + 1; r < row + ch; r++) cands.push([c, r]);
    cands.sort((p, q) => Math.abs(p[0] - col) + Math.abs(p[1] - row) - (Math.abs(q[0] - col) + Math.abs(q[1] - row)));
    for (const [c, r] of cands) if (this.fits(w, h, c, r)) return { col: c, row: r };
    return null;
  }

  /** [ownCol, ownRow, neighbourCol, neighbourRow] for every cell touching the item from outside. */
  private neighbours(it: Item): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (let c = it.col; c < it.col + it.w; c++) {
      for (let r = it.row; r < it.row + it.h; r++) {
        for (const [dc, dr] of DIRS) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc >= it.col && nc < it.col + it.w && nr >= it.row && nr < it.row + it.h) continue;
          out.push([c, r, nc, nr]);
        }
      }
    }
    return out;
  }

  /** Distinct pieces touching this one. */
  touching(it: Item): Item[] {
    const out = new Set<Item>();
    for (const [, , nc, nr] of this.neighbours(it)) {
      const o = this.itemAt(nc, nr);
      if (o && o !== it) out.add(o);
    }
    return [...out];
  }

  /** Pieces this gear boosts right now. */
  gearTargets(g: Item): Item[] {
    if (!isGear(g.type)) return [];
    const type = g.type;
    return this.touching(g).filter((o) => gearBoosts(type, o.type));
  }

  /** Gear types currently boosting this piece (for the little coloured badges). */
  boostsOn(it: Item): GearType[] {
    const out: GearType[] = [];
    for (const o of this.touching(it)) if (isGear(o.type) && gearBoosts(o.type, it.type) && !out.includes(o.type)) out.push(o.type);
    return out;
  }

  /** For each weapon piece, the strongest rabbit touching it. */
  links(): Map<Item, Item> {
    const m = new Map<Item, Item>();
    for (const it of this.items) {
      if (!isWeapon(it.type)) continue;
      let best: Item | null = null;
      for (const o of this.touching(it)) if (o.type === 'rabbit' && (!best || o.level > best.level)) best = o;
      if (best) m.set(it, best);
    }
    return m;
  }

  /** Cell edges to draw a joint on: weapon-rabbit links (orange) and gear boosts (gear colour). */
  linkEdges(): LinkEdge[] {
    const edges: LinkEdge[] = [];
    for (const it of this.items) {
      const gear = isGear(it.type) ? it.type : null;
      if (!gear && !isWeapon(it.type)) continue;
      for (const [c, r, nc, nr] of this.neighbours(it)) {
        const o = this.itemAt(nc, nr);
        if (!o) continue;
        if (gear && gearBoosts(gear, o.type)) edges.push({ c1: c, r1: r, c2: nc, r2: nr, color: GEAR[gear].color });
        else if (!gear && o.type === 'rabbit') edges.push({ c1: c, r1: r, c2: nc, r2: nr });
      }
    }
    return edges;
  }

  roster(): Slot[] {
    // add up every gear boost on the pieces it touches
    const boosts = new Map<Item, Buff>();
    for (const g of this.items) {
      if (!isGear(g.type)) continue;
      for (const t of this.gearTargets(g)) {
        const b = boosts.get(t) ?? noBuff();
        if (g.type === 'ammo') b.rate += GEAR_FX.rate(g.level);
        if (g.type === 'scope') {
          b.dmg += GEAR_FX.dmg(g.level);
          b.range += GEAR_FX.range(g.level);
        }
        if (g.type === 'banner') b.extra += GEAR_FX.extra(g.level);
        if (g.type === 'medkit') {
          b.hp += GEAR_FX.hp(g.level);
          b.regen += GEAR_FX.regen(g.level);
        }
        boosts.set(t, b);
      }
    }
    const slot = (key: number, weapon: WeaponId, wLevel: number, rLevel: number, wb: Buff, rb: Buff): Slot => ({
      key,
      weapon,
      wLevel,
      rLevel,
      rate: 1 + wb.rate,
      dmgMul: 1 + wb.dmg,
      rangeMul: 1 + wb.range,
      hpMul: 1 + rb.hp,
      regen: rb.regen,
      extra: rb.extra,
    });

    const links = this.links();
    const armed = new Set<Item>();
    const slots: Slot[] = [];
    const ordered = [...this.items].sort((a, b) => a.row - b.row || a.col - b.col);
    for (const it of ordered) {
      if (!isWeapon(it.type)) continue;
      const rb = links.get(it);
      if (!rb) continue;
      armed.add(rb);
      slots.push(slot(it.id, it.type, it.level, rb.level, boosts.get(it) ?? noBuff(), boosts.get(rb) ?? noBuff()));
    }
    for (const it of ordered) {
      if (it.type === 'rabbit' && !armed.has(it)) slots.push(slot(it.id, 'fist', 1, it.level, noBuff(), boosts.get(it) ?? noBuff()));
    }
    return slots;
  }
}
