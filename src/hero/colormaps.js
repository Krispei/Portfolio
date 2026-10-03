// ─────────────────────────────────────────────────────────────────────────────
// Hero colour scheme.
//
// Change SCHEME to any key of COLORMAPS (or add your own list of hex stops,
// low → high). Turbulence and the loss landscape can use the same map or
// different ones; the shader cross-fades between them during the hand-off.
// Stops are interpolated in OKLab, so any list of colours gives a smooth,
// perceptually even gradient.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEME = {
  turbulence: 'viridis',
  landscape: 'viridis',
  particle: '#ff3232', // gradient-descent particle + trail
};

export const COLORMAPS = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
  cividis: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#fee838'],
  // cmocean-style ocean map: navy → teal → pale mint
  deep: ['#281a2c', '#3f396c', '#3e5f99', '#3f86a8', '#4fabb1', '#7ccdb6', '#c0e8c1', '#fdfecc'],
  // monochrome ink with a cold tint — closest to the original look
  ink: ['#14161a', '#2c3440', '#4c5a6b', '#7a8796', '#aeb7c1', '#dde2e7', '#f7f8f9'],
  // diverging: blue ↔ near-white ↔ red (good for vorticity sign)
  coolwarm: ['#3b4cc0', '#6788ee', '#9abbff', '#c9d7f0', '#edd1c2', '#f7a889', '#e26952', '#b40426'],
  // warm sunset: indigo → rose → amber
  dusk: ['#1b1b3a', '#3b2c63', '#693d7e', '#9b4f86', '#c9677f', '#ea8a6f', '#f8b867', '#f9e9a6'],
};

// ── OKLab interpolation ──────────────────────────────────────────────────────
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, toSrgb(c))));
}

/** 256 RGBA texels (sRGB bytes) sampled smoothly along the stops. */
export function bakeColormap(nameOrStops, size = 256) {
  const stops = (Array.isArray(nameOrStops) ? nameOrStops : COLORMAPS[nameOrStops] || COLORMAPS.viridis).map(hexToOklab);
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    const lab = stops[k].map((v, j) => v + (stops[k + 1][j] - v) * f);
    const rgb = oklabToSrgb(lab);
    out.set([rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, 255], i * 4);
  }
  return out;
}
