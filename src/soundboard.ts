/** The sound board page (sounds.html, dev server only): the soundtrack, every sound, its levels, and a few mixes. */
import { music, sfx } from './audio';
import type { MusicState } from './music';
import type { SoundName } from './sounds';

type Entry = SoundName | [SoundName, number, string];

const GROUPS: [string, Entry[]][] = [
  ['Guns', ['pistol', 'smg', 'gatling', 'rifle', 'rocket', 'rail', 'cannon', 'throw', 'shock']],
  ['Melee', ['slash', 'whack', 'bash', 'punch', 'swoosh', ['bonk', 1, 'bonk 1'], ['bonk', 4, 'bonk 4'], ['bonk', 8, 'bonk 8']]],
  ['Hits and knock-outs', ['hit', 'thwack', 'ricochet', ['zap', 0, 'zap 1'], ['zap', 3, 'zap 4'], 'pin', 'fizz', 'crit', 'boom', 'pop', 'ko', 'down', 'coin', 'comboBig', 'leak', 'yell']],
  ['The wave', ['wave', 'boss', 'bossDown', 'bomb', 'bombReady', 'clear', 'stageClear', ['star', 0, 'star 1'], ['star', 1, 'star 2'], ['star', 2, 'star 3'], 'gems', 'defeat', 'launch', 'firework']],
  ['Fox skills', ['blink', 'dodge', 'sprint', 'rush', 'smoke', 'roar']],
  ['Next street', ['charge', 'run', 'skid', 'land']],
  ['Grid', ['click', 'pick', 'drop', 'denied', ['merge', 2, 'merge to D'], ['merge', 3, 'merge to C'], ['merge', 4, 'merge to B'], 'sell', 'unlock', 'evoReady', 'evoRise', 'evolve', 'awaken']],
  ['Cases', ['caseIn', 'thud', 'caseOpen', ['tick', 1, 'tick'], ['tick', 7, 'tick SSS'], 'tock', 'rumble', ['crack', 5, 'crack'], 'shatter', ['upgrade', 1, 'upgrade 1'], ['upgrade', 4, 'upgrade 4'], ...([1, 2, 3, 4, 5, 6, 7].map((n) => ['reveal', n, `reveal ${'EDCBAS'[n - 1] ?? 'SSS'}`]) as Entry[])]],
];

const WEAPONS = new Set<SoundName>(['pistol', 'smg', 'gatling', 'rifle', 'rocket', 'rail', 'cannon', 'throw', 'slash', 'whack', 'bash', 'punch', 'swoosh', 'hit', 'thwack']);
const board = document.getElementById('board')!;
const foxBox = document.getElementById('fox') as HTMLInputElement;
const status = document.getElementById('status')!;

function ready() {
  sfx.unlock();
  sfx.muted = false; // this page always plays (the game's own mute setting is not changed)
}

function button(text: string, onClick: () => void, big = false) {
  const b = document.createElement('button');
  b.textContent = text;
  if (big) b.className = 'big';
  b.addEventListener('click', () => {
    ready();
    onClick();
  });
  return b;
}

function section(title: string) {
  const s = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  s.append(h, row);
  board.append(s);
  return row;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tracks = section('Music');
// each track starts the way it does in the game (the war horn before a wave, the fanfare before the victory loop)
const TRACKS: [string, MusicState, SoundName?][] = [
  ['Prep time', 'prep'],
  ['Wave', 'fight', 'wave'],
  ['Boss wave', 'boss', 'wave'],
  ['Stage clear', 'victory', 'stageClear'],
  ['Next street', 'travel', 'charge'],
  ['Stop', 'off'],
];
for (const [text, state, cue] of TRACKS)
  tracks.append(
    button(
      text,
      () => {
        if (cue) sfx.play(cue);
        music.set(state);
      },
      state !== 'off',
    ),
  );
let muffled = false;
tracks.append(button('Muffle (case roll / pause)', () => music.muffle((muffled = !muffled))));

const mixes = section('Mixes');
mixes.append(
  button('Kill streak x12', async () => {
    for (let c = 1; c <= 12; c++) {
      const x = 300 + Math.random() * 200;
      sfx.play('hit', 0, { x });
      sfx.play('ko', c, { x });
      if (c >= 2) sfx.play('combo', c);
      sfx.play('coin', 0, { x });
      if (c === 10) sfx.play('comboBig');
      await wait(260);
    }
  }, true),
  button('Firefight', async () => {
    const guns: SoundName[] = ['pistol', 'smg', 'rifle', 'pistol', 'smg', 'rocket'];
    for (let i = 0; i < 40; i++) {
      const fox = Math.random() < 0.4;
      sfx.play(guns[i % guns.length], 0, { x: fox ? 360 + Math.random() * 150 : 80 + Math.random() * 150, fox });
      if (i % 3 === 0) sfx.play('hit', 0, { x: 200 + Math.random() * 300 });
      if (i === 18) sfx.play('boom', 0, { x: 420 });
      if (i % 9 === 4) sfx.play('slash', 0, { x: 260 });
      await wait(90);
    }
  }, true),
  button('Case roll to SSS', async () => {
    sfx.play('caseIn');
    await wait(350);
    sfx.play('thud');
    await wait(250);
    sfx.play('caseOpen');
    for (let i = 0, gap = 60; i < 18; i++, gap *= 1.12) {
      await wait(gap);
      sfx.play('tick', 1 + (i % 4));
      if (gap > 140) sfx.play('tock');
    }
    sfx.play('reveal', 4);
    for (let up = 1; up <= 3; up++) {
      await wait(400);
      for (let k = 0; k < 3; k++) {
        sfx.play('crack', 4 + up);
        sfx.play('rumble');
        await wait(260);
      }
      sfx.play('shatter');
      sfx.play('upgrade', up);
    }
    await wait(150);
    sfx.play('reveal', 7);
  }, true),
  button('Merge up E to A', async () => {
    for (const lv of [2, 3, 4]) {
      sfx.play('pick');
      await wait(250);
      sfx.play('merge', lv);
      await wait(550);
    }
    sfx.play('reveal', 5);
  }, true),
);

for (const [title, entries] of GROUPS) {
  const row = section(title);
  for (const e of entries) {
    const [name, n, text] = typeof e === 'string' ? [e, 3, e] : e;
    row.append(button(text, () => sfx.play(name, n, { x: 270, fox: foxBox.checked && WEAPONS.has(name) })));
  }
}

function showProgress() {
  const p = sfx.progress;
  const all = p.done >= p.total && music.ready;
  status.textContent = all ? 'All sounds ready.' : `Preparing sounds: ${p.done} / ${p.total}`;
  if (!all) setTimeout(showProgress, 200);
}
showProgress();
