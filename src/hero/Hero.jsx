import { useEffect, useRef, useState } from 'react';
import { overlayParams, PMAX, progressAt, ss } from './phases.js';

const SCROLL_VH_PER_P = 300; // scroll distance per unit of progress
const END = 0.98; // the last 4% of the hero holds the final (white) screen
const HERO_VH = Math.round((PMAX * SCROLL_VH_PER_P) / END + 100);
const DISPOSE_AFTER_MS = 4000;
const MAX_LEAD = 0.06; // how far scroll may run ahead of the rendered progress
const MAX_WHEEL_PX = 140;
const IDLE_MS = 1000; // stopped scrolling this long mid-intro → "Keep Scrolling!"

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Hero() {
  const reduced = useRef(prefersReducedMotion()).current;
  // if WebGL can't start (old/blocked GPU), fall back to a short static intro
  // instead of 13 screens of empty scrolling
  const [noGL, setNoGL] = useState(false);
  const isStatic = reduced || noGL;
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const ui = useRef({});

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const el = ui.current;
    let scene = null;
    let loading = null;
    let visible = true;
    let disposeTimer = 0;
    let glFailed = false;

    // Decide where the text goes and where the graphic gets to live.
    //   side:  text in a column on the left, graphic in the area to its right
    //   stack: text in a band across the top, graphic in the area below it
    // Both are measured from the real text, then whichever leaves the graphic
    // more room wins, so text and graphic can never overlap.
    let layout = null;
    let zoomTop = 96; // px, where the "Let's zoom in…" header sits
    const computeLayout = () => {
      const W = stage.clientWidth, H = stage.clientHeight;
      const HEADER = 72, PAD = 104; // PAD keeps the graphic clear of the Skip button, progress bar and hint

      stage.classList.remove('hero--side');
      stage.classList.add('hero--stack');
      const textH = Math.max(el.physics.offsetHeight, el.ai.offsetHeight);
      const band = Math.round(88 + textH + 28);

      stage.classList.remove('hero--stack');
      stage.classList.add('hero--side');
      const left = stage.getBoundingClientRect().left;
      const gutter = el.physics.getBoundingClientRect().left - left; // = CSS --gutter, mirrored on the right
      const textRight = Math.max(el.physics.getBoundingClientRect().right, el.ai.getBoundingClientRect().right) - left;
      const sideX = textRight + 28;

      const sideR = { x: sideX, y: HEADER, w: W - sideX - gutter, h: H - HEADER - PAD };
      const stackR = { x: 0, y: band, w: W, h: H - band - PAD };
      // pixels per world unit the graphic would get in a region (same model the
      // camera uses: it fills ~75% of whichever axis is the tighter one); judged
      // at the two extremes of the sequence, the top-down view and the 3D view
      const ppu = (r, extH) => (0.375 * r.h) / Math.max((5.1 * r.h) / r.w, extH);
      const room = (r) => Math.min(ppu(r, 5), ppu(r, 4.4));
      const side = sideR.w >= 280 && room(sideR) >= room(stackR) * 0.97;

      if (!side) {
        stage.classList.remove('hero--side');
        stage.classList.add('hero--stack');
      }
      stage.style.setProperty('--band', `${band}px`);
      // side mode: the text's vertical centre lines up with the graphic's
      stage.style.setProperty('--side-cy', `${Math.round(sideR.y + sideR.h / 2)}px`);

      // stack mode: centre the text in the gap between the header and the top
      // of the (top-down) disc, which sits lower than the region's top edge
      const discR = 5 * ppu(stackR, 5);
      const discTop = stackR.y + stackR.h / 2 - discR;
      const gap = (discTop - 64 - textH) / 2;
      stage.style.setProperty('--text-top', `${gap >= 16 ? Math.round(64 + gap) : 88}px`);
      // the "Let's zoom in…" header: reserve a strip for it above the grid,
      // and centre it in the gap between the header and the top of the disc
      const zh = el.zoom.offsetHeight;
      const zy = 64 + zh + 56;
      const zoomRegion = { x: 0, y: zy, w: W, h: H - zy - PAD };
      const zDiscTop = zoomRegion.y + zoomRegion.h / 2 - 5 * ppu(zoomRegion, 5);
      const zGap = (zDiscTop - 64 - zh) / 2;
      zoomTop = zGap >= 12 ? Math.round(64 + zGap) : 76;
      stage.style.setProperty('--zoom-top', `${zoomTop}px`);

      layout = { mode: side ? 'side' : 'stack', region: side ? sideR : stackR, zoomRegion };
      scene?.setLayout(layout);
    };
    computeLayout();
    document.fonts?.ready.then(computeLayout); // web fonts change the text widths

    const scrollTarget = () => {
      const rect = section.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return 1;
      return progressAt(Math.max(0, -rect.top / span) / END); // paced: see HOLDS in phases.js
    };

    // write a style only when its value changes: unchanged writes still make
    // the browser re-check styles every frame
    const last = new WeakMap(); // node → { prop: value }
    const put = (node, prop, v) => {
      if (!node) return;
      let seen = last.get(node);
      if (!seen) last.set(node, (seen = {}));
      if (seen[prop] === v) return;
      seen[prop] = v;
      node.style[prop] = v;
    };
    const op = (v) => (v < 0.002 ? '0' : v > 0.998 ? '1' : v.toFixed(3));

    const onFrame = ({ progress: p, zoomScale = 1, cx = 0, cy = 0 }) => {
      const o = overlayParams(p);
      put(el.hint, 'opacity', op(o.hint));
      put(el.physics, 'opacity', op(o.physics));
      put(el.ai, 'opacity', op(o.ai));
      put(el.bar, 'transform', `scaleX(${Math.min(1, p / PMAX).toFixed(4)})`);
      // the header zooms with the grid: it magnifies about the graphic's centre,
      // so it grows and flies off the top of the screen as the camera dollies in
      const zo = op(o.zoom * (1 - ss(2.2, 5, zoomScale)));
      put(el.zoom, 'opacity', zo);
      if (zo !== '0') {
        put(el.zoom, 'transformOrigin', `${cx.toFixed(1)}px ${(cy - zoomTop).toFixed(1)}px`);
        put(el.zoom, 'transform', zoomScale > 1.001 ? `scale(${zoomScale.toFixed(4)})` : 'none'); // fades in place, no slide
      }
    };

    const ensureScene = async () => {
      if (scene || loading || glFailed) return loading;
      loading = import('./SurfaceScene.js').then(({ default: SurfaceScene }) => {
        // a fresh canvas each time: a disposed context cannot be reused
        const canvas = document.createElement('canvas');
        canvas.className = 'hero-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        stage.prepend(canvas);
        let s;
        try {
          s = scene = new SurfaceScene(canvas, { reducedMotion: reduced, onFrame });
        } catch {
          canvas.remove();
          glFailed = true;
          loading = null;
          setNoGL(true);
          return;
        }
        // show it only once its shaders are compiled, so the first frames don't stall
        return s.ready.then(() => {
          loading = null;
          if (scene !== s) return; // released while compiling
          s.setLayout(layout);
          s.setTarget(scrollTarget());
          s.progress = s.target; // arrive at the right state on (re)load
          if (reduced) s.renderOnce();
          else if (visible && !document.hidden) s.start();
          requestAnimationFrame(() => canvas.classList.add('ready'));
        });
      });
      return loading;
    };

    const release = () => {
      if (!scene) return;
      const canvas = scene.canvas;
      scene.dispose();
      canvas.remove();
      scene = null;
    };

    // "Keep Scrolling!": shown if the visitor stops partway through the intro,
    // hidden again the moment they scroll
    let idleTimer = 0;
    const showKeep = (on) => el.keep?.classList.toggle('show', on);
    const armIdle = () => {
      clearTimeout(idleTimer);
      showKeep(false);
      idleTimer = setTimeout(() => {
        const p = scrollTarget();
        if (visible && !document.hidden && p > 0.03 && p < PMAX - 0.04) showKeep(true);
      }, IDLE_MS);
    };

    const onScroll = () => {
      scene?.setTarget(scrollTarget());
      if (!reduced) armIdle();
    };

    // Inside the sequence, cap each wheel step and hold input while the
    // surface is far behind the scroll position, so a hard flick can't skip
    // a phase. Trackpads (small deltas) pass through essentially unchanged;
    // outside the sticky range scrolling is fully native.
    const onWheel = (e) => {
      if (!scene || reduced || e.ctrlKey) return;
      const rect = section.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (rect.top > 1 || -rect.top >= span - 1) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      const lead = scene.target - scene.progress;
      e.preventDefault();
      if ((dy > 0 && lead > MAX_LEAD) || (dy < 0 && lead < -MAX_LEAD)) return;
      window.scrollBy(0, Math.max(-MAX_WHEEL_PX, Math.min(MAX_WHEEL_PX, dy)));
    };
    // phones fire resize as the address bar slides in and out, but the stage
    // (100svh) doesn't change size then: skip the relayout and the redraw
    let stageW = stage.clientWidth, stageH = stage.clientHeight;
    const onResize = () => {
      if (stage.clientWidth === stageW && stage.clientHeight === stageH) return;
      stageW = stage.clientWidth; stageH = stage.clientHeight;
      computeLayout();
      if (!scene) return;
      scene.resize();
      if (reduced) scene.renderOnce();
    };

    // render only while the hero is on screen; free the GPU once it's been gone a while
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      clearTimeout(disposeTimer);
      if (visible) {
        ensureScene().then(() => { if (!reduced && !document.hidden) scene?.start(); });
      } else {
        scene?.stop();
        disposeTimer = setTimeout(release, DISPOSE_AFTER_MS);
      }
    });
    io.observe(section);

    const onVisibility = () => {
      if (!scene || reduced) return;
      if (document.hidden || !visible) scene.stop();
      else scene.start();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    ensureScene();

    return () => {
      io.disconnect();
      clearTimeout(disposeTimer);
      clearTimeout(idleTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [reduced]);

  const set = (k) => (node) => { ui.current[k] = node; };

  // jump straight past the intro to the first content section (no animation)
  const skip = () => {
    const first = document.querySelector('.portfolio .sec');
    const section = sectionRef.current;
    const top = first
      ? first.getBoundingClientRect().top + window.scrollY
      : section.offsetTop + section.offsetHeight; // content not loaded yet: just past the hero
    window.scrollTo({ top, behavior: 'instant' });
  };

  return (
    <section
      ref={sectionRef}
      className={`hero ${isStatic ? 'hero--static' : ''}`}
      style={{ height: isStatic ? '100vh' : `${HERO_VH}vh` }}
      aria-label="Introduction: a single surface that turns from a flat sheet into turbulence and then into a loss landscape"
    >
      <div className="hero-stage" ref={stageRef}>
        <div className="hero-hint" ref={set('hint')}>
          <span className="hero-hi">Hi, I’m Wonu!</span>
          <span className="hero-scroll">Scroll to learn about me!</span>
        </div>

        <div className="hero-text hero-physics" ref={set('physics')}>
          <h1>I Study Computational Physics</h1>
          <p>At Stanford University</p>
        </div>

        {!isStatic && (
          <>
            <p className="hero-keep" ref={set('keep')} aria-hidden="true"><span>Keep Scrolling!</span></p>
            <div className="hero-progress" aria-hidden="true"><i ref={set('bar')} /></div>
          </>
        )}
        <button type="button" className="hero-skip" onClick={skip}>Skip intro</button>

        <div className="hero-zoom" ref={set('zoom')}>
          <h2>Let’s zoom in…</h2>
        </div>

        <div className="hero-text hero-ai" ref={set('ai')}>
          <h2>I’m interested in AI/ML</h2>
          <p>Specifically: health applications, NLU, and a bit of inference optimization.</p>
          {reduced && <p className="hero-sub">Computational Physics · Stanford University</p>}
        </div>

      </div>
    </section>
  );
}
