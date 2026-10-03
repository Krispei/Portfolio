// progress ∈ [0, PMAX] → every parameter of the hero.
//
//   0.00–0.12  the bare coordinate plane, shallow 3D view
//   0.05–0.35  camera rotates to plan view; a fluid layer forms on the plane
//   0.18–0.58  vortices wind up, small scales cascade in → turbulence
//   0.58–0.86  small scales die first, swirl unwinds, basins/ridges deepen,
//              camera returns to 3D — the same field becomes L(θ); the
//              grid fades out
//   0.86–1.00  gradient descent on the final landscape
//   1.04–1.22  the landscape flattens into a 2D heat map, the camera returns to
//              plan view, the grid reappears and the heat map fades away
//   1.28–1.46  the camera dollies into one cell of the grid until the whole
//              screen is white; the hero then ends and the page begins

export const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
export const PMAX = 1.5; // total length of the hero sequence

// ── Scroll pacing ───────────────────────────────────────────────────────────
// Scrolling doesn't move through progress at an even rate: the main
// presentation moments (HOLDS) take HOLD_WEIGHT× as much scrolling per unit of
// progress as the transitions between them, so the transitions go by quickly
// and the moments you're meant to look at stay on screen longer.
const HOLDS = [
  [0.46, 0.62], // turbulence + "I study Computational Physics"
  [0.88, 1.04], // gradient descent + "I'm interested in AI/ML"
  [1.2, 1.28], //  empty grid + "Let's zoom in…"
];
const HOLD_WEIGHT = 3;

// piecewise-linear map: knots of (cumulative scroll, progress)
const PACE = (() => {
  const pts = [0];
  HOLDS.forEach(([a, b]) => pts.push(a, b));
  pts.push(PMAX);
  const knots = [[0, 0]];
  for (let i = 1; i < pts.length; i++) {
    const w = i % 2 === 0 ? HOLD_WEIGHT : 1; // even segments are holds
    knots.push([knots[i - 1][0] + (pts[i] - pts[i - 1]) * w, pts[i]]);
  }
  const total = knots[knots.length - 1][0];
  return knots.map(([s, p]) => [s / total, p]);
})();

// u ∈ [0, 1] — how far through the hero's scroll — → progress ∈ [0, PMAX]
export function progressAt(u) {
  const x = Math.min(1, Math.max(0, u));
  for (let i = 1; i < PACE.length; i++) {
    const [s0, p0] = PACE[i - 1], [s1, p1] = PACE[i];
    if (x <= s1) return p0 + ((x - s0) / (s1 - s0 || 1)) * (p1 - p0);
  }
  return PMAX;
}
const DEG = Math.PI / 180;

export function surfaceParams(p) {
  const turbOut = 1 - ss(0.62, 0.84, p);
  return {
    // the fixed grid: gone while the landscape is 3D, back for the 2D ending
    uPlane: Math.max(1 - ss(0.62, 0.76, p), ss(1.1, 1.22, p)),
    uSheet: 1 - ss(1.4, 1.48, p), // its faint tint; goes to pure white at the end
    uFluid: ss(0.07, 0.28, p) * (1 - ss(1.14, 1.28, p)), // the field layer
    uHeight: 1 - ss(1.06, 1.2, p), // landscape relief; 0 = flat heat map
    uLift: 0.3 * ss(0.07, 0.28, p) * (1 - ss(0.6, 0.82, p)),
    uWave: ss(0.05, 0.22, p) * (1 - ss(0.4, 0.62, p)),
    uTurb: ss(0.18, 0.45, p) * turbOut,
    uDetail: ss(0.3, 0.52, p) * (1 - ss(0.58, 0.74, p)),
    uSwirl: ss(0.2, 0.55, p) * (1 - ss(0.6, 0.86, p)),
    uLoss: ss(0.6, 0.86, p),
  };
}

// How fast the physical clock runs: the flow is alive during the wave and
// turbulence phases, and freezes as it settles into a static loss surface.
export function timeRate(p) {
  const s = surfaceParams(p);
  return (0.25 + 0.9 * Math.max(s.uTurb, s.uWave * 0.8)) * (1 - s.uLoss);
}

export function cameraParams(p) {
  const down = ss(0.05, 0.36, p); // tilt into plan view
  const up = ss(0.6, 0.88, p); // tilt back to 3D
  const flat = ss(1.06, 1.22, p); // and back to plan view for the 2D ending
  const elevation = lerp(lerp(lerp(15, 86, down), 38, up), 89.9, flat) * DEG;
  const az3d = 20 - 18 * ss(0.05, 0.4, p) - 8 * ss(0.36, 0.62, p) - 22 * ss(0.6, 0.9, p) - 4 * ss(0.88, 1, p);
  const azimuth = lerp(az3d, 0, flat) * DEG; // 0 = grid lines run square to the screen
  const targetY = lerp(0, -0.3, up) * (1 - flat);
  // dolly into the middle of the grid cell [0, .25]²; the scene turns this
  // 0 → 1 into a log-space distance so it reads as a constant-speed zoom
  const zoom = ss(1.28, 1.46, p);
  return { elevation, azimuth, targetY, zoom, cellX: 0.125 * zoom, cellZ: -0.125 * zoom };
}

// stack mode: the text sits in a band above the graphic for the whole sequence;
// the band closes (graphic grows to the full screen) before the zoom begins
export const textBand = (p) => 1 - ss(1.16, 1.3, p);

// gradient-descent progress along the precomputed trajectory
// linear in scroll (not eased) so the pace is set purely by the window width
export const descentProgress = (p) => Math.min(1, Math.max(0, (p - 0.88) / 0.12));

// how far the graphic has moved into the "beside the text" layout (side mode):
// it slides over as the first text arrives, stays there until the last text is
// gone, then recentres
export const sideWeight = (p) => ss(0.34, 0.46, p) * (1 - ss(1.04, 1.16, p));

// the graphic gives up a strip at the top for the "Let's zoom in…" header while
// the empty 2D grid is on screen, then takes it back as the zoom runs
export const zoomWeight = (p) => ss(1.14, 1.22, p) * (1 - ss(1.34, 1.46, p));

export function overlayParams(p) {
  return {
    hint: 1 - ss(0.0, 0.035, p),
    physics: ss(0.44, 0.5, p) * (1 - ss(0.62, 0.67, p)),
    ai: ss(0.86, 0.92, p) * (1 - ss(1.04, 1.12, p)),
    particle: ss(0.86, 0.89, p) * (1 - ss(1.1, 1.18, p)),
    zoom: ss(1.2, 1.26, p), // the header's fade-in; it leaves by zooming off-screen
  };
}
