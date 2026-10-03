import * as THREE from 'three';
import { planeVertex, planeFragment, fieldVertex, fieldFragment } from './shaders.js';
import { SCHEME, bakeColormap } from './colormaps.js';
import { surfaceParams, cameraParams, timeRate, descentProgress, overlayParams, sideWeight, textBand, zoomWeight, PMAX } from './phases.js';
import { loss, descentPath, LOSS_SCALE } from './landscape.js';

const ACCENT = new THREE.Color(SCHEME.particle);
const ZOOM_START = 1.28; // progress at which the final zoom begins (see phases.js)
const MAX_RATE = 0.4; // max progress per second — a flick can't skip a phase
const SMOOTHING = 5.0;

/**
 * Owns the WebGL context for the hero. Scroll sets a *target* progress; the
 * rendered progress chases it with damping and a rate limit, so the sequence
 * is scrubbable in both directions but never jumps.
 */
export default class SurfaceScene {
  constructor(canvas, { reducedMotion = false, onFrame } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.onFrame = onFrame;
    this.target = reducedMotion ? 1 : 0;
    this.progress = this.target;
    this.time = 0;
    this.running = false;
    this.dirty = true;
    this.frameTimes = [];
    // where the graphic lives while text is on screen (CSS px in the canvas);
    // Hero.jsx measures the text and sets this. 'side' = beside it, 'stack' = below it.
    this.layout = null;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._init();
  }

  _init() {
    const { canvas } = this;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;

    // Multisampling (MSAA) costs a lot of GPU memory and fill rate, and on a
    // high-density screen the pixels are too small to show jagged edges anyway.
    // The grid and contours are anti-aliased analytically in the shader.
    const antialias = (window.devicePixelRatio || 1) < 1.5;
    // 'default' GPU: asking for 'high-performance' makes dual-GPU Macs switch to
    // the discrete GPU, which can flicker the whole screen; this scene is light
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: false, powerPreference: 'default' });
    this.renderer.setClearColor(0xffffff, 1);
    this.maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

    // colormaps → 256×1 lookup textures (sRGB bytes, written straight out)
    const lut = (name) => {
      const tex = new THREE.DataTexture(bakeColormap(name), 256, 1, THREE.RGBAFormat);
      tex.magFilter = tex.minFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    };
    this.textures = [lut(SCHEME.turbulence), lut(SCHEME.landscape)];

    // loss range over the visible disc, so the colormap spans exactly min → max
    let lo = Infinity, hi = -Infinity;
    for (let x = -5; x <= 5; x += 0.05) for (let y = -5; y <= 5; y += 0.05) {
      if (x * x + y * y > 23) continue;
      const v = loss(x, y);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }

    this.uniforms = {
      uTime: { value: 0 },
      uPlane: { value: 1 },
      uFluid: { value: 0 },
      uLift: { value: 0 },
      uWave: { value: 0 },
      uTurb: { value: 0 },
      uDetail: { value: 0 },
      uSwirl: { value: 0 },
      uLoss: { value: 0 },
      uLossScale: { value: LOSS_SCALE },
      uHeight: { value: 1 },
      uSheet: { value: 1 },
      uLossRange: { value: new THREE.Vector2(lo, hi) },
      uMapTurb: { value: this.textures[0] },
      uMapLoss: { value: this.textures[1] },
      uCamPos: { value: new THREE.Vector3() },
    };

    // the coordinate plane: flat, fixed, drawn first and never occluding the
    // field (no depth write), so the fluid always sits on top of it
    this.planeGeo = new THREE.PlaneGeometry(10, 10, 1, 1);
    this.planeGeo.deleteAttribute('normal');
    this.planeGeo.deleteAttribute('uv');
    this.planeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: planeVertex,
      fragmentShader: planeFragment,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(this.planeGeo, this.planeMat);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.renderOrder = 0;
    this.scene.add(this.plane);

    // the field: one continuous surface — fluid, then loss landscape
    // fewer vertices on phones and on devices that report little CPU / memory
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const seg = mobile ? 170 : weak ? 220 : 300;
    this.geometry = new THREE.PlaneGeometry(10, 10, seg, seg);
    // only positions are used (normals are computed in the shader)
    this.geometry.deleteAttribute('normal');
    this.geometry.deleteAttribute('uv');
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: fieldVertex,
      fragmentShader: fieldFragment,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // local (x, y, z=height) → world (x, z, -y)
    this.mesh.frustumCulled = false; // displacement happens on the GPU
    this.mesh.renderOrder = 1;
    this.scene.add(this.mesh);

    // gradient descent — integrated on the CPU against the analytic L(x, y)
    this.path = descentPath(-0.6, -0.2, 0.02, 200);
    const lift = 0.03;
    const pts = new Float32Array(this.path.length * 3);
    this.path.forEach(([x, y], i) => {
      pts[i * 3] = x;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = LOSS_SCALE * loss(x, y) + lift;
    });
    // trail: a thin tube revealed step by step. TubeGeometry samples by arc
    // length, so map each iterate k to the tube segment at its arc length.
    const vecs = this.path.map((_, i) => new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
    const SEG = 600, RADIAL = 6;
    this.trailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vecs, false, 'centripetal'), SEG, 0.016, RADIAL, false);
    const arc = [0];
    for (let i = 1; i < vecs.length; i++) arc.push(arc[i - 1] + vecs[i].distanceTo(vecs[i - 1]));
    this.trailSeg = arc.map((a) => (a / arc[arc.length - 1]) * SEG);
    this.trailStride = RADIAL * 6; // indices per tube segment
    this.trailMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 });
    this.trail = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trail.frustumCulled = false;
    // trail + dots live in a group so the descent flattens with the landscape
    this.pathGroup = new THREE.Group();
    this.mesh.add(this.pathGroup);
    this.pathGroup.add(this.trail);

    // every 12th iterate as a dot — step spacing shows the descent slowing
    const every = 12;
    const ticks = new Float32Array(Math.ceil(this.path.length / every) * 3);
    for (let i = 0, k = 0; i < this.path.length; i += every, k++) ticks.set(pts.subarray(i * 3, i * 3 + 3), k * 3);
    this.tickEvery = every;
    this.tickGeo = new THREE.BufferGeometry();
    this.tickGeo.setAttribute('position', new THREE.BufferAttribute(ticks, 3));
    this.tickMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0 });
    this.ticks = new THREE.Points(this.tickGeo, this.tickMat);
    this.ticks.frustumCulled = false;
    this.pathGroup.add(this.ticks);

    this.ballGeo = new THREE.SphereGeometry(0.075, 24, 16);
    this.ballMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 });
    this.ball = new THREE.Mesh(this.ballGeo, this.ballMat);
    this.mesh.add(this.ball);

    this.ringGeo = new THREE.RingGeometry(0.12, 0.14, 48);
    this.ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.mesh.add(this.ring); // lies in the local xy plane → horizontal in world
    [this.trail, this.ticks, this.ball, this.ring].forEach((o) => { o.renderOrder = 2; });

    this.resize();
    this._warmup();
  }

  // Compile every shader and upload every buffer and texture up front, instead
  // of the first time each object appears (which stalled a frame when the
  // fluid, and later the descent, came in). Shaders compile in the background
  // where the browser supports it; `ready` resolves once they're done and one
  // frame with everything drawn has uploaded the rest. Objects hidden at this
  // point are fully transparent, so that frame looks like a normal one.
  _warmup() {
    this._update(this.progress);
    const objs = [this.mesh, this.trail, this.ticks, this.ball, this.ring];
    const withAll = (fn) => {
      const shown = objs.map((o) => o.visible);
      objs.forEach((o) => { o.visible = true; });
      try { return fn(); } finally { objs.forEach((o, i) => { o.visible = shown[i]; }); }
    };
    this.ready = withAll(() => this.renderer.compileAsync(this.scene, this.camera))
      .catch(() => {})
      .then(() => {
        if (this.disposed) return;
        this._update(this.progress);
        withAll(() => this.renderer.render(this.scene, this.camera));
        this.dirty = true;
      });
  }

  resize() {
    // CSS decides the canvas box (full stage on wide screens, the area below
    // the text on narrow ones); render at exactly that size
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    // Resizing a canvas wipes it (to black, as it has no alpha), so do it only
    // when something really changed — phones fire resize events as the address
    // bar slides — and redraw straight away so the wiped buffer is never shown.
    if (w === this.width && h === this.height && this.dpr === this._sizedDpr) return;
    this.width = w;
    this.height = h;
    this._sizedDpr = this.dpr;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    if (this._drawn) this.renderOnce();
  }

  setLayout(layout) {
    this.layout = layout;
    this.dirty = true;
  }

  setTarget(p) {
    const t = this.reducedMotion ? 1 : Math.min(PMAX, Math.max(0, p));
    if (t !== this.target) {
      this.target = t;
      this.dirty = true;
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
    if (this.reducedMotion) {
      this.progress = 1;
    } else {
      let d = (this.target - this.progress) * (1 - Math.exp(-dt * SMOOTHING));
      const cap = MAX_RATE * dt;
      d = Math.max(-cap, Math.min(cap, d));
      this.progress += d;
      if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;
    }
    const p = this.progress;

    const rate = this.reducedMotion ? 0 : timeRate(p);
    this.time += dt * rate;

    // nothing moves → don't spend a frame
    if (!this.dirty && prev === p && rate < 1e-4) return;
    this.dirty = false;

    this._update(p);
    this.renderer.render(this.scene, this.camera);
    this._drawn = true;
    this._adapt(dt);
  }

  // Where the graphic is framed (region R of the canvas) and how far the camera
  // must sit, before any zoom, for the content to fit there.
  _frame(p) {
    const W = this.width, H = this.height;
    const TAN = Math.tan((34 * Math.PI) / 360);
    const c = cameraParams(p);
    const sp = surfaceParams(p);

    // The graphic is framed inside a region of the canvas: the whole canvas
    // when no text is up, the area beside / below the text when there is.
    const L = this.layout || { mode: 'side', region: { x: 0, y: 0, w: W, h: H } };
    const wgt = L.mode === 'stack' ? textBand(p) : sideWeight(p);
    const R = {
      x: L.region.x * wgt,
      y: L.region.y * wgt,
      w: W + (L.region.w - W) * wgt,
      h: H + (L.region.h - H) * wgt,
    };
    // while the "Let's zoom in…" header is up, frame the graphic below it
    const zw = zoomWeight(p);
    if (zw > 0 && this.layout?.zoomRegion) {
      const Z = this.layout.zoomRegion;
      R.x += (Z.x - R.x) * zw;
      R.y += (Z.y - R.y) * zw;
      R.w += (Z.w - R.w) * zw;
      R.h += (Z.h - R.h) * zw;
    }

    // Distance: pick the closest camera for which the content still fits R
    // with a margin. Content half-extents: the disc is 5 wide; its projected
    // height grows with elevation and with the relief of the surface.
    const tanV = TAN, tanH = TAN * (R.w / R.h);
    const sinE = Math.sin(c.elevation), cosE = Math.cos(c.elevation);
    const amp = 0.5 + 1.2 * sp.uLoss * sp.uHeight;
    const extW = 5.1, extH = 5 * sinE + amp * cosE;
    const FILL = 0.75;
    const d0 = Math.max(extW / (FILL * tanH), extH / (FILL * tanV));
    return { c, R, d0 };
  }

  _update(p) {
    const u = this.uniforms;
    const s = surfaceParams(p);
    for (const k in s) u[k].value = s[k];
    u.uTime.value = this.time;
    // the fluid layer (and the descent drawn on it) is invisible at the start and
    // in the 2D ending: don't even run its ~90k vertices then
    this.mesh.visible = u.uFluid.value > 0.002;

    // camera on a sphere around the target
    const cam = this.camera;
    const W = this.width, H = this.height;
    const TAN = Math.tan((34 * Math.PI) / 360); // every region is framed at 34° vertical
    const { c, R, d0 } = this._frame(p);
    let d = d0;
    let zoomScale = 1;
    if (c.zoom > 0) {
      // final distance: the whole canvas fits inside one grid cell (0.25 wide)
      const dEnd = 0.1 / (TAN * Math.max(1, W / H));
      d = d0 * Math.pow(dEnd / d0, c.zoom);
      // how much the view has magnified since the zoom began (the header
      // text uses this to zoom along with the grid)
      zoomScale = this._frame(ZOOM_START).d0 / d;
    }
    // Emulate a 34° camera framed in R using the full canvas: widen the FOV so
    // R's height maps to the full height, then shift R's centre to the middle
    cam.aspect = W / H;
    cam.fov = (2 * Math.atan((TAN * H) / R.h) * 180) / Math.PI;
    const sinE = Math.sin(c.elevation), cosE = Math.cos(c.elevation);
    cam.position.set(
      c.cellX + d * cosE * Math.sin(c.azimuth),
      d * sinE + c.targetY,
      c.cellZ + d * cosE * Math.cos(c.azimuth),
    );
    cam.lookAt(c.cellX, c.targetY, c.cellZ);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2; // where the graphic is centred on screen
    const dx = cx - W / 2, dy = cy - H / 2;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) cam.setViewOffset(W, H, -dx, -dy, W, H);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const o = overlayParams(p);
    u.uCamPos.value.copy(cam.position);

    // descent
    const g = descentProgress(p) * (this.path.length - 1);
    const i = Math.floor(g), f = g - i;
    const a = this.path[i], b = this.path[Math.min(i + 1, this.path.length - 1)];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    const z = LOSS_SCALE * loss(x, y);
    const hs = u.uHeight.value; // the descent flattens along with the landscape
    this.pathGroup.scale.z = Math.max(1e-3, hs);
    this.ball.position.set(x, y, z * hs + 0.075);
    this.ring.position.set(x, y, z * hs + 0.02);
    this.ringMat.opacity = 0.5 * o.particle;
    this.ballMat.opacity = o.particle;
    this.trailMat.opacity = 0.9 * o.particle;
    this.tickMat.opacity = 0.7 * o.particle;
    const seg = this.trailSeg[i] + (this.trailSeg[Math.min(i + 1, this.path.length - 1)] - this.trailSeg[i]) * f;
    this.trailGeo.setDrawRange(0, Math.round(seg) * this.trailStride);
    this.ticks.geometry.setDrawRange(0, Math.floor(i / this.tickEvery) + 1);
    this.ball.visible = this.ring.visible = this.trail.visible = this.ticks.visible = o.particle > 0.001;

    this.onFrame?.({ progress: p, zoomScale, cx, cy });
  }

  // Drop resolution if frames are slow; recover when there is headroom. Each
  // change reallocates the canvas, so it must not flip back and forth: a
  // resolution that proved too slow is never tried again (the ceiling comes
  // down with it), and a change is followed by a settling period.
  _adapt(dt) {
    if (this._settle > 0) { this._settle--; return; }
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let next = this.dpr;
    if (avg > 24 && this.dpr > 0.85) {
      next = Math.max(0.85, this.dpr - 0.25);
      this.maxDpr = next; // don't climb back to the slow one
    } else if (avg < 14 && this.dpr + 0.25 <= this.maxDpr) {
      next = this.dpr + 0.25;
    }
    if (next !== this.dpr) {
      this.dpr = next;
      this.renderer.setPixelRatio(next);
      this.resize();
      this._settle = 30;
    }
  }

  renderOnce() {
    this._update(this.progress);
    this.renderer.render(this.scene, this.camera);
    this._drawn = true;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    [this.geometry, this.planeGeo, this.trailGeo, this.tickGeo, this.ballGeo, this.ringGeo].forEach((g) => g.dispose());
    [this.material, this.planeMat, this.trailMat, this.tickMat, this.ballMat, this.ringMat].forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
