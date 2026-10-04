# Wonu Park — portfolio

React + Vite. The hero is a single procedural surface `z = f(x, y; progress)`
over a fixed coordinate plane; scroll position drives `progress`. The surface is
built in Three.js/GLSL, but visitors never run it: it's baked into a sequence of
frames that the site plays back (see **Hero frames** below). The sequence ends on the finished gradient descent with
the "I'm interested in AI/ML" text; from there the page scrolls on normally,
carrying that last screen up and away as the content sections arrive.

**Layout:** `Hero.jsx` measures the hero text and picks `side` (text column on the
left, graphic framed in the area to its right) or `stack` (text band on top,
graphic below) — whichever gives the graphic more room — so text never overlaps
it. `FramePlayer.js` places and sizes the frames inside that region at every
window size, using the same framing rules as the 3D camera.

**Colours:** set `SCHEME` in `src/hero/colormaps.js` (`viridis`, `magma`, `plasma`,
`cividis`, `deep`, `ink`, `coolwarm`, `dusk`, or your own list of hex stops).
Turbulence and landscape can use different maps; pick a particle colour that
contrasts with the landscape map.

```
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
```

## Where things live

| File | What it does |
|---|---|
| `src/content.js` | **All copy**: about text and photos, experience (with galleries), skills, links. `show.projects` toggles the (currently hidden) Projects section; `profile.resume` shows the Resume link once `public/resume.pdf` exists. |
| `src/hero/phases.js` | Maps scroll progress → surface weights, camera path, text timing. Tune the story here. |
| `src/hero/shaders.js` | Fixed grid plane + the field layer: vortex flow map, waves, turbulence, loss landscape, and colormap shading. |
| `src/hero/colormaps.js` | Colour scheme presets, OKLab-interpolated into lookup textures. |
| `src/hero/landscape.js` | CPU copy of the loss function + gradient-descent path. Must stay in sync with `lossField()` in `shaders.js`. |
| `src/hero/FramePlayer.js` | **What the site runs**: streams the baked frames, cross-fades between them on a 2D canvas, places them like the 3D camera did. |
| `src/hero/SurfaceScene.js` | The live 3D scene (WebGL). Only used by the frame renderer now. |
| `src/hero/Hero.jsx` | Sticky scroll section, overlays, wheel limiter, visibility/cleanup. |

Put `resume.pdf` in `public/` and set `profile.resume` to `'/resume.pdf'`.

**Deploying:** `npm run build` and upload `dist/`. The canonical URL, Open Graph URL, `robots.txt` and `sitemap.xml` assume `https://www.wonupark.com/` — change them in `index.html` and `public/` if the site lives elsewhere.

## Hero frames

The hero graphic is a film: 261 square frames (one per 0.004 of progress) in
`public/hero-frames/d/` (1024 px, ~6 MB, desktop) and `public/hero-frames/m/`
(640 px, ~3 MB, phones), described by `src/hero/frames.json`. They load coarse
to fine (the frames around the visitor first, then every 16th, 8th, … frame) and
missing ones are blended from their neighbours, so the whole intro plays within a
second or two and sharpens as the rest arrive. Frame URLs carry the set's
fingerprint (`version`), so `vercel.json` lets browsers cache them for a year.

The loading screen is inline in `index.html`; `src/loading.js` fades it out once
the first frame and the fonts are in (6 s at most). It only becomes visible if
loading takes longer than 0.3 s.

After changing anything in the 3D scene (`phases.js`, `shaders.js`,
`colormaps.js`, `landscape.js`, `SurfaceScene.js`), re-bake the frames:

1. `npm run dev`, then open http://localhost:5173/tools/render-frames.html and
   wait for "done" (it writes PNGs to `.frames-src/`).
2. `python3 tools/encode-frames.py` (needs Pillow) to write the WebP sets and
   `frames.json`. Then `.frames-src/` can be deleted.

Frame size and quality are at the top of `tools/encode-frames.py`; how lively
the turbulence is (`TIME_PER_P`) and the frame spacing are at the top of
`tools/render-frames.js`.

## Experience galleries

Each job in `src/content.js` can have a `gallery` list of `{ src, caption, alt? }`.
Put photos in `public/gallery/…` and reference them as `src: '/gallery/…'`. Items
without a `src` render as placeholder tiles. The first photo is the cover (dark overlay,
"Click to expand"); clicking it drops the rest down as a stack, with a Collapse button at
the end. Photos keep their own shape (column max 600px wide).
