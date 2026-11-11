import './style.css';
import { sfx } from './audio';
import { Game } from './game';
import { H, W } from './theme';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const game = new Game();
let ratio = 1; // device pixels per logical pixel

/** The streets' static layers are cached at the canvas resolution. */
function buildScene() {
  game.street.build(ratio);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const view = Math.min(window.innerWidth / W, window.innerHeight / H);
  ratio = view * dpr;
  canvas.style.width = `${Math.floor(W * view)}px`;
  canvas.style.height = `${Math.floor(H * view)}px`;
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  buildScene();
}

window.addEventListener('resize', resize);
resize();
// the shop signs use the game font; redraw the backdrops once it has loaded
document.fonts?.load('20px "Lilita One"').then(buildScene, () => {});

function toLocal(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
}

// Only one finger at a time: a second touch while the first is down is ignored, so it can never
// replace (and lose) a piece that is being dragged.
let activePointer: number | null = null;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (activePointer !== null && e.pointerId !== activePointer) return;
  activePointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  const p = toLocal(e);
  game.pointerDown(p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  if (activePointer !== null && e.pointerId !== activePointer) return;
  const p = toLocal(e);
  game.pointerMove(p.x, p.y);
});
canvas.addEventListener('pointerup', (e) => {
  // phones (iOS in particular) only let sound start when a finger lifts, not when it touches down
  sfx.unlock();
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  const p = toLocal(e);
  game.pointerUp(p.x, p.y);
});
canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  game.cancelDrag();
});
canvas.addEventListener('touchend', () => sfx.unlock(), { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') game.togglePause();
});

if (import.meta.env.DEV) Object.assign(window as object, { game, sfx });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  game.render(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
