import { crash, drum, m, renderRecipe, type Synth } from './sounds';

/*
 * The soundtrack: an adaptive loop that follows the game. Its instruments are synthesized and rendered once
 * (like the sound effects); a small sequencer then plays the composed parts on a 16th-note grid, a little
 * ahead of time on the audio clock, so the beat never drifts.
 *
 *   prep     a chill groove: swung shaker, rim, walking bass, marimba arpeggios, a marimba tune and a pad
 *   fight    the wave: a driving beat, octave bass, brass stabs and a catchy lead hook
 *   boss     the boss wave: four-on-the-floor, toms, a low brass ostinato, choir, a menacing half-step theme
 *   victory  after the stage-clear fanfare: a bright major loop
 *   travel   a snare roll and a riser while the squad runs to the next street
 *   defeat   the music fades out (the sad trombone plays)
 *
 * Changes wait for the next bar, except a wave starting (it kicks in right after the war horn) and defeat.
 * During a case roll, an evolution or a pause the music is muffled; big sound effects make it dip.
 */

export type MusicState = 'off' | 'prep' | 'fight' | 'boss' | 'victory' | 'travel' | 'defeat';

const BPM = 116;
/** The soundtrack's level: under the effects, so every shot and hit cuts through. */
const LEVEL = 0.28;
const STEP = 60 / BPM / 4; // one 16th note

type Inst = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'shaker' | 'rim' | 'tom' | 'crash' | 'riser' | 'bass' | 'pluck' | 'brass' | 'lead' | 'pad' | 'choir';

interface InstDef {
  bases: number[]; // MIDI notes the instrument is rendered at (the nearest is pitched to each note)
  dur: number;
  vol: number;
  verb?: number;
  pan?: number;
  make: (s: Synth, base: number) => void;
}

const INSTRUMENTS: Record<Inst, InstDef> = {
  kick: {
    bases: [0], dur: 0.45, vol: 0.85,
    make: (s) => {
      drum(s, 0, 50, 0.38, 1, 3);
      s.noise({ filter: 'highpass', f: 3000, a: 0.0003, d: 0.008, v: 0.4 });
    },
  },
  snare: {
    bases: [0], dur: 0.35, vol: 0.5, verb: 0.15,
    make: (s) => {
      const hot = s.drive(2);
      s.tone({ type: 'triangle', f: [[0, 200], [0.08, 150]], a: 0.0008, d: 0.1, v: 0.8, to: hot });
      s.noise({ filter: 'bandpass', f: 1900, q: 0.8, a: 0.0008, d: 0.18, v: 0.9, to: hot });
      s.noise({ filter: 'highpass', f: 5000, a: 0.0005, d: 0.1, v: 0.5 });
    },
  },
  clap: {
    bases: [0], dur: 0.35, vol: 0.38, verb: 0.25,
    make: (s) => {
      for (const t of [0, 0.011, 0.022]) s.noise({ t, filter: 'bandpass', f: 1250, q: 1.4, a: 0.0005, d: 0.012, v: 0.9 });
      s.noise({ t: 0.03, filter: 'bandpass', f: 1150, q: 1.2, a: 0.001, d: 0.16, v: 0.7 });
    },
  },
  hat: {
    bases: [0], dur: 0.08, vol: 0.2, pan: 0.25,
    make: (s) => {
      s.noise({ filter: 'highpass', f: 8000, a: 0.0003, d: 0.035, v: 0.8 });
      s.noise({ filter: 'bandpass', f: 10500, q: 2, a: 0.0003, d: 0.025, v: 0.4 });
    },
  },
  ohat: {
    bases: [0], dur: 0.35, vol: 0.18, pan: 0.25,
    make: (s) => {
      s.noise({ filter: 'highpass', f: 7000, a: 0.001, d: 0.28, v: 0.8 });
      s.noise({ filter: 'bandpass', f: 9800, q: 2, a: 0.001, d: 0.2, v: 0.4 });
    },
  },
  shaker: {
    bases: [0], dur: 0.1, vol: 0.14, pan: -0.3,
    make: (s) => s.noise({ filter: 'bandpass', f: 6200, q: 1.2, a: 0.012, d: 0.05, v: 0.8 }),
  },
  rim: {
    bases: [0], dur: 0.12, vol: 0.26, verb: 0.2, pan: 0.1,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 1700, q: 6, a: 0.0003, d: 0.03, v: 0.8 });
      s.tone({ f: [[0, 950], [0.02, 820]], a: 0.0003, d: 0.025, v: 0.5 });
    },
  },
  tom: {
    bases: [45], dur: 0.5, vol: 0.55, verb: 0.15,
    make: (s, base) => drum(s, 0, m(base), 0.4, 1, 2),
  },
  crash: {
    bases: [0], dur: 1.8, vol: 0.3, verb: 0.2,
    make: (s) => crash(s, 0, 1.6, 0.8),
  },
  riser: {
    bases: [0], dur: 2.2, vol: 0.32, verb: 0.3,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 300], [2, 6000]], q: 2.5, a: 1.8, d: 0.15, v: 0.8 });
      for (const detune of [-10, 10]) s.tone({ type: 'sawtooth', f: [[0, 110], [2, 880]], lp: [[0, 400], [2, 5000]], a: 1.8, d: 0.15, v: 0.15, detune });
    },
  },
  bass: {
    // a round, punchy synth bass that holds while the note is held
    bases: [33, 40, 47], dur: 1.1, vol: 0.5,
    make: (s, base) => {
      const f = m(base);
      s.tone({ type: 'sawtooth', f, lp: [[0, 2200], [0.12, 420], [1, 300]], q: 2, a: 0.003, h: 0.6, d: 0.4, v: 0.55 });
      s.tone({ type: 'square', f, lp: 600, a: 0.003, h: 0.6, d: 0.4, v: 0.25, detune: 6 });
      s.tone({ f, a: 0.003, h: 0.6, d: 0.4, v: 0.7 });
    },
  },
  pluck: {
    // marimba: a woody strike with its bright 4th partial
    bases: [60, 72, 84], dur: 0.7, vol: 0.32, verb: 0.3,
    make: (s, base) => {
      const f = m(base);
      s.bell({ f, ratio: 4, index: 0.9, a: 0.001, d: 0.55, v: 0.6 });
      s.tone({ f, a: 0.001, d: 0.45, v: 0.5 });
      s.tone({ f: f * 4, a: 0.0005, d: 0.05, v: 0.12 });
    },
  },
  brass: {
    bases: [48, 60], dur: 0.8, vol: 0.24, verb: 0.25,
    make: (s, base) => s.brass({ notes: [base], cut: [[0, 450], [0.04, 2800], [0.6, 1000]], a: 0.012, h: 0.4, d: 0.3, v: 0.8 }),
  },
  lead: {
    // a bright, singing square lead with a delayed vibrato
    bases: [72, 84], dur: 1.6, vol: 0.27, verb: 0.35,
    make: (s, base) => {
      const f = m(base);
      s.tone({ type: 'square', f, lp: 3400, a: 0.006, h: 1.1, d: 0.4, v: 0.5 });
      s.tone({ type: 'sawtooth', f, lp: 2600, a: 0.006, h: 1.1, d: 0.4, v: 0.3, detune: 7, vib: [5.5, 14] });
      s.tone({ type: 'triangle', f: f * 2, a: 0.006, h: 0.2, d: 0.3, v: 0.12 });
    },
  },
  pad: {
    bases: [55, 66], dur: 3, vol: 0.13, verb: 0.5,
    make: (s, base) => {
      for (const detune of [-12, 0, 11]) s.tone({ type: 'sawtooth', f: m(base), lp: 1500, a: 0.3, h: 2, d: 0.6, v: 0.35, detune, vib: [0.3 + Math.abs(detune) * 0.02, 6] });
    },
  },
  choir: {
    bases: [52], dur: 3, vol: 0.2, verb: 0.55,
    make: (s, base) => s.choir({ notes: [base], a: 0.3, h: 2, d: 0.6, v: 0.9 }),
  },
};

// ------------------------------------------------------------------ the composition

/** One note or hit: step in the bar (0..15), instrument, MIDI note, length in steps, loudness, pan. */
interface Ev {
  s: number;
  i: Inst;
  n?: number;
  d?: number;
  v?: number;
  p?: number;
}
interface Song {
  bars: Ev[][];
  loopFrom?: number; // the bar the loop goes back to (victory starts with rests under the fanfare)
  swing?: number;
}
interface Chord {
  b: number; // bass root
  t: number[]; // voicing
}

const CH: Record<string, Chord> = {
  Dm: { b: 38, t: [62, 65, 69] },
  Bb: { b: 34, t: [62, 65, 70] },
  C: { b: 36, t: [60, 64, 67] },
  A: { b: 33, t: [61, 64, 69] },
  Eb: { b: 39, t: [63, 67, 70] },
  F: { b: 41, t: [65, 69, 72] },
  Dm7: { b: 38, t: [57, 60, 62, 65] },
  Bbmaj7: { b: 34, t: [57, 58, 62, 65] },
  Gm7: { b: 43, t: [55, 58, 62, 65] },
  A7: { b: 33, t: [57, 61, 64, 67] },
};

type Mel = [number, number, number][]; // [step, note, length]

const FIGHT_HOOK: Mel[] = [
  [[0, 74, 1], [2, 74, 1], [3, 77, 2], [6, 74, 1], [8, 81, 3], [11, 79, 1], [12, 77, 2], [14, 76, 2]],
  [[0, 74, 1], [2, 74, 1], [3, 77, 2], [6, 74, 1], [8, 82, 3], [11, 81, 1], [12, 79, 2], [14, 77, 2]],
  [[0, 76, 1], [2, 76, 1], [3, 79, 2], [6, 76, 1], [8, 84, 3], [11, 82, 1], [12, 81, 2], [14, 79, 2]],
  [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 73, 4]],
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 69, 2], [8, 74, 2], [10, 77, 2], [12, 81, 4]],
  [[0, 82, 3], [3, 81, 1], [4, 79, 2], [6, 77, 2], [8, 74, 4], [12, 77, 2], [14, 79, 2]],
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 76, 2], [10, 79, 2], [12, 84, 4]],
  [[0, 85, 3], [3, 81, 1], [4, 76, 4], [8, 81, 2], [10, 79, 2], [12, 76, 2], [14, 73, 2]],
];
const BOSS_THEME: Mel[] = [
  [[0, 74, 6], [6, 69, 2], [8, 74, 4], [12, 77, 4]],
  [[0, 75, 6], [6, 74, 2], [8, 70, 8]],
  [[0, 74, 4], [4, 77, 4], [8, 81, 4], [12, 79, 2], [14, 77, 2]],
  [[0, 76, 8], [8, 73, 8]],
];
const VICTORY_TUNE: Mel[] = [
  [[0, 77, 4], [4, 81, 4], [8, 84, 6], [14, 81, 2]],
  [[0, 79, 4], [4, 76, 4], [8, 72, 8]],
  [[0, 81, 4], [4, 77, 4], [8, 74, 6], [14, 77, 2]],
  [[0, 74, 4], [4, 77, 4], [8, 82, 8]],
  [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 86, 4], [12, 84, 4]],
  [[0, 84, 4], [4, 79, 4], [8, 76, 4], [12, 79, 4]],
  [[0, 82, 4], [4, 81, 4], [8, 79, 4], [12, 77, 4]],
  [[0, 79, 4], [4, 76, 4], [8, 79, 8]],
];
const PREP_TUNE: Mel[] = [
  [[0, 81, 2], [2, 77, 2], [4, 74, 4], [8, 76, 2], [10, 77, 2], [12, 81, 4]],
  [[0, 81, 3], [3, 79, 1], [4, 77, 4], [8, 74, 4], [12, 77, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 74, 2], [6, 70, 2], [8, 74, 4], [12, 79, 4]],
  [[0, 76, 4], [4, 73, 4], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
];

const mel = (i: Inst, tune: Mel, v: number, shift = 0): Ev[] => tune.map(([s, n, d]) => ({ s, i, n: n + shift, d, v }));
const at = (i: Inst, steps: number[], v = 1, p?: number): Ev[] => steps.map((s) => ({ s, i, v, p }));
const sixteenths = (i: Inst, accent: number, soft: number): Ev[] => Array.from({ length: 16 }, (_, s) => ({ s, i, v: s % 2 ? accent : soft }));

function fightBar(bar: number, ch: Chord): Ev[] {
  const ev: Ev[] = [];
  ev.push(...at('kick', bar % 2 ? [0, 8, 10] : [0, 7, 8]));
  ev.push(...at('snare', [4, 12], 0.9), ...at('clap', [4, 12], 0.8));
  ev.push(...[0, 2, 4, 6, 8, 10, 12].map((s) => ({ s, i: 'hat' as Inst, v: s % 4 ? 1 : 0.6 })));
  ev.push({ s: 14, i: bar % 2 ? 'ohat' : 'hat', v: 0.9 });
  if (bar === 0) ev.push({ s: 0, i: 'crash', v: 1 });
  if (bar === 7) ev.push(...[12, 13, 14, 15].map((s, k) => ({ s, i: 'snare' as Inst, v: 0.45 + k * 0.15 })));
  [0, 0, 12, 0, 0, 12, 7, 12].forEach((o, k) => ev.push({ s: k * 2, i: 'bass', n: ch.b + o, d: 1.6, v: k % 2 ? 0.75 : 1 }));
  for (const s of [6, 14]) for (const n of ch.t) ev.push({ s, i: 'brass', n, d: 1, v: 0.8 });
  if (bar >= 4) for (let s = 0; s < 16; s++) ev.push({ s, i: 'pluck', n: ch.t[[0, 1, 2, 1][s % 4]] + 12, d: 1, v: 0.35, p: s % 2 ? 0.3 : -0.3 });
  ev.push(...mel('lead', FIGHT_HOOK[bar], 1));
  return ev;
}

function bossBar(bar: number, ch: Chord): Ev[] {
  const ev: Ev[] = [];
  ev.push(...at('kick', [0, 4, 8, 12, 14]));
  ev.push(...at('snare', [4, 12], 0.9), ...at('clap', [4, 12], 0.7));
  ev.push(...sixteenths('hat', 0.9, 0.5));
  if (bar % 4 === 0) ev.push({ s: 0, i: 'crash', v: 1 });
  if (bar % 4 === 3) [8, 10, 12, 13, 14, 15].forEach((s, k) => ev.push({ s, i: 'tom', n: 52 - k * 2, v: 0.7 + k * 0.05 }));
  for (const s of [0, 3, 6, 8, 11, 14]) {
    ev.push({ s, i: 'bass', n: ch.b, d: 2, v: 1 });
    ev.push({ s, i: 'brass', n: ch.b + 12, d: 2, v: 0.75 });
  }
  for (const n of ch.t) ev.push({ s: 0, i: 'choir', n: n - 12, d: 16, v: 0.8 });
  if (bar >= 4) ev.push(...mel('lead', BOSS_THEME[bar - 4], 1));
  return ev;
}

function victoryBar(bar: number, ch: Chord): Ev[] {
  const ev: Ev[] = [];
  ev.push(...at('kick', [0, 4, 8, 12]));
  ev.push(...at('clap', [4, 12], 0.9));
  ev.push(...at('ohat', [2, 6, 10, 14], 0.8), ...sixteenths('shaker', 0.8, 0.5));
  if (bar === 0) ev.push({ s: 0, i: 'crash', v: 1 });
  [
    [0, 0, 2],
    [3, 0, 1],
    [4, 12, 2],
    [8, 0, 2],
    [11, 0, 1],
    [12, 7, 2],
    [14, 12, 2],
  ].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: ch.b + o, d, v: 0.9 }));
  for (let s = 0; s < 16; s++) ev.push({ s, i: 'pluck', n: ch.t[[0, 1, 2, 1][s % 4]] + 12, d: 1, v: 0.35, p: s % 2 ? 0.3 : -0.3 });
  if (bar >= 4) for (const n of ch.t) ev.push({ s: 0, i: 'pad', n, d: 16, v: 0.8 });
  ev.push(...mel('lead', VICTORY_TUNE[bar], 0.95));
  return ev;
}

function prepBar(bar: number, ch: Chord): Ev[] {
  const ev: Ev[] = [];
  ev.push(...at('kick', [0, 10], 0.75));
  ev.push(...at('rim', [4, 12], 0.7));
  ev.push(...sixteenths('shaker', 0.8, 0.45));
  if (bar % 4 === 3) ev.push(...at('rim', [14, 15], 0.45));
  [
    [0, 0, 5],
    [6, 7, 2],
    [8, 12, 3],
    [11, 7, 2],
    [14, 5, 2],
  ].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: ch.b + o, d, v: 0.85 }));
  [0, 1, 2, 3, 2, 1, 3, 2].forEach((k, j) => ev.push({ s: j * 2, i: 'pluck', n: ch.t[k] + 12, d: 2, v: j % 2 ? 0.32 : 0.5, p: j % 2 ? 0.25 : -0.25 }));
  if (bar >= 4) {
    for (const n of ch.t) ev.push({ s: 0, i: 'pad', n, d: 16, v: 0.7 });
    ev.push(...mel('pluck', PREP_TUNE[bar - 4], 0.85));
  }
  return ev;
}

function travelBar(bar: number): Ev[] {
  if (bar % 2) return [{ s: 0, i: 'crash', v: 1 }, { s: 0, i: 'kick', v: 1 }, ...at('kick', [4, 8, 12])];
  return [{ s: 0, i: 'riser', v: 1 }, { s: 0, i: 'kick', v: 1 }, ...Array.from({ length: 16 }, (_, s) => ({ s, i: 'snare' as Inst, v: 0.2 + (s / 15) * 0.8 }))];
}

const song = (chords: string[], bar: (b: number, ch: Chord) => Ev[], extra: Partial<Song> = {}): Song => ({ bars: chords.map((c, b) => bar(b, CH[c])), ...extra });

const SONGS: Record<Exclude<MusicState, 'off' | 'defeat'>, Song> = {
  prep: song(['Dm7', 'Bbmaj7', 'Gm7', 'A7', 'Dm7', 'Bbmaj7', 'Gm7', 'A7'], prepBar, { swing: 0.2 }),
  fight: song(['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'C', 'A'], fightBar),
  boss: song(['Dm', 'Eb', 'Dm', 'A', 'Dm', 'Eb', 'Dm', 'A'], bossBar),
  victory: { bars: [[], [], ...['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'].map((c, b) => victoryBar(b, CH[c]))], loopFrom: 2 },
  travel: { bars: [travelBar(0), travelBar(1)] },
};

// ------------------------------------------------------------------ the player

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  end: number;
}

class Music {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null; // mute and ducking
  private tone: BiquadFilterNode | null = null; // muffling
  private level: GainNode | null = null;
  private verb: AudioNode | null = null;
  private muted: () => boolean = () => false;
  private samples = new Map<Inst, { base: number; buf: AudioBuffer }[]>();
  private state: MusicState = 'off';
  private playing: MusicState = 'off';
  private pending: MusicState | null = null;
  private bar = 0;
  private step = 0;
  private nextT = 0;
  private voices: Voice[] = [];
  private muffled = false;
  private silent = true;

  constructor() {
    if (typeof OfflineAudioContext !== 'undefined') setTimeout(() => void this.renderAll(), 60);
  }

  private async renderAll() {
    for (const [name, def] of Object.entries(INSTRUMENTS) as [Inst, InstDef][]) {
      const list: { base: number; buf: AudioBuffer }[] = [];
      for (const base of def.bases) {
        try {
          list.push({ base, buf: await renderRecipe(`music:${name}:${base}`, def.dur, (s) => def.make(s, base)) });
        } catch {
          /* that instrument stays silent */
        }
      }
      if (list.length) this.samples.set(name, list);
    }
  }

  get ready() {
    return this.samples.size === Object.keys(INSTRUMENTS).length;
  }

  /** Wires the music into the mix (called once the audio is unlocked). */
  attach(ac: AudioContext, dest: AudioNode, verb: AudioNode | null, muted: () => boolean) {
    this.ac = ac;
    this.muted = muted;
    this.verb = verb;
    const level = ac.createGain();
    level.gain.value = LEVEL;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 20000;
    tone.Q.value = 0.5;
    const out = ac.createGain();
    out.gain.value = muted() ? 0 : 1;
    level.connect(tone);
    tone.connect(out);
    out.connect(dest);
    this.level = level;
    this.tone = tone;
    this.out = out;
    setInterval(() => this.tick(), 25);
  }

  /** What the game is doing; the music follows (at the next bar, or right away when a wave starts). */
  set(state: MusicState) {
    if (state === this.state) return;
    this.state = state;
    if (state === 'fight' || state === 'boss') this.start(state, 0.45); // right after the war horn
    else if (state === 'defeat' || state === 'off') this.start(state, 0);
    else this.pending = state;
  }

  /** Muffled during case rolls, evolutions and pauses. */
  muffle(on: boolean) {
    if (on === this.muffled || !this.ac || !this.tone || !this.level) return;
    this.muffled = on;
    const now = this.ac.currentTime;
    this.tone.frequency.setTargetAtTime(on ? 750 : 20000, now, on ? 0.08 : 0.25);
    this.level.gain.setTargetAtTime(on ? LEVEL * 0.7 : LEVEL, now, 0.15);
  }

  /** Dips under a big sound effect. */
  duck(amount: number, hold: number) {
    if (!this.ac || !this.out || this.silent) return;
    const g = this.out.gain;
    const now = this.ac.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1 - amount * 0.8, now + 0.05);
    g.setTargetAtTime(1, now + hold, 0.4);
  }

  private start(state: MusicState, delay: number) {
    this.fadeOut(delay > 0 ? 0.1 : 0.6);
    this.playing = state;
    this.pending = null;
    this.bar = 0;
    this.step = 0;
    if (this.ac) this.nextT = this.ac.currentTime + delay;
  }

  private fadeOut(time: number) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    for (const v of this.voices) {
      if (v.end <= now) continue;
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime(0, now, time / 3);
      try {
        v.src.stop(now + time + 0.1);
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
  }

  private tick() {
    const ac = this.ac;
    if (!ac || !this.out) return;
    const quiet = this.muted() || ac.state !== 'running' || (typeof document !== 'undefined' && document.hidden);
    if (quiet !== this.silent) {
      this.silent = quiet;
      this.out.gain.cancelScheduledValues(ac.currentTime);
      this.out.gain.setTargetAtTime(quiet ? 0 : 1, ac.currentTime, 0.08);
    }
    if (quiet || !this.ready) {
      this.nextT = 0; // pick up on the next bar when it comes back
      return;
    }
    const now = ac.currentTime;
    if (this.nextT <= 0 || this.nextT < now - 0.1) {
      // fell behind (the tab was hidden, or just unlocked): restart cleanly on a fresh bar.
      // nextT 0 counts too: right after unlock the clock is still under 0.1 s, and a note at time 0 with its
      // timing jitter would land before zero, which the audio API refuses.
      this.nextT = now + 0.06;
      this.step = 0;
      if (this.pending) {
        this.playing = this.pending;
        this.pending = null;
        this.bar = 0;
      }
    }
    while (this.nextT < now + 0.15) {
      if (this.step === 0 && this.pending) {
        this.playing = this.pending;
        this.pending = null;
        this.bar = 0;
      }
      this.playStep(this.nextT);
      this.nextT += STEP;
      if (++this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
    this.voices = this.voices.filter((v) => v.end > now);
  }

  private playStep(t: number) {
    if (this.playing === 'off' || this.playing === 'defeat') return;
    const s = SONGS[this.playing];
    if (this.bar >= s.bars.length) this.bar = s.loopFrom ?? 0;
    const swing = s.swing && this.step % 2 ? s.swing * STEP : 0;
    for (const e of s.bars[this.bar]) {
      if (e.s !== this.step) continue;
      this.note(e, t + swing + (Math.random() - 0.5) * 0.004);
    }
  }

  private note(e: Ev, t: number) {
    const ac = this.ac!;
    t = Math.max(t, ac.currentTime); // the jitter never schedules a note in the past
    const def = INSTRUMENTS[e.i];
    const list = this.samples.get(e.i);
    if (!list) return;
    let smp = list[0];
    if (e.n !== undefined) for (const x of list) if (Math.abs(x.base - e.n) < Math.abs(smp.base - e.n)) smp = x;
    const rate = e.n !== undefined && smp.base ? 2 ** ((e.n - smp.base) / 12) : 1;
    const src = ac.createBufferSource();
    src.buffer = smp.buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    const vol = def.vol * (e.v ?? 1) * (0.93 + Math.random() * 0.1);
    g.gain.setValueAtTime(vol, t);
    let end = t + smp.buf.duration / rate;
    if (e.d !== undefined) {
      const off = t + e.d * STEP;
      if (off < end) {
        g.gain.setValueAtTime(vol, off);
        g.gain.setTargetAtTime(0, off, 0.03);
        end = off + 0.2;
      }
    }
    src.connect(g);
    let node: AudioNode = g;
    const pan = e.p ?? def.pan;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(this.level!);
    if (def.verb && this.verb) {
      const send = ac.createGain();
      send.gain.value = def.verb * LEVEL;
      node.connect(send);
      send.connect(this.verb);
    }
    src.start(t);
    src.stop(end + 0.05);
    this.voices.push({ src, g, end });
  }
}

export const music = new Music();
