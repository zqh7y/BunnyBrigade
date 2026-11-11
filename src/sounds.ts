/*
 * The game's sound effects, designed as small synth recipes. Each one is rendered once (offline, much faster than
 * real time) into an audio buffer when the page loads, the way a sound designer bounces layered sounds:
 * a sharp transient, a body, a sub thump, a noisy tail, metallic rings, crackle, brass, bells and choir.
 * Sounds heard many times in a row get a few variants so they never machine-gun.
 */

export type SoundName =
  // guns
  | 'pistol'
  | 'smg'
  | 'gatling'
  | 'rifle'
  | 'rocket'
  | 'rail'
  | 'cannon'
  | 'throw'
  | 'shock'
  // melee
  | 'slash'
  | 'whack'
  | 'bash'
  | 'punch'
  | 'bonk'
  | 'swoosh'
  // impacts and knock-outs
  | 'hit'
  | 'thwack'
  | 'ricochet'
  | 'zap'
  | 'pin'
  | 'fizz'
  | 'crit'
  | 'boom'
  | 'pop'
  | 'ko'
  | 'down'
  | 'combo'
  | 'comboBig'
  | 'coin'
  | 'leak'
  | 'yell'
  // fox skills
  | 'blink'
  | 'dodge'
  | 'sprint'
  | 'rush'
  | 'smoke'
  | 'roar'
  // the wave
  | 'wave'
  | 'boss'
  | 'bossDown'
  | 'bomb'
  | 'bombReady'
  | 'clear'
  | 'stageClear'
  | 'defeat'
  | 'star'
  | 'gems'
  | 'launch'
  | 'firework'
  // the run to the next street
  | 'charge'
  | 'run'
  | 'skid'
  | 'land'
  // the grid
  | 'click'
  | 'pick'
  | 'drop'
  | 'denied'
  | 'merge'
  | 'sell'
  | 'unlock'
  | 'evoReady'
  | 'evoRise'
  | 'evolve'
  | 'awaken'
  // cases
  | 'caseIn'
  | 'thud'
  | 'caseOpen'
  | 'tick'
  | 'tock'
  | 'rumble'
  | 'crack'
  | 'shatter'
  | 'upgrade'
  | 'reveal';

export const SAMPLE_RATE = 44100;

/** A value, or [time, value] points joined by exponential ramps. */
type Pts = number | [number, number][];

interface Env {
  t?: number; // start
  a?: number; // attack
  h?: number; // hold
  d: number; // decay to silence
  v: number; // level
  to?: AudioNode;
}

/** Builds sounds inside an OfflineAudioContext, with its own repeatable random numbers. */
export class Synth {
  private noises = new Map<string, AudioBuffer>();
  private seed: number;

  constructor(readonly ac: OfflineAudioContext, seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  rnd() {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  rand(a: number, b: number) {
    return a + (b - a) * this.rnd();
  }

  private pts(p: AudioParam, t: number, v: Pts) {
    if (typeof v === 'number') return p.setValueAtTime(v, t);
    p.setValueAtTime(v[0][1], t + v[0][0]);
    for (let i = 1; i < v.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-4, v[i][1]), t + v[i][0]);
  }

  private env(g: AudioParam, e: Env) {
    const t = e.t ?? 0;
    const a = e.a ?? 0.002;
    const h = e.h ?? 0;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(e.v, t + a);
    if (h > 0) g.setValueAtTime(e.v, t + a + h);
    g.exponentialRampToValueAtTime(1e-4, t + a + h + e.d);
    g.setValueAtTime(0, t + a + h + e.d + 0.002);
  }

  private end(e: Env) {
    return (e.t ?? 0) + (e.a ?? 0.002) + (e.h ?? 0) + e.d + 0.05;
  }

  private filter(type: BiquadFilterType, f: Pts, q: number, t: number) {
    const b = this.ac.createBiquadFilter();
    b.type = type;
    b.Q.value = q;
    this.pts(b.frequency, t, f);
    return b;
  }

  /** Soft clipping: punch and warmth for guns, drums and explosions. Returns the input to route voices into. */
  drive(k: number, to?: AudioNode): AudioNode {
    const ws = this.ac.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    ws.curve = curve;
    ws.oversample = '4x';
    ws.connect(to ?? this.ac.destination);
    return ws;
  }

  /** An oscillator with a pitch path, optional vibrato and filter, through an envelope. */
  tone(o: Env & { type?: OscillatorType; f: Pts; lp?: Pts; hp?: number; q?: number; vib?: [number, number]; detune?: number }) {
    const t = o.t ?? 0;
    const osc = this.ac.createOscillator();
    osc.type = o.type ?? 'sine';
    this.pts(osc.frequency, t, o.f);
    if (o.detune) osc.detune.value = o.detune;
    const stop = this.end(o);
    if (o.vib) {
      const lfo = this.ac.createOscillator();
      lfo.frequency.value = o.vib[0];
      const depth = this.ac.createGain();
      depth.gain.value = o.vib[1];
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(t);
      lfo.stop(stop);
    }
    let node: AudioNode = osc;
    if (o.lp !== undefined) {
      const f = this.filter('lowpass', o.lp, o.q ?? 0.8, t);
      node.connect(f);
      node = f;
    }
    if (o.hp) {
      const f = this.filter('highpass', o.hp, 0.7, t);
      node.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    osc.start(t);
    osc.stop(stop);
  }

  private noiseBuf(color: 'white' | 'pink' | 'brown') {
    let buf = this.noises.get(color);
    if (buf) return buf;
    const len = this.ac.length + Math.ceil(SAMPLE_RATE * 0.6);
    buf = this.ac.createBuffer(1, len, SAMPLE_RATE);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = this.rnd() * 2 - 1;
      if (color === 'white') d[i] = w;
      else if (color === 'pink') {
        // Paul Kellet's pink noise filter
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    this.noises.set(color, buf);
    return buf;
  }

  /** Filtered noise through an envelope: hiss, crack, whoosh, rumble. */
  noise(o: Env & { color?: 'white' | 'pink' | 'brown'; filter?: BiquadFilterType; f?: Pts; q?: number }) {
    const t = o.t ?? 0;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf(o.color ?? 'white');
    let node: AudioNode = src;
    if (o.filter) {
      const f = this.filter(o.filter, o.f ?? 1000, o.q ?? 0.7, t);
      src.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    src.start(t, this.rand(0, 0.5));
    src.stop(this.end(o));
  }

  /** An FM bell: bright at the strike, mellowing as it rings. ratio 2 is sweet, odd ratios are metallic. */
  bell(o: Env & { f: number; ratio?: number; index?: number }) {
    const t = o.t ?? 0;
    const ratio = o.ratio ?? 2;
    const index = o.index ?? 1;
    const car = this.ac.createOscillator();
    car.frequency.value = o.f;
    const mod = this.ac.createOscillator();
    mod.frequency.value = o.f * ratio;
    const mg = this.ac.createGain();
    const dev = o.f * ratio * index;
    mg.gain.setValueAtTime(dev, t);
    mg.gain.exponentialRampToValueAtTime(dev * 0.04 + 0.01, t + (o.a ?? 0.002) + (o.h ?? 0) + o.d * 0.7);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = this.ac.createGain();
    this.env(g.gain, o);
    car.connect(g);
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    car.start(t);
    mod.start(t);
    car.stop(stop);
    mod.stop(stop);
  }

  /** Sparse random clicks: debris, gravel, fireworks crackle, glass. */
  crackle(o: Env & { density: number; filter?: BiquadFilterType; f?: Pts; q?: number }) {
    const t = o.t ?? 0;
    const len = Math.ceil((this.end(o) - t) * SAMPLE_RATE);
    const buf = this.ac.createBuffer(1, Math.max(1, len), SAMPLE_RATE);
    const d = buf.getChannelData(0);
    const p = o.density / SAMPLE_RATE;
    for (let i = 0; i < len; i++) {
      if (this.rnd() >= p) continue;
      const amp = this.rand(0.3, 1) * (this.rnd() < 0.5 ? -1 : 1);
      const n = 6 + Math.floor(this.rnd() * 40);
      for (let k = 0; k < n && i + k < len; k++) d[i + k] += amp * Math.exp(-k / (n * 0.3)) * (this.rnd() * 2 - 1);
    }
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    if (o.filter) {
      const f = this.filter(o.filter, o.f ?? 3000, o.q ?? 0.7, t);
      src.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    src.start(t);
  }

  /** Brass: pairs of slightly detuned saws per note through a lowpass that opens and closes (the "wah"). */
  brass(o: Env & { notes: number[]; cut: Pts; q?: number; vib?: [number, number] }) {
    const t = o.t ?? 0;
    const f = this.filter('lowpass', o.cut, o.q ?? 1.2, t);
    const g = this.ac.createGain();
    this.env(g.gain, o);
    f.connect(g);
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    const per = 1 / Math.sqrt(o.notes.length * 2);
    for (const n of o.notes) {
      for (const cents of [-7, 7]) {
        const osc = this.ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = m(n);
        osc.detune.value = cents + this.rand(-3, 3);
        if (o.vib) {
          const lfo = this.ac.createOscillator();
          lfo.frequency.value = o.vib[0];
          const depth = this.ac.createGain();
          depth.gain.value = o.vib[1];
          lfo.connect(depth);
          depth.connect(osc.detune);
          lfo.start(t);
          lfo.stop(stop);
        }
        const lvl = this.ac.createGain();
        lvl.gain.value = per;
        osc.connect(lvl);
        lvl.connect(f);
        osc.start(t);
        osc.stop(stop);
      }
    }
  }

  /** A choir "aah": detuned saws with a slow vibrato through two vowel formants. */
  choir(o: Env & { notes: number[] }) {
    const t = o.t ?? 0;
    const sum = this.ac.createGain();
    const g = this.ac.createGain();
    this.env(g.gain, o);
    for (const [f, q, lvl] of [
      [800, 5, 1],
      [1150, 6, 0.7],
      [2900, 8, 0.25],
    ]) {
      const bp = this.filter('bandpass', f, q, t);
      const l = this.ac.createGain();
      l.gain.value = lvl * 2.2;
      sum.connect(bp);
      bp.connect(l);
      l.connect(g);
    }
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    const per = 1 / Math.sqrt(o.notes.length * 3);
    for (const n of o.notes) {
      for (const cents of [-11, 0, 10]) {
        const osc = this.ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = m(n);
        osc.detune.value = cents;
        const lfo = this.ac.createOscillator();
        lfo.frequency.value = this.rand(4.6, 5.6);
        const depth = this.ac.createGain();
        depth.gain.value = 14;
        lfo.connect(depth);
        depth.connect(osc.detune);
        const lvl = this.ac.createGain();
        lvl.gain.value = per;
        osc.connect(lvl);
        lvl.connect(sum);
        for (const x of [osc, lfo]) {
          x.start(t);
          x.stop(stop);
        }
      }
    }
  }
}

/** MIDI note number to Hz (60 = middle C). */
export const m = (n: number) => 440 * 2 ** ((n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
const semi = (s: number) => 2 ** (s / 12);

// ------------------------------------------------------------------ building blocks

/** A kick / timpani hit: a falling sine with a click, a little driven. */
export function drum(s: Synth, t: number, f: number, d: number, v: number, drive = 2) {
  const hot = s.drive(drive);
  s.tone({ t, f: [[0, f * 2.4], [0.025, f], [d, f * 0.55]], a: 0.001, d, v, to: hot });
  s.noise({ t, filter: 'bandpass', f: Math.min(9000, f * 7), q: 0.9, a: 0.0005, d: 0.03, v: v * 0.45 });
}

/** A cymbal crash. */
export function crash(s: Synth, t: number, d: number, v: number) {
  s.noise({ t, filter: 'highpass', f: [[0, 6500], [d, 3800]], q: 0.5, a: 0.002, d, v });
  s.noise({ t, filter: 'bandpass', f: 9500, q: 1.4, a: 0.001, d: d * 0.45, v: v * 0.6 });
  for (const f of [3150, 4720, 5980]) s.bell({ t, f: f * s.rand(0.97, 1.03), ratio: 1.47, index: 2.2, d: d * 0.55, v: v * 0.08 });
}

/** A shimmer of high bells and air. */
function sparkle(s: Synth, t: number, d: number, v: number, count = 6, lo = 2600, hi = 6400) {
  s.noise({ t, filter: 'highpass', f: 7500, q: 0.7, a: 0.03, d, v: v * 0.3 });
  for (let i = 0; i < count; i++) s.bell({ t: t + s.rand(0, d * 0.6), f: s.rand(lo, hi), ratio: 2, index: 0.5, d: s.rand(0.12, 0.32), v: v * s.rand(0.25, 0.6) });
}

/** Bell notes one after another. */
function arp(s: Synth, notes: number[], t: number, step: number, d: number, v: number, ratio = 2, index = 0.9) {
  notes.forEach((n, i) => s.bell({ t: t + i * step, f: m(n), ratio, index, d, v }));
}

/** Soft sustained chord of triangles (sweetens brass and bells). */
function pad(s: Synth, notes: number[], t: number, a: number, h: number, d: number, v: number) {
  for (const n of notes) s.tone({ type: 'triangle', f: m(n), t, a, h, d, v: v / Math.sqrt(notes.length) });
}

function whoosh(s: Synth, t: number, f0: number, f1: number, f2: number, d: number, v: number, q = 1.6) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, f0], [d * 0.4, f1], [d, f2]], q, a: d * 0.3, d: d * 0.7, v });
}

/** A gunshot: transient click, driven crack and body, sub thump, low tail. */
function gun(s: Synth, o: { crack: [number, number]; cd: number; body: [number, number]; bd: number; sub: number; sd: number; tail: number; td: number; drive: number }) {
  const r = s.rand(0.93, 1.07);
  s.noise({ filter: 'highpass', f: 3500, a: 0.0004, d: 0.012, v: 0.7 });
  const hot = s.drive(o.drive);
  s.noise({ filter: 'bandpass', f: [[0, o.crack[0] * r], [o.cd, o.crack[1]]], q: 0.9, a: 0.0006, d: o.cd, v: 1, to: hot });
  s.tone({ type: 'triangle', f: [[0, o.body[0] * r], [o.bd, o.body[1]]], a: 0.0006, d: o.bd, v: 0.9, to: hot });
  s.tone({ f: [[0, o.sub * r], [o.sd, o.sub * 0.4]], a: 0.002, d: o.sd, v: 0.7 });
  s.noise({ t: 0.008, color: 'brown', filter: 'lowpass', f: [[0, o.tail], [o.td, 160]], q: 0.5, a: 0.008, d: o.td, v: 0.4 });
}

function explosion(s: Synth, big: number) {
  s.noise({ filter: 'highpass', f: 4000, a: 0.0005, d: 0.02, v: 0.6 });
  s.tone({ f: [[0, 190], [0.1 * big, 50]], a: 0.001, d: 0.22 * big, v: 1, to: s.drive(5) });
  s.tone({ f: [[0, 70], [0.6 * big, 30]], a: 0.004, h: 0.04 * big, d: 0.9 * big, v: 0.9 });
  s.noise({ filter: 'lowpass', f: [[0, 5000], [0.25 * big, 700], [1.1 * big, 120]], q: 0.7, a: 0.002, d: 1.1 * big, v: 0.9, to: s.drive(6) });
  s.noise({ color: 'brown', filter: 'lowpass', f: [[0, 600], [1.2 * big, 80]], a: 0.01, d: 1.2 * big, v: 0.8 });
  s.crackle({ t: 0.05, density: 90, filter: 'highpass', f: 1800, a: 0.05, d: 0.7 * big, v: 0.45 });
}

/** A rising pentatonic run of bells (rewards). */
function cascade(s: Synth, root: number, n: number, t: number, step: number, v: number) {
  for (let i = 0; i < n; i++) s.bell({ t: t + i * step, f: m(root + PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length)), ratio: 2, index: 0.7, d: 0.35, v });
}

// ------------------------------------------------------------------ the sounds

export interface SoundDef {
  dur: number | ((n: number) => number);
  make: (s: Synth, n: number) => void;
  vol: number;
  cat: 'battle' | 'ui';
  vars?: number; // variants rendered (one is picked at random each time)
  levels?: number[]; // rendered once per level (n picks one)
  verb?: number; // reverb send
  gap?: number; // minimum seconds between two plays
  max?: number; // most copies playing at once
  jitter?: number; // random detune in cents
  rate?: (n: number) => number; // pitch from n (scales)
  duck?: number | ((n: number) => number); // how much it dips the battle while it plays
}

export const SOUNDS: Record<SoundName, SoundDef> = {
  // ---------------- guns
  pistol: {
    dur: 0.45, vars: 4, vol: 0.34, cat: 'battle', verb: 0.12, gap: 0.045, max: 5, jitter: 60,
    make: (s) => gun(s, { crack: [3200, 1400], cd: 0.09, body: [190, 55], bd: 0.09, sub: 95, sd: 0.14, tail: 900, td: 0.32, drive: 4 }),
  },
  smg: {
    dur: 0.3, vars: 4, vol: 0.24, cat: 'battle', verb: 0.08, gap: 0.04, max: 5, jitter: 70,
    make: (s) => gun(s, { crack: [3900, 1800], cd: 0.05, body: [240, 80], bd: 0.05, sub: 110, sd: 0.07, tail: 700, td: 0.16, drive: 4 }),
  },
  gatling: {
    dur: 0.22, vars: 3, vol: 0.17, cat: 'battle', verb: 0.06, gap: 0.05, max: 4, jitter: 80,
    make: (s) => gun(s, { crack: [4600, 2300], cd: 0.035, body: [300, 110], bd: 0.035, sub: 130, sd: 0.05, tail: 800, td: 0.09, drive: 5 }),
  },
  rifle: {
    dur: 0.95, vars: 3, vol: 0.4, cat: 'battle', verb: 0.2, gap: 0.06, max: 4, jitter: 40,
    make: (s) => {
      gun(s, { crack: [4200, 1200], cd: 0.14, body: [150, 42], bd: 0.16, sub: 72, sd: 0.3, tail: 1300, td: 0.6, drive: 5 });
      // the bolt: chk-chk
      for (const [t, f] of [
        [0.32, 2400],
        [0.41, 3100],
      ]) {
        s.noise({ t, filter: 'bandpass', f, q: 3, a: 0.0005, d: 0.022, v: 0.22 });
        s.bell({ t, f: f * 0.75, ratio: 2.7, index: 1.4, d: 0.05, v: 0.05 });
      }
    },
  },
  rocket: {
    dur: 0.85, vars: 2, vol: 0.36, cat: 'battle', verb: 0.2, gap: 0.08, max: 3, jitter: 50,
    make: (s) => {
      s.tone({ f: [[0, 110], [0.18, 40]], a: 0.001, d: 0.18, v: 0.9, to: s.drive(3) });
      s.noise({ filter: 'highpass', f: 2000, a: 0.0005, d: 0.05, v: 0.5 });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 400], [0.15, 2300], [0.65, 800]], q: 1.2, a: 0.02, h: 0.1, d: 0.5, v: 0.9 });
      s.crackle({ t: 0.02, density: 260, filter: 'highpass', f: 3000, a: 0.02, d: 0.5, v: 0.28 });
    },
  },
  rail: {
    dur: 0.95, vol: 0.42, cat: 'battle', verb: 0.3, gap: 0.08, max: 3, jitter: 40,
    make: (s) => {
      s.tone({ type: 'square', f: [[0, 2600], [0.18, 300]], lp: 6000, a: 0.001, d: 0.22, v: 0.35 });
      s.tone({ f: [[0, 5200], [0.12, 900]], a: 0.001, d: 0.15, v: 0.3 });
      s.tone({ type: 'sawtooth', f: [[0, 1800], [0.3, 140]], lp: [[0, 5000], [0.3, 600]], a: 0.001, d: 0.32, v: 0.3 });
      s.noise({ filter: 'highpass', f: [[0, 6000], [0.4, 3000]], a: 0.001, d: 0.4, v: 0.45 });
      s.tone({ f: [[0, 120], [0.2, 40]], d: 0.2, v: 0.7, to: s.drive(3) });
      s.bell({ t: 0.02, f: 1320, ratio: 2, index: 0.8, d: 0.6, v: 0.12 });
    },
  },
  cannon: {
    dur: 1.9, vol: 0.62, cat: 'battle', verb: 0.35, gap: 0.2, max: 2, duck: 0.25,
    make: (s) => {
      s.tone({ f: [[0, 75], [0.9, 28]], a: 0.002, d: 0.9, v: 1 });
      s.tone({ type: 'triangle', f: [[0, 170], [0.2, 40]], a: 0.001, d: 0.2, v: 0.9, to: s.drive(5) });
      s.noise({ color: 'brown', filter: 'lowpass', f: [[0, 2000], [1.2, 100]], a: 0.002, d: 1.2, v: 1, to: s.drive(4) });
      s.noise({ filter: 'bandpass', f: [[0, 1200], [0.3, 400]], q: 0.8, a: 0.001, d: 0.3, v: 0.6 });
      s.bell({ f: 220, ratio: 1.67, index: 1.2, d: 1, v: 0.15 });
      s.crackle({ t: 0.05, density: 60, filter: 'highpass', f: 1500, d: 0.8, v: 0.3 });
    },
  },
  throw: {
    dur: 0.32, vars: 2, vol: 0.26, cat: 'battle', gap: 0.07, max: 3, jitter: 80,
    make: (s) => whoosh(s, 0, 500, 2100, 700, 0.24, 0.9, 2.2),
  },
  shock: {
    dur: 0.6, vol: 0.32, cat: 'battle', verb: 0.25, gap: 0.08, max: 3, jitter: 50,
    make: (s) => {
      s.tone({ type: 'sawtooth', f: [[0, 900], [0.25, 200]], lp: [[0, 4000], [0.3, 800]], a: 0.004, d: 0.3, v: 0.3 });
      whoosh(s, 0, 2200, 1500, 600, 0.35, 0.8);
      s.bell({ f: 1760, ratio: 1.5, index: 1.5, d: 0.25, v: 0.15 });
    },
  },

  // ---------------- melee
  slash: {
    dur: 0.36, vars: 3, vol: 0.3, cat: 'battle', verb: 0.1, gap: 0.05, max: 4, jitter: 80,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1200], [0.08, 5200]], q: 1.6, a: 0.025, d: 0.08, v: 0.9 });
      s.bell({ t: 0.03, f: s.rand(3100, 3700), ratio: 1.53, index: 1.5, d: 0.18, v: 0.2 });
      s.noise({ t: 0.05, filter: 'bandpass', f: 1800, q: 1, a: 0.0005, d: 0.03, v: 0.35 });
    },
  },
  whack: {
    dur: 0.4, vars: 3, vol: 0.34, cat: 'battle', verb: 0.08, gap: 0.05, max: 4, jitter: 70,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 600], [0.06, 2200]], q: 1.5, a: 0.03, d: 0.05, v: 0.6 });
      s.tone({ t: 0.06, f: [[0, 330 * s.rand(0.92, 1.08)], [0.05, 170]], a: 0.001, d: 0.09, v: 1, to: s.drive(2) });
      s.noise({ t: 0.06, filter: 'bandpass', f: 900, q: 4, a: 0.0005, d: 0.06, v: 0.7 });
      s.tone({ t: 0.06, f: [[0, 110], [0.12, 50]], d: 0.12, v: 0.6 });
    },
  },
  bash: {
    dur: 0.6, vars: 2, vol: 0.34, cat: 'battle', verb: 0.15, gap: 0.06, max: 3, jitter: 60,
    make: (s) => {
      s.bell({ f: 420 * s.rand(0.95, 1.05), ratio: 2.76, index: 2, d: 0.45, v: 0.4 });
      s.bell({ f: 1130 * s.rand(0.95, 1.05), ratio: 1.41, index: 1.5, d: 0.3, v: 0.25 });
      s.tone({ f: [[0, 140], [0.15, 55]], a: 0.001, d: 0.15, v: 0.9, to: s.drive(2) });
      s.noise({ filter: 'bandpass', f: 2500, q: 1.2, a: 0.0005, d: 0.06, v: 0.5 });
    },
  },
  punch: {
    dur: 0.3, vars: 3, vol: 0.28, cat: 'battle', gap: 0.05, max: 4, jitter: 80,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 700], [0.04, 1600]], q: 1.2, a: 0.02, d: 0.03, v: 0.4 });
      s.noise({ t: 0.04, color: 'pink', filter: 'lowpass', f: [[0, 1800], [0.07, 400]], a: 0.001, d: 0.07, v: 0.8 });
      s.tone({ t: 0.04, f: [[0, 160], [0.1, 60]], a: 0.001, d: 0.1, v: 0.9, to: s.drive(2) });
    },
  },
  bonk: {
    // the riot ram bowling foxes over: each fox in the same charge rings a step higher
    dur: 0.5, vol: 0.4, cat: 'battle', verb: 0.15, gap: 0.03, max: 6,
    rate: (n) => semi(MAJOR[Math.min(Math.max(0, n - 1), MAJOR.length - 1)]),
    make: (s) => {
      s.tone({ type: 'triangle', f: [[0, 520], [0.08, 380]], a: 0.001, d: 0.14, v: 0.6 });
      s.noise({ filter: 'bandpass', f: 1400, q: 5, a: 0.0005, d: 0.04, v: 0.6 });
      s.tone({ f: [[0, 130], [0.15, 50]], a: 0.001, d: 0.15, v: 0.9, to: s.drive(2) });
      s.bell({ f: 1040, ratio: 2.76, index: 1, d: 0.2, v: 0.12 });
    },
  },

  swoosh: {
    // a swing that cuts only air (melee misses, the brute's club coming down, the ninja's dash, a charge starting)
    dur: 0.28, vars: 2, vol: 0.16, cat: 'battle', gap: 0.05, max: 3, jitter: 120,
    make: (s) => whoosh(s, 0, 350, 1600, 500, 0.18, 0.8, 1.8),
  },

  // ---------------- impacts and knock-outs
  thwack: {
    // a heavy rifle round landing: a deep driven thump and a slap
    dur: 0.3, vars: 2, vol: 0.3, cat: 'battle', gap: 0.05, max: 3, jitter: 60,
    make: (s) => {
      s.tone({ f: [[0, 150], [0.09, 48]], a: 0.0008, d: 0.12, v: 1, to: s.drive(3) });
      s.noise({ filter: 'bandpass', f: [[0, 1400], [0.05, 500]], q: 1.2, a: 0.0005, d: 0.07, v: 0.8 });
    },
  },
  ricochet: {
    // a bullet glancing off the road or a riot shield: the classic falling whine
    dur: 0.35, vars: 3, vol: 0.14, cat: 'battle', verb: 0.15, gap: 0.1, max: 2, jitter: 150,
    make: (s) => {
      s.tone({ f: [[0, 3200 * s.rand(0.9, 1.1)], [0.25, 1400]], a: 0.001, d: 0.25, v: 0.25, vib: [30, 60] });
      s.noise({ filter: 'highpass', f: 5000, a: 0.0005, d: 0.02, v: 0.3 });
    },
  },
  zap: {
    // a railgun beam frying a fox; each fox further along the beam zings higher
    dur: 0.25, vol: 0.22, cat: 'battle', gap: 0.04, max: 4,
    rate: (n) => semi(Math.min(n, 6) * 2),
    make: (s) => {
      s.crackle({ density: 300, filter: 'bandpass', f: 4000, q: 1, a: 0.001, d: 0.15, v: 0.6 });
      s.tone({ type: 'square', f: [[0, 1200], [0.1, 400]], lp: 5000, d: 0.12, v: 0.2 });
    },
  },
  pin: {
    // a grenade pin pulled
    dur: 0.2, vol: 0.12, cat: 'battle', gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      s.bell({ f: 2900, ratio: 2.4, index: 1, d: 0.12, v: 0.4 });
      s.noise({ filter: 'highpass', f: 3500, a: 0.0005, d: 0.01, v: 0.3 });
    },
  },
  fizz: {
    // the bomber lighting its homemade rocket's fuse
    dur: 0.4, vol: 0.14, cat: 'battle', gap: 0.2, max: 2, jitter: 80,
    make: (s) => {
      s.noise({ filter: 'highpass', f: [[0, 4000], [0.3, 6000]], a: 0.01, h: 0.15, d: 0.15, v: 0.4 });
      s.crackle({ density: 120, filter: 'highpass', f: 3000, d: 0.3, v: 0.3 });
    },
  },
  hit: {
    dur: 0.2, vars: 4, vol: 0.2, cat: 'battle', gap: 0.035, max: 4, jitter: 90,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: [[0, 1600 * s.rand(0.85, 1.15)], [0.04, 700]], q: 1.4, a: 0.0005, d: 0.05, v: 0.9 });
      s.tone({ f: [[0, 180], [0.06, 70]], a: 0.0008, d: 0.07, v: 0.8, to: s.drive(2) });
      s.noise({ filter: 'highpass', f: 4000, a: 0.0003, d: 0.006, v: 0.4 });
    },
  },
  crit: {
    dur: 0.75, vol: 0.34, cat: 'battle', verb: 0.3, gap: 0.06, max: 3, jitter: 40,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: [[0, 1800], [0.05, 700]], q: 1.2, a: 0.0005, d: 0.06, v: 1 });
      s.tone({ f: [[0, 200], [0.08, 60]], a: 0.0008, d: 0.09, v: 0.9, to: s.drive(3) });
      s.bell({ t: 0.008, f: 2637, ratio: 2, index: 1.6, d: 0.5, v: 0.5 });
      s.bell({ t: 0.05, f: 3951, ratio: 2, index: 1, d: 0.35, v: 0.25 });
      s.noise({ t: 0.01, filter: 'highpass', f: 7000, a: 0.002, d: 0.2, v: 0.2 });
    },
  },
  boom: {
    dur: 1.7, vars: 3, vol: 0.5, cat: 'battle', verb: 0.3, gap: 0.06, max: 4, jitter: 70,
    make: (s) => explosion(s, 1),
  },
  pop: {
    dur: 0.6, vars: 3, vol: 0.3, cat: 'battle', verb: 0.15, gap: 0.035, max: 5, jitter: 120,
    make: (s) => {
      s.tone({ f: [[0, 260], [0.1, 70]], a: 0.001, d: 0.1, v: 1, to: s.drive(3) });
      s.noise({ filter: 'lowpass', f: [[0, 3000], [0.25, 300]], a: 0.001, d: 0.25, v: 0.7, to: s.drive(3) });
      s.tone({ f: [[0, 90], [0.25, 40]], d: 0.25, v: 0.5 });
      s.crackle({ t: 0.02, density: 70, filter: 'highpass', f: 2000, d: 0.3, v: 0.3 });
    },
  },
  ko: {
    // a cartoon poof; rises a little with the combo
    dur: 0.55, vars: 3, vol: 0.3, cat: 'battle', verb: 0.2, gap: 0.035, max: 4, jitter: 50,
    rate: (n) => 1 + Math.min(n, 20) * 0.012,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 800], [0.25, 2500]], q: 0.8, a: 0.01, d: 0.3, v: 0.7 });
      const r = s.rand(0.95, 1.05);
      s.tone({ f: [[0, 380 * r], [0.08, 980 * r]], a: 0.004, d: 0.12, v: 0.45 });
      s.tone({ f: [[0, 140], [0.1, 60]], a: 0.001, d: 0.1, v: 0.7, to: s.drive(2) });
    },
  },
  down: {
    // a rabbit knocked out: a sad cartoon "bwoo"
    dur: 0.75, vol: 0.32, cat: 'battle', verb: 0.2, gap: 0.08, max: 3, jitter: 40,
    make: (s) => {
      s.tone({ type: 'triangle', f: [[0, 520], [0.45, 180]], lp: 2500, a: 0.01, h: 0.1, d: 0.45, v: 0.5, vib: [9, 40] });
      s.tone({ t: 0.02, f: [[0, 120], [0.15, 50]], d: 0.15, v: 0.6 });
      s.noise({ color: 'pink', filter: 'lowpass', f: 1200, d: 0.2, v: 0.3 });
    },
  },
  combo: {
    // a marimba-bell that climbs a pentatonic scale with the kill streak
    dur: 0.6, vol: 0.28, cat: 'ui', verb: 0.35, gap: 0.04, max: 4,
    rate: (n) => semi(PENTA[Math.min(Math.max(0, n - 2), 10)]),
    make: (s) => {
      const f = m(76);
      s.bell({ f, ratio: 1, index: 1.2, d: 0.45, v: 0.6 });
      s.tone({ f: f * 2, a: 0.001, d: 0.2, v: 0.2 });
      s.tone({ f, a: 0.002, d: 0.5, v: 0.35 });
      s.bell({ f: f * 4, ratio: 3.5, index: 0.4, d: 0.08, v: 0.08 });
    },
  },
  comboBig: {
    dur: 1.5, vol: 0.45, cat: 'ui', verb: 0.4, gap: 0.5,
    make: (s) => {
      cascade(s, 79, 7, 0, 0.045, 0.4);
      s.noise({ t: 0.32, filter: 'bandpass', f: 1500, q: 2, a: 0.0005, d: 0.05, v: 0.6 });
      s.bell({ t: 0.36, f: 2637, ratio: 2.4, index: 1.2, d: 0.7, v: 0.45 });
      s.bell({ t: 0.38, f: 3520, ratio: 2, index: 0.8, d: 0.6, v: 0.25 });
      sparkle(s, 0.36, 0.8, 0.4, 8);
    },
  },
  coin: {
    dur: 0.5, vars: 2, vol: 0.2, cat: 'ui', verb: 0.25, gap: 0.045, max: 3, jitter: 20,
    make: (s) => {
      s.bell({ f: 1976, ratio: 2, index: 0.8, d: 0.12, v: 0.5 });
      s.bell({ t: 0.06, f: 2637, ratio: 2, index: 0.8, d: 0.35, v: 0.6 });
    },
  },
  leak: {
    // uh-oh: a fox ran off with carrots
    dur: 0.75, vol: 0.45, cat: 'battle', verb: 0.15, gap: 0.12, max: 2,
    make: (s) => {
      s.tone({ type: 'square', f: m(74), lp: 2200, a: 0.01, h: 0.1, d: 0.06, v: 0.45 });
      s.tone({ t: 0.17, type: 'square', f: [[0, m(70)], [0.4, m(68)]], lp: 1800, a: 0.01, h: 0.18, d: 0.22, v: 0.45 });
      s.noise({ t: 0.02, filter: 'bandpass', f: 2500, q: 1, d: 0.05, v: 0.4 });
      s.tone({ f: [[0, 120], [0.15, 50]], d: 0.15, v: 0.6 });
    },
  },
  yell: {
    // a fox pack charges: a short brass "HUP!"
    dur: 0.6, vol: 0.26, cat: 'battle', verb: 0.2, gap: 0.6, max: 2, jitter: 60,
    make: (s) => {
      s.brass({ notes: [43, 50], cut: [[0, 250], [0.05, 1500], [0.35, 400]], a: 0.015, h: 0.08, d: 0.25, v: 0.5 });
      drum(s, 0, 70, 0.2, 0.6);
    },
  },

  // ---------------- fox skills
  blink: {
    // a teleport: sucked in, a pop of smoke, a shimmer
    dur: 0.6, vol: 0.32, cat: 'battle', verb: 0.35, gap: 0.08, max: 3, jitter: 80,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 4500], [0.12, 700]], q: 2, a: 0.1, d: 0.03, v: 0.7 });
      s.tone({ t: 0.12, f: [[0, 300], [0.08, 900]], a: 0.002, d: 0.1, v: 0.5 });
      s.noise({ t: 0.12, color: 'pink', filter: 'lowpass', f: [[0, 2500], [0.3, 400]], a: 0.004, d: 0.3, v: 0.6 });
      sparkle(s, 0.14, 0.35, 0.3, 4, 3500, 7000);
    },
  },
  dodge: {
    // a quick side-step: fwip
    dur: 0.25, vars: 2, vol: 0.22, cat: 'battle', gap: 0.06, max: 3, jitter: 120,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1800], [0.1, 4500]], q: 2.5, a: 0.02, d: 0.08, v: 0.9 });
      s.tone({ f: [[0, 900], [0.06, 1500]], a: 0.002, d: 0.05, v: 0.15 });
    },
  },
  sprint: {
    // a burst of speed: zoom
    dur: 0.5, vol: 0.2, cat: 'battle', gap: 0.15, max: 2, jitter: 100,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 600], [0.18, 2800], [0.4, 1200]], q: 1.8, a: 0.04, d: 0.32, v: 0.8 });
      s.tone({ type: 'triangle', f: [[0, 300], [0.25, 650]], lp: 2000, a: 0.02, d: 0.25, v: 0.12 });
    },
  },
  rush: {
    // a brute charges: a snort, a low horn and stomping
    dur: 0.9, vol: 0.4, cat: 'battle', verb: 0.2, gap: 0.3, max: 2,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 900], [0.12, 400]], q: 1.5, a: 0.01, d: 0.12, v: 0.6 });
      s.brass({ t: 0.05, notes: [36, 43], cut: [[0, 200], [0.06, 1200], [0.4, 300]], a: 0.02, h: 0.15, d: 0.3, v: 0.6 });
      for (const t of [0.08, 0.26, 0.44]) drum(s, t, 60, 0.15, 0.6, 2);
    },
  },
  smoke: {
    // a smoke bomb: a pop and a long hiss
    dur: 1.1, vol: 0.3, cat: 'battle', verb: 0.25, gap: 0.3, max: 2,
    make: (s) => {
      drum(s, 0, 140, 0.1, 0.6, 2);
      s.noise({ filter: 'highpass', f: [[0, 2500], [1, 5000]], a: 0.03, h: 0.2, d: 0.8, v: 0.5 });
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 1500], [0.8, 300]], a: 0.02, d: 0.8, v: 0.4 });
    },
  },
  roar: {
    // Big Red's war cry: a growling brass roar and drums
    dur: 1.6, vol: 0.5, cat: 'battle', verb: 0.4, gap: 2, duck: 0.25,
    make: (s) => {
      s.brass({ notes: [31, 38, 43], cut: [[0, 300], [0.15, 1800], [1.2, 400]], a: 0.06, h: 0.6, d: 0.6, v: 0.7, vib: [9, 40] });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 400], [0.3, 900], [1, 300]], q: 2, a: 0.05, h: 0.5, d: 0.5, v: 0.4 });
      drum(s, 0, 50, 0.6, 1, 3);
      drum(s, 0.3, 45, 0.6, 0.8, 3);
    },
  },

  // ---------------- the wave
  wave: {
    // the wave starts: a war horn "da-DAAA" and a drum
    dur: 1.9, vol: 0.5, cat: 'ui', verb: 0.4, gap: 0.5,
    make: (s) => {
      drum(s, 0, 55, 0.5, 1, 3);
      s.brass({ notes: [43, 50, 55], cut: [[0, 300], [0.06, 2200], [0.3, 600]], a: 0.02, h: 0.1, d: 0.15, v: 0.55 });
      s.brass({ t: 0.22, notes: [48, 55, 60, 64], cut: [[0, 300], [0.1, 2600], [1.2, 700]], a: 0.04, h: 0.35, d: 0.75, v: 0.6 });
      drum(s, 0.22, 65, 0.6, 0.9, 3);
      crash(s, 0.22, 1, 0.25);
    },
  },
  boss: {
    // DUN... DUNNN: an ominous minor chord, deep drums
    dur: 2.5, vol: 0.6, cat: 'ui', verb: 0.45, gap: 1, duck: 0.4,
    make: (s) => {
      drum(s, 0, 45, 1, 1, 3);
      s.brass({ notes: [38, 45, 50], cut: [[0, 200], [0.05, 1400], [0.3, 400]], a: 0.02, h: 0.12, d: 0.25, v: 0.5 });
      s.brass({ t: 0.45, notes: [38, 41, 45, 50], cut: [[0, 200], [0.3, 1600], [1.9, 400]], a: 0.06, h: 0.6, d: 1.2, v: 0.6 });
      drum(s, 0.45, 40, 1.4, 1, 3);
      s.noise({ t: 0.45, color: 'brown', filter: 'lowpass', f: 300, a: 0.1, h: 0.5, d: 1, v: 0.4 });
    },
  },
  bossDown: {
    // Big Red goes down: a huge blast, then a victory sting
    dur: 2.8, vol: 0.62, cat: 'ui', verb: 0.45, gap: 1, duck: 0.4,
    make: (s) => {
      explosion(s, 1.5);
      s.brass({ t: 0.3, notes: [60, 64, 67, 72], cut: [[0, 500], [0.1, 3200], [1.6, 900]], a: 0.03, h: 0.4, d: 1.2, v: 0.45 });
      crash(s, 0.3, 1.6, 0.4);
      cascade(s, 72, 8, 0.32, 0.05, 0.3);
    },
  },
  bomb: {
    // the carrot airstrike falling: a cartoon bomb whistle (it explodes as it lands, half a second later)
    dur: 0.65, vol: 0.32, cat: 'battle', verb: 0.2, gap: 0.2,
    make: (s) => {
      s.tone({ f: [[0, 2300], [0.48, 620]], a: 0.02, h: 0.3, d: 0.2, v: 0.45, vib: [7, 30] });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1600], [0.5, 500]], q: 2, a: 0.08, d: 0.45, v: 0.15 });
    },
  },
  bombReady: {
    dur: 0.7, vol: 0.28, cat: 'ui', verb: 0.35, gap: 1,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 800], [0.15, 3000]], q: 2, a: 0.08, d: 0.08, v: 0.3 });
      arp(s, [88, 93], 0.1, 0.08, 0.4, 0.5);
    },
  },
  clear: {
    // the wave is cleared: a bright jingle
    dur: 1.7, vol: 0.5, cat: 'ui', verb: 0.45, gap: 0.5,
    make: (s) => {
      arp(s, [72, 76, 79, 84], 0, 0.075, 0.45, 0.5);
      pad(s, [84, 88, 91], 0.3, 0.01, 0.15, 0.9, 0.35);
      s.brass({ t: 0.3, notes: [60, 64, 67], cut: [[0, 500], [0.1, 2500], [1, 800]], a: 0.02, h: 0.2, d: 0.8, v: 0.4 });
      sparkle(s, 0.3, 0.8, 0.4);
      drum(s, 0.3, 80, 0.3, 0.6);
    },
  },
  stageClear: {
    // a full fanfare: I - IV - V - I with timpani and a cymbal
    dur: 3.3, vol: 0.6, cat: 'ui', verb: 0.5, gap: 1, duck: 0.4,
    make: (s) => {
      const hits: [number, number[], number][] = [
        [0, [60, 64, 67, 72], 98],
        [0.28, [65, 69, 72], 87],
        [0.56, [67, 71, 74], 98],
      ];
      for (const [t, notes, f] of hits) {
        s.brass({ t, notes, cut: [[0, 500], [0.05, 3000], [0.3, 900]], a: 0.015, h: 0.12, d: 0.2, v: 0.55 });
        drum(s, t, f * 0.6, 0.35, 0.7, 2);
      }
      s.brass({ t: 0.86, notes: [60, 67, 72, 76, 79], cut: [[0, 500], [0.1, 3400], [2.2, 900]], a: 0.03, h: 0.7, d: 1.6, v: 0.6 });
      drum(s, 0.86, 42, 1, 1, 3);
      crash(s, 0.86, 1.8, 0.5);
      arp(s, [84, 88, 91, 96], 0.9, 0.07, 0.6, 0.35);
      sparkle(s, 1, 1.5, 0.5, 10);
    },
  },
  defeat: {
    // the sad trombone: wah wah wah waaah
    dur: 2.9, vol: 0.55, cat: 'ui', verb: 0.35, gap: 2, duck: 0.6,
    make: (s) => {
      [58, 57, 56].forEach((n, i) => s.brass({ t: i * 0.38, notes: [n], cut: [[0, 300], [0.08, 1400], [0.3, 500]], a: 0.03, h: 0.18, d: 0.12, v: 0.7 }));
      s.brass({ t: 1.14, notes: [55], cut: [[0, 300], [0.1, 1300], [1.4, 350]], a: 0.04, h: 0.6, d: 0.9, v: 0.7, vib: [5.5, 38] });
    },
  },
  star: {
    // a reward star pops in (each one higher)
    dur: 0.8, vol: 0.45, cat: 'ui', verb: 0.4, gap: 0.1,
    rate: (n) => semi(Math.min(n, 4) * 4),
    make: (s) => {
      drum(s, 0, 150, 0.1, 0.4);
      s.bell({ f: m(88), ratio: 2, index: 1, d: 0.6, v: 0.5 });
      s.bell({ t: 0.04, f: m(95), ratio: 2, index: 0.7, d: 0.5, v: 0.3 });
      sparkle(s, 0.03, 0.5, 0.3, 5);
    },
  },
  gems: {
    dur: 1.2, vol: 0.35, cat: 'ui', verb: 0.45, gap: 0.5,
    make: (s) => {
      cascade(s, 84, 10, 0, 0.035, 0.25);
      sparkle(s, 0.1, 0.8, 0.35, 6, 4000, 8000);
    },
  },
  launch: {
    // a firework rocket whistling up
    dur: 1, vars: 2, vol: 0.17, cat: 'battle', verb: 0.3, gap: 0.08, max: 4, jitter: 150,
    make: (s) => {
      s.tone({ f: [[0, 700], [0.8, 2500]], a: 0.05, h: 0.45, d: 0.3, v: 0.22, vib: [16, 30] });
      s.noise({ filter: 'highpass', f: 3500, a: 0.02, d: 0.7, v: 0.25 });
      s.tone({ f: [[0, 140], [0.08, 60]], d: 0.08, v: 0.4 });
    },
  },
  firework: {
    // the burst: a thump and a long sparkly crackle
    dur: 1.7, vars: 2, vol: 0.3, cat: 'battle', verb: 0.5, gap: 0.08, max: 4, jitter: 100,
    make: (s) => {
      drum(s, 0, 70, 0.2, 0.8, 3);
      s.noise({ filter: 'lowpass', f: [[0, 4000], [0.5, 300]], d: 0.5, v: 0.6 });
      s.crackle({ t: 0.12, density: 70, filter: 'highpass', f: 3000, a: 0.1, d: 1.1, v: 0.55 });
    },
  },

  // ---------------- the run to the next street
  charge: {
    // legs spinning up before the blast-off
    dur: 0.65, vol: 0.35, cat: 'battle', verb: 0.15,
    make: (s) => {
      for (const detune of [-12, 12]) s.tone({ type: 'sawtooth', f: [[0, 80], [0.5, 640]], lp: [[0, 300], [0.5, 3200]], a: 0.05, h: 0.32, d: 0.15, v: 0.3, detune });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 300], [0.5, 2600]], q: 1.5, a: 0.1, h: 0.28, d: 0.15, v: 0.5 });
    },
  },
  run: {
    // 19 km in 2 seconds: a huge whoosh and wind
    dur: 2.1, vol: 0.45, cat: 'battle', verb: 0.2,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 250], [0.25, 3200], [1.9, 500]], q: 0.9, a: 0.03, h: 0.35, d: 1.4, v: 0.9 });
      s.noise({ color: 'brown', filter: 'lowpass', f: 300, a: 0.05, h: 0.9, d: 0.8, v: 0.5 });
      drum(s, 0, 50, 0.5, 0.9, 3);
    },
  },
  skid: {
    dur: 0.75, vol: 0.35, cat: 'battle', verb: 0.15,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: [[0, 3100], [0.6, 1900]], q: 7, a: 0.01, h: 0.25, d: 0.35, v: 0.9 });
      s.noise({ filter: 'bandpass', f: [[0, 2400], [0.6, 1500]], q: 9, a: 0.01, h: 0.25, d: 0.35, v: 0.6 });
      s.noise({ color: 'pink', filter: 'lowpass', f: 700, a: 0.02, h: 0.2, d: 0.4, v: 0.45 });
      s.crackle({ density: 120, filter: 'bandpass', f: 1500, a: 0.01, d: 0.5, v: 0.25 });
    },
  },
  land: {
    dur: 0.6, vol: 0.4, cat: 'battle', verb: 0.15,
    make: (s) => {
      drum(s, 0, 55, 0.25, 1, 2);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 1100], [0.3, 200]], a: 0.005, d: 0.3, v: 0.7 });
      s.crackle({ t: 0.01, density: 80, filter: 'bandpass', f: 1200, d: 0.2, v: 0.25 });
    },
  },

  // ---------------- the grid
  click: {
    dur: 0.12, vol: 0.28, cat: 'ui', gap: 0.03,
    make: (s) => {
      s.tone({ f: [[0, 1900], [0.02, 1500]], a: 0.0005, d: 0.03, v: 0.5 });
      s.noise({ filter: 'highpass', f: 4000, a: 0.0003, d: 0.006, v: 0.5 });
      s.tone({ f: [[0, 700], [0.03, 500]], a: 0.0005, d: 0.03, v: 0.3 });
    },
  },
  pick: {
    // lifting a piece: a soft rising plip
    dur: 0.16, vol: 0.3, cat: 'ui', gap: 0.03, jitter: 40,
    make: (s) => {
      s.tone({ f: [[0, 520], [0.04, 880]], a: 0.002, d: 0.06, v: 0.7 });
      s.noise({ filter: 'bandpass', f: 3000, q: 1.5, a: 0.0005, d: 0.008, v: 0.3 });
    },
  },
  drop: {
    // setting a piece down: a woody thock
    dur: 0.25, vars: 2, vol: 0.32, cat: 'ui', gap: 0.03, jitter: 50,
    make: (s) => {
      s.tone({ f: [[0, 300], [0.04, 200]], a: 0.0008, d: 0.07, v: 0.9 });
      s.noise({ filter: 'bandpass', f: 1100 * s.rand(0.9, 1.1), q: 3, a: 0.0005, d: 0.025, v: 0.5 });
      s.tone({ f: [[0, 110], [0.08, 70]], d: 0.08, v: 0.4 });
    },
  },
  denied: {
    dur: 0.35, vol: 0.3, cat: 'ui', gap: 0.15,
    make: (s) => {
      s.tone({ type: 'square', f: 330, lp: 1500, a: 0.004, d: 0.07, v: 0.4 });
      s.tone({ t: 0.09, type: 'square', f: 247, lp: 1300, a: 0.004, d: 0.12, v: 0.4 });
    },
  },
  merge: {
    // two pieces become one (n = the new class, D to B; A and up get the reveal fanfare): a juicy pop and a chime,
    // a step higher for every class
    dur: 1, levels: [2, 3, 4], vol: 0.45, cat: 'ui', verb: 0.4, gap: 0.05,
    make: (s, n) => {
      const root = 81 + (n - 2) * 2;
      s.tone({ f: [[0, 250], [0.06, 720]], a: 0.002, d: 0.07, v: 0.7 });
      s.noise({ filter: 'bandpass', f: 2000, q: 1, a: 0.0005, d: 0.01, v: 0.4 });
      drum(s, 0, 120, 0.12, 0.4);
      arp(s, [root, root + 7, root + 12], 0.03, 0.045, 0.35, 0.45);
      sparkle(s, 0.08, 0.4, 0.25, 4);
    },
  },
  sell: {
    // ka-ching
    dur: 0.95, vol: 0.4, cat: 'ui', verb: 0.3, gap: 0.1,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 1500, q: 2, a: 0.0005, d: 0.05, v: 0.6 });
      s.tone({ f: [[0, 200], [0.08, 90]], d: 0.08, v: 0.6 });
      s.bell({ t: 0.08, f: 2637, ratio: 2.4, index: 1.2, d: 0.6, v: 0.6 });
      s.bell({ t: 0.1, f: 3520, ratio: 2, index: 0.8, d: 0.5, v: 0.3 });
      s.crackle({ t: 0.1, density: 120, filter: 'highpass', f: 4000, d: 0.3, v: 0.25 });
    },
  },
  unlock: {
    // a new grid cell: ka-chunk, then a sparkly chime
    dur: 1.2, vol: 0.45, cat: 'ui', verb: 0.4, gap: 0.2,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 1800, q: 2, a: 0.0005, d: 0.03, v: 0.8 });
      s.tone({ f: [[0, 200], [0.1, 90]], d: 0.1, v: 0.7 });
      s.noise({ t: 0.1, filter: 'bandpass', f: 2800, q: 2, a: 0.0005, d: 0.025, v: 0.6 });
      s.tone({ t: 0.1, f: [[0, 320], [0.06, 150]], d: 0.06, v: 0.4 });
      arp(s, [84, 88, 91, 96], 0.16, 0.05, 0.5, 0.4);
      sparkle(s, 0.2, 0.6, 0.35);
    },
  },
  evoReady: {
    // a new evolution is possible: a gentle magic chime
    dur: 0.9, vol: 0.3, cat: 'ui', verb: 0.5, gap: 0.3,
    make: (s) => {
      arp(s, [79, 86], 0, 0.1, 0.7, 0.4, 3.5, 0.5);
      sparkle(s, 0.05, 0.6, 0.25, 4, 4000, 8000);
    },
  },
  evoRise: {
    // the pieces rise and swirl together
    dur: 1.35, vol: 0.4, cat: 'ui', verb: 0.5, gap: 0.3,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 300], [1.15, 5200]], q: 3, a: 1, d: 0.2, v: 0.6 });
      for (const detune of [-10, 10]) s.tone({ type: 'sawtooth', f: [[0, 110], [1.1, 440]], lp: [[0, 500], [1.1, 5000]], a: 0.9, h: 0.1, d: 0.2, v: 0.15, detune });
      for (let i = 0; i < 10; i++) s.bell({ t: 0.15 + i * 0.1, f: m(72 + PENTA[i]), ratio: 2, index: 0.6, d: 0.25, v: 0.12 });
    },
  },
  evolve: {
    dur: 2.5, vol: 0.6, cat: 'ui', verb: 0.55, gap: 0.5, duck: 0.5,
    make: (s) => {
      drum(s, 0, 60, 0.6, 1, 3);
      crash(s, 0, 1.6, 0.5);
      s.brass({ notes: [60, 64, 67, 72], cut: [[0, 800], [0.1, 3500], [2, 1200]], a: 0.02, h: 0.5, d: 1.5, v: 0.4 });
      pad(s, [84, 88, 91, 96], 0, 0.01, 0.3, 1.2, 0.3);
      arp(s, [72, 76, 79, 84, 88, 91], 0.05, 0.06, 0.5, 0.35);
      sparkle(s, 0.2, 1.6, 0.5, 10);
    },
  },
  awaken: {
    dur: 3.3, vol: 0.65, cat: 'ui', verb: 0.6, gap: 0.5, duck: 0.6,
    make: (s) => {
      drum(s, 0, 50, 0.8, 1, 4);
      crash(s, 0, 2, 0.55);
      s.bell({ f: m(36), ratio: 1.41, index: 3, d: 2.8, v: 0.35 });
      s.brass({ notes: [48, 60, 64, 67, 72], cut: [[0, 800], [0.12, 3800], [2.6, 1100]], a: 0.03, h: 0.7, d: 1.8, v: 0.45 });
      s.choir({ t: 0.15, notes: [60, 67, 72, 76], a: 0.3, h: 0.9, d: 1.3, v: 0.3 });
      arp(s, [72, 76, 79, 84, 88, 91, 96, 100], 0.05, 0.055, 0.6, 0.35);
      sparkle(s, 0.3, 2.2, 0.55, 16);
    },
  },

  // ---------------- cases
  caseIn: {
    dur: 0.5, vol: 0.35, cat: 'ui', gap: 0.2,
    make: (s) => {
      whoosh(s, 0, 400, 1800, 600, 0.4, 0.8, 1.8);
      s.crackle({ t: 0.05, density: 40, filter: 'highpass', f: 2500, d: 0.3, v: 0.25 });
    },
  },
  thud: {
    // the case lands
    dur: 0.8, vol: 0.5, cat: 'ui', verb: 0.2, gap: 0.2,
    make: (s) => {
      drum(s, 0, 60, 0.35, 1, 3);
      s.noise({ color: 'brown', filter: 'lowpass', f: [[0, 800], [0.4, 150]], d: 0.4, v: 0.8 });
      s.bell({ t: 0.015, f: 320, ratio: 2.76, index: 1.5, d: 0.35, v: 0.18 });
      s.bell({ t: 0.015, f: 870, ratio: 1.7, index: 1.2, d: 0.25, v: 0.1 });
      s.noise({ t: 0.02, color: 'pink', filter: 'lowpass', f: 1200, d: 0.25, v: 0.3 });
    },
  },
  caseOpen: {
    // the lid bursts open
    dur: 1.2, vol: 0.45, cat: 'ui', verb: 0.45, gap: 0.2,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 3200, q: 3, a: 0.0005, d: 0.02, v: 0.7 });
      s.tone({ type: 'square', f: [[0, 1400], [0.02, 900]], lp: 3000, a: 0.0005, d: 0.025, v: 0.2 });
      drum(s, 0.04, 110, 0.15, 0.7);
      s.noise({ t: 0.04, filter: 'highpass', f: [[0, 1500], [0.5, 6000]], a: 0.03, d: 0.5, v: 0.3 });
      arp(s, [84, 88, 91, 96], 0.08, 0.05, 0.5, 0.35);
      sparkle(s, 0.1, 0.9, 0.4, 8);
    },
  },
  tick: {
    // a piece flicking past in the roll: rarer pieces tick a little higher
    dur: 0.08, vol: 0.22, cat: 'ui', gap: 0.022, max: 4,
    rate: (n) => 1 + Math.max(0, n - 1) * 0.05,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 3200, q: 2.5, a: 0.0004, d: 0.012, v: 0.9 });
      s.tone({ type: 'triangle', f: [[0, 2400], [0.02, 1700]], a: 0.0004, d: 0.025, v: 0.35 });
    },
  },
  tock: {
    // weight under the last slow flicks
    dur: 0.25, vol: 0.3, cat: 'ui', gap: 0.05,
    make: (s) => {
      s.tone({ f: [[0, 560], [0.03, 430]], a: 0.001, d: 0.09, v: 0.9 });
      s.noise({ filter: 'bandpass', f: 1300, q: 5, a: 0.0005, d: 0.03, v: 0.5 });
      s.tone({ f: [[0, 190], [0.1, 120]], d: 0.12, v: 0.5 });
    },
  },
  rumble: {
    // suspense before a rare prize
    dur: 0.75, vol: 0.4, cat: 'ui', gap: 0.25,
    make: (s) => {
      s.tone({ f: [[0, 50], [0.6, 42]], a: 0.06, h: 0.25, d: 0.35, v: 0.9 });
      s.noise({ color: 'brown', filter: 'lowpass', f: 220, a: 0.06, h: 0.25, d: 0.35, v: 0.8 });
      s.crackle({ density: 30, filter: 'lowpass', f: 600, a: 0.05, d: 0.5, v: 0.2 });
    },
  },
  crack: {
    // the medallion cracking: sharper for higher classes
    dur: 0.35, vars: 3, vol: 0.35, cat: 'ui', verb: 0.25, gap: 0.05, max: 3,
    rate: (n) => 1 + Math.max(0, n - 3) * 0.06,
    make: (s) => {
      s.noise({ filter: 'highpass', f: 3500, a: 0.0005, d: 0.015, v: 0.9 });
      s.crackle({ density: 260, filter: 'bandpass', f: 4200, q: 0.8, a: 0.001, d: 0.16, v: 0.7 });
      s.bell({ f: 3300 * s.rand(0.9, 1.1), ratio: 1.83, index: 1.2, d: 0.12, v: 0.15 });
      s.tone({ f: [[0, 900], [0.03, 400]], d: 0.04, v: 0.2 });
    },
  },
  shatter: {
    dur: 1.4, vars: 2, vol: 0.5, cat: 'ui', verb: 0.45, gap: 0.1,
    make: (s) => {
      s.noise({ filter: 'highpass', f: [[0, 7000], [0.45, 3000]], q: 0.6, a: 0.001, d: 0.5, v: 0.9 });
      s.noise({ filter: 'bandpass', f: [[0, 2600], [0.3, 1100]], q: 1, a: 0.0005, d: 0.28, v: 0.5 });
      drum(s, 0, 90, 0.2, 0.6);
      for (let i = 0; i < 14; i++) s.bell({ t: s.rand(0, 0.5), f: s.rand(2500, 6500), ratio: s.rand(1.3, 2.9), index: 1, d: s.rand(0.08, 0.3), v: s.rand(0.05, 0.15) });
      s.crackle({ t: 0.02, density: 180, filter: 'highpass', f: 3500, d: 0.6, v: 0.45 });
    },
  },
  upgrade: {
    // the prize breaks through to the next class: a power-up stinger a minor third higher each time
    dur: 1.2, levels: [1, 2, 3, 4], vol: 0.5, cat: 'ui', verb: 0.45, gap: 0.1,
    make: (s, n) => {
      const root = 72 + (n - 1) * 3;
      whoosh(s, 0, 400, 3500, 2500, 0.3, 0.5, 2);
      drum(s, 0.02, 70, 0.3, 0.8);
      pad(s, [root, root + 4, root + 7, root + 12], 0.03, 0.005, 0.1, 0.5, 0.4);
      s.bell({ t: 0.05, f: m(root + 24), ratio: 2, index: 0.8, d: 0.6, v: 0.3 });
      sparkle(s, 0.05, 0.5, 0.3, 5);
    },
  },
  reveal: {
    // the prize lands: a ding for common pieces, up to an epic for SSS
    dur: (n) => [0.6, 0.7, 1, 1.3, 2.3, 2.9, 3.6][n - 1] ?? 1,
    levels: [1, 2, 3, 4, 5, 6, 7],
    vol: 0.6, cat: 'ui', verb: 0.5, gap: 0.1,
    duck: (n) => (n >= 5 ? 0.5 : 0),
    make: (s, n) => {
      if (n === 1) {
        arp(s, [88, 91], 0, 0.07, 0.35, 0.5);
        return;
      }
      if (n === 2) {
        arp(s, [84, 88, 91], 0, 0.06, 0.4, 0.5);
        sparkle(s, 0.1, 0.4, 0.3, 4);
        return;
      }
      if (n === 3) {
        pad(s, [72, 76, 79], 0, 0.005, 0.08, 0.25, 0.35);
        pad(s, [84, 88, 91], 0.12, 0.005, 0.15, 0.6, 0.35);
        arp(s, [84, 88, 91, 96], 0.12, 0.05, 0.5, 0.35);
        sparkle(s, 0.15, 0.7, 0.4, 6);
        drum(s, 0.12, 90, 0.25, 0.5);
        return;
      }
      if (n === 4) {
        arp(s, [72, 76, 79, 84, 88, 91], 0, 0.055, 0.5, 0.4);
        s.brass({ t: 0.3, notes: [60, 64, 67, 72], cut: [[0, 600], [0.1, 3000], [1.1, 900]], a: 0.02, h: 0.25, d: 0.8, v: 0.35 });
        sparkle(s, 0.3, 0.9, 0.45, 8);
        drum(s, 0.3, 80, 0.35, 0.7);
        crash(s, 0.3, 0.8, 0.25);
        return;
      }
      // A and up: a boom, brass, cymbal, a rising cascade; S adds a choir, SSS a gong and a shower of sparkles
      drum(s, 0, 50, 0.8, 1, 4);
      s.tone({ f: [[0, 60], [1.5, 30]], d: n >= 7 ? 1.6 : 0.9, v: 0.6 });
      s.brass({ t: 0.05, notes: [48, 55, 60, 64, 67], cut: [[0, 500], [0.12, 3200], [1.8, 900]], a: 0.03, h: n >= 6 ? 0.8 : 0.5, d: 1.3, v: 0.45 });
      crash(s, 0.05, 1.6, 0.5);
      arp(s, n >= 6 ? [72, 76, 79, 84, 88, 91, 96, 100] : [72, 76, 79, 84, 88, 91, 96], 0.1, 0.05, 0.6, 0.35);
      sparkle(s, 0.3, 1.6, 0.5, 12);
      if (n >= 6) s.choir({ t: 0.1, notes: [60, 64, 67, 72], a: 0.25, h: 0.9, d: 1.3, v: 0.32 });
      if (n >= 7) {
        s.bell({ f: m(36), ratio: 1.41, index: 3, d: 3, v: 0.35 });
        drum(s, 0.5, 45, 1, 0.9, 4);
        for (let i = 0; i < 24; i++) s.bell({ t: 0.5 + i * 0.07, f: m(84 + PENTA[i % 11]), ratio: 2, index: 0.6, d: 0.3, v: 0.12 });
      }
    },
  },
};

/** Renders one sound (one level, one variant) into a buffer, levelled and trimmed. */
export async function renderSound(name: SoundName, level: number, variant: number): Promise<AudioBuffer> {
  const def = SOUNDS[name];
  const dur = typeof def.dur === 'function' ? def.dur(level) : def.dur;
  return renderRecipe(`${name}#${level}#${variant}`, dur, (s) => def.make(s, level));
}

/** Renders any recipe (sound effects, music instruments) into a levelled, trimmed buffer. */
export async function renderRecipe(id: string, dur: number, make: (s: Synth) => void): Promise<AudioBuffer> {
  const ac = new OfflineAudioContext(1, Math.ceil(dur * SAMPLE_RATE), SAMPLE_RATE);
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 2654435761);
  make(new Synth(ac, seed));
  const buf = await ac.startRendering();
  return finish(buf, ac);
}

/**
 * Levels a rendered sound by its loudest moment (so a click and an explosion start from the same loudness and the
 * table's vol sets the mix), never above full scale, then trims the silent tail and fades the last few ms.
 */
function finish(buf: AudioBuffer, ac: OfflineAudioContext): AudioBuffer {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (!(peak > 1e-6)) return buf;
  const W = 1024;
  let loud = 0;
  for (let i = 0; i < d.length; i += W / 2) {
    let sum = 0;
    const end = Math.min(d.length, i + W);
    for (let k = i; k < end; k++) sum += d[k] * d[k];
    loud = Math.max(loud, Math.sqrt(sum / W));
  }
  const gain = Math.min(0.98 / peak, 0.3 / Math.max(loud, 1e-6));
  let last = d.length - 1;
  while (last > 0 && Math.abs(d[last]) * gain < 1e-3) last--;
  const len = Math.min(d.length, last + Math.ceil(SAMPLE_RATE * 0.02));
  const out = ac.createBuffer(1, Math.max(1, len), SAMPLE_RATE);
  const o = out.getChannelData(0);
  const fade = Math.min(len, Math.ceil(SAMPLE_RATE * 0.008));
  for (let i = 0; i < len; i++) o[i] = d[i] * gain * (i >= len - fade ? (len - i) / fade : 1);
  return out;
}
