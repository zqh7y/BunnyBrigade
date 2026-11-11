import { music } from './music';
import { SAMPLE_RATE, SOUNDS, renderSound, type SoundName } from './sounds';

export type { SoundName };
export { music };

/**
 * The sound engine. Every effect is designed in sounds.ts and rendered once into a buffer as the page loads
 * (no audio files). Playing one picks a variant, nudges its pitch, places it left or right where it happens on
 * the road and mixes it like a game soundtrack: a battle bus and an interface bus, a room reverb, a glue
 * compressor and a limiter, and big moments (rare prizes, evolutions, the boss) briefly duck the battle.
 * Browsers only allow sound after the first tap, so the game calls sfx.unlock() on pointer down and again when a
 * finger lifts (phones only allow it then).
 */

/** Rendered first, so the sounds heard in the first seconds are ready soonest. */
const FIRST: SoundName[] = ['click', 'pick', 'drop', 'denied', 'caseIn', 'thud', 'caseOpen', 'tick', 'tock', 'reveal', 'merge', 'wave', 'pistol', 'smg', 'hit', 'ko', 'coin', 'combo', 'slash', 'punch'];

export interface PlayAt {
  x?: number; // where on the road (0..540): sets left / right
  fox?: boolean; // a fox's weapon: deeper and a little quieter than the rabbits'
  delay?: number; // seconds from now
}

const ROAD_W = 540;
const MAX_VOICES = 40;

class Sfx {
  private ac: AudioContext | null = null;
  private buses: Record<'battle' | 'ui', GainNode> | null = null;
  private verb: GainNode | null = null;
  private bufs = new Map<string, AudioBuffer[]>();
  private last = new Map<SoundName, number>();
  private lastVariant = new Map<SoundName, number>();
  private playing = new Map<SoundName, number[]>(); // end times of the copies still sounding
  private voices: number[] = [];
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('bunny-brigade-muted') === '1';
    } catch {
      /* storage unavailable: keep default */
    }
    // rendering needs no tap, so it starts right away and is done by the time anyone plays
    if (typeof OfflineAudioContext !== 'undefined') setTimeout(() => void this.renderAll(), 30);
  }

  /** How many sounds are rendered so far, out of how many. */
  get progress() {
    return { done: this.bufs.size, total: Object.values(SOUNDS).reduce((a, d) => a + (d.levels?.length ?? 1), 0) };
  }

  private async renderAll() {
    const names = [...new Set([...FIRST, ...(Object.keys(SOUNDS) as SoundName[])])];
    for (const name of names) {
      const def = SOUNDS[name];
      for (const level of def.levels ?? [0]) {
        const list: AudioBuffer[] = [];
        for (let v = 0; v < (def.vars ?? 1); v++) {
          try {
            list.push(await renderSound(name, level, v));
          } catch {
            /* a browser without some node type: that sound stays silent */
          }
        }
        if (list.length) this.bufs.set(`${name}#${level}`, list);
      }
    }
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      let ac: AudioContext;
      try {
        ac = new AC({ latencyHint: 'interactive' });
      } catch {
        ac = new AC();
      }
      this.build(ac);
      this.ac = ac;
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }

  /** battle + ui buses -> glue compressor -> master -> limiter -> speakers, with a shared room reverb. */
  private build(ac: AudioContext) {
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    limiter.connect(ac.destination);
    const master = ac.createGain();
    master.gain.value = 0.85;
    master.connect(limiter);
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 8;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.15;
    glue.connect(master);

    const battle = ac.createGain();
    const ui = ac.createGain();
    battle.connect(glue);
    ui.connect(glue);
    this.buses = { battle, ui };

    // the room: a short, warm stereo reverb made from decaying noise
    try {
      const conv = ac.createConvolver();
      conv.buffer = roomImpulse(ac);
      const send = ac.createGain();
      const ret = ac.createGain();
      ret.gain.value = 0.9;
      send.connect(conv);
      conv.connect(ret);
      ret.connect(glue);
      this.verb = send;
    } catch {
      this.verb = null;
    }
    // the soundtrack goes straight to the master (it is not squeezed by the effects' compressor)
    music.attach(ac, master, this.verb, () => this.muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('bunny-brigade-muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /**
   * n: the sound's number (combo count, class level, star index, countdown second...).
   * at: where on the road it happens, and whether it is a fox's weapon.
   */
  play(name: SoundName, n = 0, at: PlayAt = {}) {
    const ac = this.ac;
    if (!ac || !this.buses || this.muted || ac.state !== 'running') return;
    const def = SOUNDS[name];
    const now = ac.currentTime;
    if (now - (this.last.get(name) ?? -9) < (def.gap ?? 0)) return;
    const level = def.levels ? def.levels.reduce((best, l) => (Math.abs(l - n) < Math.abs(best - n) ? l : best), def.levels[0]) : 0;
    const list = this.bufs.get(`${name}#${level}`);
    if (!list) return; // still rendering
    const live = (this.playing.get(name) ?? []).filter((e) => e > now);
    this.voices = this.voices.filter((e) => e > now);
    if (live.length >= (def.max ?? 8) || this.voices.length >= MAX_VOICES) return;
    this.last.set(name, now);

    // a different variant from last time
    let vi = Math.floor(Math.random() * list.length);
    if (list.length > 1 && vi === this.lastVariant.get(name)) vi = (vi + 1) % list.length;
    this.lastVariant.set(name, vi);
    const buf = list[vi];

    let rate = (def.rate?.(n) ?? 1) * 2 ** (((Math.random() * 2 - 1) * (def.jitter ?? 0)) / 1200);
    let vol = def.vol * (0.9 + Math.random() * 0.1);
    if (at.fox) {
      rate *= 0.84;
      vol *= 0.72;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g);
    let out: AudioNode = g;
    if (at.x !== undefined && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-0.75, Math.min(0.75, (at.x / ROAD_W - 0.5) * 1.3));
      g.connect(p);
      out = p;
    }
    out.connect(this.buses[def.cat]);
    if (def.verb && this.verb) {
      const send = ac.createGain();
      send.gain.value = def.verb;
      out.connect(send);
      send.connect(this.verb);
    }
    const t = now + (at.delay ?? 0);
    src.start(t);
    const end = t + buf.duration / rate;
    live.push(end);
    this.playing.set(name, live);
    this.voices.push(end);

    const duck = typeof def.duck === 'function' ? def.duck(n) : def.duck ?? 0;
    if (duck > 0) this.duck(duck, Math.min(1.6, buf.duration * 0.6));
  }

  /** Dips the battle under a big moment, then lets it back in. */
  private duck(amount: number, hold: number) {
    const g = this.buses!.battle.gain;
    const now = this.ac!.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1 - amount, now + 0.04);
    g.setTargetAtTime(1, now + hold, 0.3);
    music.duck(amount, hold);
  }
}

/** A stereo room impulse: early reflections, then a darkening, decaying noise tail (about 1.3 s). */
function roomImpulse(ac: BaseAudioContext) {
  const sr = ac.sampleRate || SAMPLE_RATE;
  const len = Math.ceil(sr * 1.6);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pre = Math.floor(sr * 0.012);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const decay = Math.exp((-t * 6.9) / 1.3);
      const bright = 0.85 * Math.exp(-t * 2.2) + 0.08; // the tail loses its highs
      lp += bright * (Math.random() * 2 - 1 - lp);
      d[i] = lp * decay;
    }
    for (const [ms, a] of [
      [17, 0.5],
      [29, 0.35],
      [41, 0.3],
      [57, 0.22],
    ]) {
      const i = Math.floor((sr * (ms + ch * 3)) / 1000);
      if (i < len) d[i] += a * (ch ? -1 : 1);
    }
  }
  return buf;
}

export const sfx = new Sfx();
