// The final loss landscape, L(x, y).
//
// This is the exact CPU mirror of `lossField()` in shaders.js. It is purely
// analytic (no noise), so the gradient-descent particle can be integrated on
// the CPU and land exactly on the GPU-displaced geometry.
//
// Structure: a weak convex bowl + Gaussian basins (one global minimum, two
// local minima) + peaks + a curved ridge + a saddle + low-amplitude ripples.

export const LOSS_SCALE = 2.1; // world-space height multiplier at progress = 1

const g = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / s);

export function loss(x, y) {
  let h = 0.018 * (x * x + y * y); // global convex trend

  h -= 1.25 * g(x, y, 1.7, -1.3, 1.9); // global minimum
  h -= 0.75 * g(x, y, -2.2, 1.7, 1.1); // local minimum
  h -= 0.55 * g(x, y, -1.2, -2.7, 0.7); // shallow local minimum

  h += 0.95 * g(x, y, -0.5, 0.2, 1.3); // central peak
  h += 0.8 * g(x, y, 2.4, 2.3, 1.6); // far peak
  h += 0.45 * g(x, y, -3.1, -0.9, 0.9); // shoulder

  // curved ridge separating the two left basins
  const u = 0.55 * x + 0.83 * y + 0.12 * x * x - 0.6;
  h += 0.38 * Math.exp(-(u * u) / 0.22) * Math.exp(-((x + 1.8) ** 2) / 4.0);

  // saddle near (0.9, 1.4)
  const sx = x - 0.9, sy = y - 1.4;
  h += 0.22 * (sx * sx - sy * sy) * Math.exp(-(sx * sx + sy * sy) / 1.4);

  // fine-scale ripples (non-convexity at small scales)
  h += 0.055 * Math.sin(2.3 * x + 1.1 * y) * Math.cos(1.7 * y - 0.8 * x);
  h += 0.028 * Math.sin(4.1 * x - 3.3 * y + 0.7);

  return h;
}

export function lossGrad(x, y) {
  const e = 1e-3;
  return [
    (loss(x + e, y) - loss(x - e, y)) / (2 * e),
    (loss(x, y + e) - loss(x, y - e)) / (2 * e),
  ];
}

// Plain gradient descent from a fixed initialisation. Deterministic, so the
// trajectory can be scrubbed by scroll position (forward and backward).
export function descentPath(x0 = -0.95, y0 = 0.95, lr = 0.05, steps = 420) {
  const pts = [[x0, y0]];
  let x = x0, y = y0;
  for (let i = 0; i < steps; i++) {
    const [gx, gy] = lossGrad(x, y);
    // the world height is LOSS_SCALE * loss, so descend on that
    x -= lr * LOSS_SCALE * gx;
    y -= lr * LOSS_SCALE * gy;
    pts.push([x, y]);
  }
  return pts;
}
