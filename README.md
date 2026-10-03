# Wonu Park — portfolio

React + Vite + Three.js. The hero is a single procedural surface `z = f(x, y; progress)`
rendered in one GLSL vertex shader, drawn over a fixed coordinate plane; scroll
position drives `progress`. After the descent the landscape flattens into a 2D heat
map, the grid returns, and the camera zooms into one grid cell until the screen is
white; only then does the normal page begin.

**Layout:** `Hero.jsx` measures the hero text and picks `side` (text column on the
left, graphic framed in the area to its right) or `stack` (text band on top,
graphic below) — whichever gives the graphic more room — so text never overlaps
it. `SurfaceScene.js` frames the graphic inside that region at every window size.

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
| `src/hero/SurfaceScene.js` | WebGL setup, damped/rate-limited progress, adaptive resolution, disposal. |
| `src/hero/Hero.jsx` | Sticky scroll section, overlays, wheel limiter, visibility/cleanup. |

Put `resume.pdf` in `public/` and set `profile.resume` to `'/resume.pdf'`.

**Deploying:** `npm run build` and upload `dist/`. The canonical URL, Open Graph URL, `robots.txt` and `sitemap.xml` assume `https://wonupark.com/` — change them in `index.html` and `public/` if the site lives elsewhere.

## Experience galleries

Each job in `src/content.js` can have a `gallery` list of `{ src, caption, alt? }`.
Put photos in `public/gallery/…` and reference them as `src: '/gallery/…'`. Items
without a `src` render as placeholder tiles. The first photo is the cover (dark overlay,
"Click to expand"); clicking it drops the rest down as a stack, with a Collapse button at
the end. Photos keep their own shape (column max 600px wide).
