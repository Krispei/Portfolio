import { cameraParams, surfaceParams, sideWeight, PMAX } from './phases.js';
import manifest from './frames.json';

// The hero graphic as a pre-rendered film: tools/render-frames.html bakes the 3D
// scene (SurfaceScene.js) into one square frame per progress step, and this
// plays them back on a 2D canvas, so no GPU work happens on the visitor's device.
//
// It keeps SurfaceScene's interface (setTarget / setLayout / start / stop /
// resize / dispose / ready) and its movement: each frame is placed and sized
// with the same framing rules the live camera used, so the graphic still slides
// beside the text, sits below it on narrow screens, and grows and shrinks as it
// did. Adjacent frames are cross-faded, so scrubbing is smooth.

const MAX_RATE = 0.9; // max progress per second — a flick can't skip a phase
const SMOOTHING = 5.0;
const CONCURRENT = 6; // frame downloads in flight at once
const FEATHER = 0.07; // fraction of the frame, at each edge, faded into the page

const { count, step, sets, bg } = manifest;
const frameIndex = (p) => Math.min(count - 1, Math.max(0, p / step));

export default class FramePlayer {
  constructor(canvas, { reducedMotion = false, onFrame, progress = 0 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('2D canvas unavailable');
    this.reducedMotion = reducedMotion;
    this.onFrame = onFrame;
    this.target = reducedMotion ? 1 : Math.min(PMAX, Math.max(0, progress));
    this.progress = this.target;
    this.layout = null;
    this.running = false;
    this.dirty = true;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);

    // phones (and low-memory devices) get the smaller set
    const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.deviceMemory || 8) <= 4;
    this.set = small ? 'm' : 'd';
    this.frames = new Array(count).fill(null); // HTMLImageElement once loaded
    this.pending = new Set();

    this.resize();
    // ready once the frame for the starting position is in; the rest stream in
    // behind it, nearest to the current position first
    const first = Math.round(frameIndex(this.target));
    this.ready = this._fetch(first).then(() => { this._pump(); });
  }

  // ── loading ─────────────────────────────────────────────────────────────
  _fetch(i) {
    this.pending.add(i);
    const img = new Image();
    img.decoding = 'async';
    img.src = `/hero-frames/${this.set}/${String(i).padStart(4, '0')}.webp`;
    return img.decode().then(
      () => {
        this.pending.delete(i);
        if (!this.frames) return; // disposed
        this.frames[i] = img;
        this.dirty = true;
        if (!this.running) this.renderOnce();
      },
      () => { this.pending.delete(i); },
    );
  }

  // keep CONCURRENT downloads going, always picking the missing frame
  // nearest to where the visitor is now
  _pump() {
    if (!this.frames) return;
    const at = Math.round(frameIndex(this.target));
    while (this.pending.size < CONCURRENT) {
      let next = -1;
      for (let d = 0; d < count && next < 0; d++) {
        for (const i of [at + d, at - d]) {
          if (i >= 0 && i < count && !this.frames[i] && !this.pending.has(i)) { next = i; break; }
        }
      }
      if (next < 0) return;
      this._fetch(next).then(() => this._pump());
    }
  }

  _nearest(i) {
    for (let d = 0; d < count; d++) {
      if (this.frames[i - d]) return this.frames[i - d];
      if (this.frames[i + d]) return this.frames[i + d];
    }
    return null;
  }

  // ── framing ─────────────────────────────────────────────────────────────
  // Where the frame goes: centre (cx, cy) and size D in CSS px. The live camera
  // fitted the content into region R (the whole stage, or beside / below the
  // text); the frames were rendered fitted into a square. Matching the scale at
  // the look-at point: D = R.h · d_square / d_R, with d the fitted distances.
  _place(p) {
    const W = this.width, H = this.height;
    const L = this.layout || { mode: 'side', region: { x: 0, y: 0, w: W, h: H } };
    const wgt = L.mode === 'stack' ? 1 : sideWeight(p);
    const R = {
      x: L.region.x * wgt,
      y: L.region.y * wgt,
      w: W + (L.region.w - W) * wgt,
      h: H + (L.region.h - H) * wgt,
    };
    const c = cameraParams(p), sp = surfaceParams(p);
    const amp = 0.5 + 1.2 * sp.uLoss * sp.uHeight;
    const extW = 5.1, extH = 5 * Math.sin(c.elevation) + amp * Math.cos(c.elevation);
    const D = (R.h * Math.max(extW, extH)) / Math.max((extW * R.h) / R.w, extH);
    return { cx: R.x + R.w / 2, cy: R.y + R.h / 2, D };
  }

  _draw(p) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const f = frameIndex(p);
    const i = Math.floor(f), a = f - i;
    const A = this.frames[i] || this._nearest(i);
    if (A) {
      const { cx, cy, D } = this._place(p);
      const x = cx - D / 2, y = cy - D / 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(A, x, y, D, D);
      const B = a > 0.02 && this.frames[i + 1];
      if (B) {
        ctx.globalAlpha = a;
        ctx.drawImage(B, x, y, D, D);
        ctx.globalAlpha = 1;
      }
      // compression shifts the frame's flat background by a level or two:
      // fade its edges into the exact page colour so the square never shows
      const e = D * FEATHER;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [x, 0, x + e, 0, x, y, e, D], [x + D, 0, x + D - e, 0, x + D - e, y, e, D],
        [0, y, 0, y + e, x, y, D, e], [0, y + D, 0, y + D - e, x, y + D - e, D, e],
      ]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, bg);
        g.addColorStop(1, `${bg}00`);
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
    this.onFrame?.({ progress: p });
  }

  // ── SurfaceScene-compatible interface ───────────────────────────────────
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.renderOnce(); // resizing wipes the canvas: redraw straight away
  }

  setLayout(layout) {
    this.layout = layout;
    this.dirty = true;
    if (!this.running) this.renderOnce();
  }

  setTarget(p) {
    const t = this.reducedMotion ? 1 : Math.min(PMAX, Math.max(0, p));
    if (t !== this.target) {
      this.target = t;
      this.dirty = true;
      this._pump();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _loop(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    // damped, rate-limited chase of the scroll target
    const prev = this.progress;
    let d = (this.target - this.progress) * (1 - Math.exp(-dt * SMOOTHING));
    const cap = MAX_RATE * dt;
    d = Math.max(-cap, Math.min(cap, d));
    this.progress += d;
    if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;

    if (!this.dirty && prev === this.progress) return; // nothing changed
    this.dirty = false;
    this._draw(this.progress);
  }

  renderOnce() {
    if (this.width) this._draw(this.progress);
  }

  dispose() {
    this.stop();
    this.frames = null; // drop the decoded images
    this.canvas.width = this.canvas.height = 0;
  }
}
