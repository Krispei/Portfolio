// Bakes the hero into a sequence of still frames (see README → "Hero frames").
//
// Runs the real 3D scene (src/hero/SurfaceScene.js) at a fixed square framing
// and saves one PNG per progress step through the dev server; then
// `python3 tools/encode-frames.py` turns them into the WebP sets the site plays.
//
// Open http://localhost:5173/tools/render-frames.html with `npm run dev` running.

import SurfaceScene from '../src/hero/SurfaceScene.js';
import { PMAX, timeRate } from '../src/hero/phases.js';

const SIZE = 1536; // px, square; encode-frames.py downsamples it per device
const STEP = 0.004; // progress between frames
const TIME_PER_P = 14; // flow-clock units per unit of progress (how lively the turbulence is)

// the flow clock as a function of progress: live, it advanced with time while
// scrolling; baked, it advances with progress so every visitor sees the same film
function timeAt(p) {
  let t = 0;
  const n = Math.max(1, Math.ceil(p / 0.0005));
  const h = p / n;
  for (let i = 0; i < n; i++) t += timeRate((i + 0.5) * h) * h;
  return TIME_PER_P * t;
}

const log = (msg) => { document.getElementById('log').textContent = msg; };

async function main() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${SIZE}px;height:${SIZE}px;`;
  document.body.append(canvas);

  const scene = new SurfaceScene(canvas, { render: { pixelRatio: 1, segments: 420, tickSize: 4.5 } });
  await scene.ready;
  scene.setLayout({ mode: 'side', region: { x: 0, y: 0, w: SIZE, h: SIZE } });

  const count = Math.floor(PMAX / STEP + 1e-9) + 1;
  for (let i = 0; i < count; i++) {
    const p = Math.min(PMAX, i * STEP);
    scene.time = timeAt(p);
    scene.progress = scene.target = p;
    scene.renderOnce();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const res = await fetch(`/__save-frame?i=${i}`, { method: 'POST', body: blob });
    if (!res.ok) throw new Error(`save failed at frame ${i}`);
    log(`frame ${i + 1} / ${count}`);
  }
  await fetch(`/__save-frame?meta=1`, {
    method: 'POST',
    body: JSON.stringify({ count, step: STEP, pmax: PMAX, size: SIZE }),
  });
  scene.dispose();
  log(`done: ${count} frames`);
  document.title = 'done';
}

main().catch((e) => { log(`error: ${e.message}`); document.title = 'error'; });
