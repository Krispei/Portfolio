// Two layers.
//
//  · The coordinate plane: a flat, fixed reference grid at z = 0. It never
//    moves; it fades out once the loss landscape has formed.
//
//  · The field: one continuous surface z = f(x, y; progress, t) drawn on top of
//    the plane. Its vertices only move vertically. Fluid motion is Eulerian:
//    each point samples a dye/vorticity field through an area-preserving flow
//    map φ, so the *colour* swirls while the coordinate system stays put. The
//    same surface then grows into the loss landscape.

const noise = /* glsl */ `
// 2D simplex noise — Ashima Arts / Stefan Gustavson (MIT)
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

// Exact GLSL mirror of loss() in landscape.js — keep the two in sync.
const lossGLSL = /* glsl */ `
float gss(vec2 p, vec2 c, float s) { vec2 d = p - c; return exp(-dot(d, d) / s); }
float lossField(vec2 p) {
  float x = p.x, y = p.y;
  float h = 0.018 * (x * x + y * y);
  h -= 1.25 * gss(p, vec2(1.7, -1.3), 1.9);
  h -= 0.75 * gss(p, vec2(-2.2, 1.7), 1.1);
  h -= 0.55 * gss(p, vec2(-1.2, -2.7), 0.7);
  h += 0.95 * gss(p, vec2(-0.5, 0.2), 1.3);
  h += 0.8  * gss(p, vec2(2.4, 2.3), 1.6);
  h += 0.45 * gss(p, vec2(-3.1, -0.9), 0.9);
  float u = 0.55 * x + 0.83 * y + 0.12 * x * x - 0.6;
  h += 0.38 * exp(-(u * u) / 0.22) * exp(-((x + 1.8) * (x + 1.8)) / 4.0);
  float sx = x - 0.9, sy = y - 1.4;
  h += 0.22 * (sx * sx - sy * sy) * exp(-(sx * sx + sy * sy) / 1.4);
  h += 0.055 * sin(2.3 * x + 1.1 * y) * cos(1.7 * y - 0.8 * x);
  h += 0.028 * sin(4.1 * x - 3.3 * y + 0.7);
  return h;
}
`;

export const planeVertex = /* glsl */ `
varying vec2 vQ;
varying vec3 vWorld;
void main() {
  vQ = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const gridLine = /* glsl */ `
float gridLine(float coord, float width) {
  float d = abs(fract(coord - 0.5) - 0.5);
  float fw = fwidth(coord);
  return 1.0 - smoothstep(width * fw, (width + 1.2) * fw, d);
}
`;

export const planeFragment = /* glsl */ `
uniform float uPlane;
uniform float uSheet;
uniform vec3 uCamPos;
varying vec2 vQ;
varying vec3 vWorld;
${gridLine}
void main() {
  float r = length(vQ) / 5.0;
  if (r > 1.0 || uPlane < 0.002) discard;
  float minor = clamp(gridLine(vQ.x * 4.0, 0.15) + gridLine(vQ.y * 4.0, 0.15), 0.0, 1.0);
  float major = clamp(gridLine(vQ.x * 0.8, 0.35) + gridLine(vQ.y * 0.8, 0.35), 0.0, 1.0);
  float minorFade = 1.0 - smoothstep(0.18, 0.45, length(fwidth(vQ * 4.0)));
  float ink = 0.3 * minorFade * minor + 0.32 * major;
  // a faint sheet so the plane reads as a surface, not just lines
  float alpha = max(ink, 0.03 * uSheet);
  float edge = 1.0 - smoothstep(0.8, 0.995, r);
  float fog = 1.0 - smoothstep(1.0, 8.5, length(uCamPos - vWorld) - length(uCamPos));
  gl_FragColor = vec4(vec3(0.08, 0.09, 0.1), alpha * edge * fog * uPlane);
}
`;

// Shared by the vertex shader (relief) and the fragment shader (colour), so the
// dye is advected per pixel rather than interpolated between mesh vertices.
const flowGLSL = /* glsl */ `
// Eddy centres and strengths depend only on time, so they're computed once per
// frame on the CPU (vortexParams() below) instead of for every vertex and pixel:
// uVort[i] = (centre.x, centre.y, signed strength before the uSwirl/uDetail gates).
uniform vec3 uVort[26];

// One vortex = a twist map about c. Twist maps are area-preserving and
// invertible, so composing them is an incompressible stirring of the plane.
// Beyond 3 radii the twist is < 0.0004 rad — invisible — so it's skipped.
void vortex(inout vec2 p, inout float core, inout float vort, vec2 c, float R, float s) {
  vec2 r = p - c;
  float d2 = dot(r, r) / (R * R);
  if (d2 > 9.0) return;
  float k = exp(-d2);
  float a = s * k;
  float ca = cos(a), sa = sin(a);
  p = c + vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y);
  core += abs(s) * k;
  vort += s * k;
}

// Three generations of eddies — large, medium, small — on golden-angle
// spirals. Small generations are gated by uDetail (energy cascade).
vec2 flowMap(vec2 q, float t, out float core, out float vort) {
  vec2 p = q;
  core = 0.0;
  vort = 0.0;
  for (int i = 0; i < 4; i++) vortex(p, core, vort, uVort[i].xy, 1.75, uVort[i].z * uSwirl);
  if (uDetail > 0.0005) {
    float s2 = uSwirl * uDetail, s3 = s2 * uDetail;
    for (int i = 4; i < 12; i++) vortex(p, core, vort, uVort[i].xy, 0.85, uVort[i].z * s2);
    for (int i = 12; i < 26; i++) vortex(p, core, vort, uVort[i].xy, 0.42, uVort[i].z * s3);
  }
  return p;
}
`;

// CPU side of flowMap: the eddies' centres and strengths at time t, written
// into `out` (an array of 26 THREE.Vector3). Same formulas the shader used.
const GOLDEN = 2.39996323;
export function vortexParams(t, out) {
  let k = 0;
  for (let i = 0; i < 4; i++, k++) {
    const ang = i * GOLDEN + 0.6;
    out[k].set(
      2.3 * Math.cos(ang) + 0.45 * Math.sin(t * 0.21 + i),
      2.3 * Math.sin(ang) + 0.45 * Math.cos(t * 0.17 + 1.7 * i),
      (i % 2 === 0 ? 1 : -1) * (2.6 + 0.5 * Math.sin(t * 0.33 + i)),
    );
  }
  for (let i = 0; i < 8; i++, k++) {
    const ang = i * GOLDEN + 2.1;
    const rad = 1.1 + 2.9 * Math.sqrt((i + 0.5) / 8);
    out[k].set(
      rad * Math.cos(ang) + 0.35 * Math.sin(t * 0.37 + 2 * i),
      rad * Math.sin(ang) + 0.35 * Math.cos(t * 0.31 + i),
      (i % 2 === 0 ? -1 : 1) * (2.1 + 0.6 * Math.sin(t * 0.5 + i)),
    );
  }
  for (let i = 0; i < 14; i++, k++) {
    const ang = i * GOLDEN + 4.0;
    const rad = 0.4 + 3.9 * Math.sqrt((i + 0.5) / 14);
    out[k].set(
      rad * Math.cos(ang) + 0.25 * Math.sin(t * 0.6 + i),
      rad * Math.sin(ang) + 0.25 * Math.cos(t * 0.55 + 3 * i),
      (i % 2 === 0 ? 1 : -1) * (1.3 + 0.4 * Math.sin(t * 0.8 + i)),
    );
  }
}

export const fieldVertex = /* glsl */ `
uniform float uTime;
uniform float uWave;    // phase 2: travelling waves
uniform float uTurb;    // phase 3: turbulent relief
uniform float uDetail;  // multiscale content (small eddies)
uniform float uSwirl;   // strength of the vortex flow map
uniform float uLoss;    // phase 5: loss landscape
uniform float uLift;    // the fluid floats just above the plane
uniform float uHeight;  // landscape relief multiplier (0 = flat heat map)
uniform float uLossScale;

varying vec2 vQ;
varying float vH;
varying vec3 vWorld;
varying vec3 vN;

${noise}
${lossGLSL}
${flowGLSL}
float fbm(vec2 p, float t) {
  vec2 w = p + 0.65 * vec2(snoise(p * 0.45 + vec2(0.0, t * 0.12)), snoise(p * 0.45 + vec2(5.2, -t * 0.1)));
  float h = 0.0;
  h += 1.0   * snoise(w * 0.5 + t * 0.05);
  h += 0.5   * snoise(w * 1.0 - t * 0.08);
  h += 0.25  * uDetail * snoise(w * 2.1 + t * 0.13);
  h += 0.125 * uDetail * snoise(w * 4.3 - t * 0.2);
  return h;
}

float heightAt(vec2 q) {
  float t = uTime;
  // Each term is skipped while its weight is zero (the result would be
  // multiplied by 0 anyway), so the cheap phases cost almost nothing.
  float core = 0.0, vort = 0.0;
  vec2 p = q;
  if (uSwirl > 0.0005) p = flowMap(q, t, core, vort);

  float h = uLift;

  // phase 2 — superposed travelling waves (Eulerian: evaluated at q)
  if (uWave > 0.0005) {
    float hW = 0.16 * sin(0.8 * q.x + 0.5 * q.y - 1.1 * t)
             + 0.11 * sin(-0.4 * q.x + 0.9 * q.y - 0.8 * t + 1.3)
             + 0.07 * sin(1.3 * q.x - 0.2 * q.y - 1.5 * t + 2.0);
    h += uWave * hW;
  }

  // phase 4/5 — loss landscape sampled through the flow map: it emerges
  // still stirred and straightens out as uSwirl -> 0 (p -> q)
  float L = 0.0;
  if (uLoss > 0.0005) L = lossField(p);

  // phase 3 — relief of the stirred field: eddy cores dip, advected noise
  if (uTurb > 0.0005) {
    float hT = 0.22 * fbm(p, t) - 0.08 * core;
    float gate = mix(1.0, 2.2 * smoothstep(-0.6, 0.9, L), uLoss);
    h += uTurb * hT * gate;
  }

  if (uLoss > 0.0005) h += uLoss * uLossScale * L * uHeight;
  return h;
}

void main() {
  vec2 q = position.xy;
  float h = heightAt(q);

  // normal from wide central differences (~3 mesh cells): the relief has finer
  // detail than the mesh resolves, and a one-cell stencil aliases it into
  // zig-zag shading. The geometry itself is unchanged.
  const float e = 0.1;
  float dx = heightAt(q + vec2(e, 0.0)) - heightAt(q - vec2(e, 0.0));
  float dy = heightAt(q + vec2(0.0, e)) - heightAt(q - vec2(0.0, e));
  vec3 nl = normalize(vec3(-dx / (2.0 * e), -dy / (2.0 * e), 1.0));

  vQ = q;
  vH = h;
  vec4 world = modelMatrix * vec4(q, h, 1.0); // vertices only move vertically
  vWorld = world.xyz;
  vN = mat3(modelMatrix) * nl;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const fieldFragment = /* glsl */ `
uniform float uFluid;     // overall opacity of the field layer
uniform float uWave;
uniform float uTurb;
uniform float uLoss;
uniform float uTime;
uniform float uDetail;
uniform float uSwirl;
uniform vec2 uLossRange;
uniform sampler2D uMapTurb;
uniform sampler2D uMapLoss;
uniform vec3 uCamPos;

varying vec2 vQ;
varying float vH;
varying vec3 vWorld;
varying vec3 vN;

${noise}
${lossGLSL}
${gridLine}
${flowGLSL}

vec3 cmap(sampler2D m, float s) {
  return texture2D(m, vec2(clamp(s, 0.002, 0.998), 0.5)).rgb;
}

void main() {
  float r = length(vQ) / 5.0;
  if (r > 1.0 || uFluid < 0.002) discard;

  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(-0.62, 0.62, 0.48));
  float diff = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(l + v)), 0.0, 1.0), 40.0);

  // advect this pixel through the flow map (per pixel, not per vertex); each
  // piece is skipped while its weight is zero
  float core = 0.0, vort = 0.0;
  vec2 vP = vQ;
  if (uSwirl > 0.0005) vP = flowMap(vQ, uTime, core, vort);
  float vL = 0.0;
  if (uLoss > 0.0005) vL = lossField(vP);
  float waveH = 0.16 * sin(0.8 * vQ.x + 0.5 * vQ.y - 1.1 * uTime)
              + 0.11 * sin(-0.4 * vQ.x + 0.9 * vQ.y - 0.8 * uTime + 1.3)
              + 0.07 * sin(1.3 * vQ.x - 0.2 * vQ.y - 1.5 * uTime + 2.0);

  // ── scalar fields, each normalised to [0, 1] ──
  // waves: height
  float sW = clamp(0.5 + 2.0 * waveH, 0.0, 1.0);
  // turbulence: vorticity + dye filaments, both read through the flow map
  float turbW = clamp(uTurb * 1.6, 0.0, 1.0);
  float sT = 0.5;
  if (turbW > 0.0005) {
    float dye = sin(2.6 * vP.y + 1.4 * sin(0.9 * vP.x) + 0.6 * snoise(vP * 0.7));
    sT = 0.5 + 0.5 * tanh(0.55 * vort + 0.5 * dye);
  }
  // landscape: loss value
  float sL = 0.0;
  if (uLoss > 0.0005) sL = clamp((vL - uLossRange.x) / (uLossRange.y - uLossRange.x), 0.0, 1.0);
  float s = mix(mix(sW, sT, turbW), sL, uLoss);
  vec3 col = mix(cmap(uMapTurb, s), cmap(uMapLoss, s), uLoss);

  // relief shading, kept soft so the colormap stays readable
  col *= mix(0.72, 1.06, smoothstep(0.1, 0.95, diff));
  col += 0.12 * spec;


  // the fluid is translucent over the plane (dye in water on graph paper)
  // and becomes an opaque surface as it turns into the landscape
  float alpha = mix(mix(0.62, 0.9, abs(s - 0.5) * 2.0), 1.0, uLoss);
  alpha *= uFluid * (1.0 - smoothstep(0.9, 0.995, r));

  float fog = smoothstep(1.0, 8.5, length(uCamPos - vWorld) - length(uCamPos));
  col = mix(col, vec3(1.0), fog);

  gl_FragColor = vec4(col, alpha);
}
`;
