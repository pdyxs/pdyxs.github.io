// GLSL for the charge layer. One full-screen triangle; every pixel sums the glows directly
// (the toy has tens of particles, so this beats Unity's quad-per-particle + render target).
import { CHARGE_DIVISOR, DUST_ON_PAPER, DUST_ALPHA, DUST_CELL, DUST_LIFE_SECONDS, DUST_MASK_RADIUS, DUST_SIZE, GLOW_RADIUS, MAX_GLOWS, SOFT_GAIN, SOFT_SIGMA } from './palette';

export type Mode = 'unity' | 'soft';

const f = (n: number) => n.toFixed(6);

export const VERTEX = `#version 300 es
void main() {
  // Full-screen triangle from gl_VertexID; no buffers needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function fragment(mode: Mode, dust: boolean): string {
  return `#version 300 es
precision highp float;
uniform vec4 u_glows[${MAX_GLOWS}];
uniform int u_count;
uniform vec4 u_proj;    // scale, offsetX, offsetY, canvas height (device px)
uniform vec2 u_viewXY;  // world coords of the viewBox's top-left
uniform float u_time;
uniform vec3 u_neutral;
uniform vec3 u_pos;
uniform vec3 u_neg;
uniform float u_dustFade;
out vec4 outColour;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

${mode === 'unity' ? UNITY_BODY : SOFT_BODY}

${dust ? DUST_FN : ''}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_proj.w - gl_FragCoord.y);
  vec2 world = (px - u_proj.yz) / u_proj.x + u_viewXY;
  vec3 colour = chargeColour(world, px);
  ${dust ? DUST_APPLY : ''}
  outColour = vec4(colour, 1.0);
}`;
}

// Faithful: positives add into one 8-bit channel, negatives into another, each clamped at 1;
// the post-process maps their difference through an unclamped lerp.
const UNITY_BODY = `
vec3 chargeColour(vec2 world, vec2 px) {
  float r = 0.0;
  float g = 0.0;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= u_count) break;
    vec4 gv = u_glows[i];
    float rad = ${f(GLOW_RADIUS)} * gv.z;
    float d = length(world - gv.xy) / rad;
    if (d >= 1.0) continue;
    // Default-Particle's alpha, fitted to the trailer's glow profile.
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    float q = gv.w / ${f(CHARGE_DIVISOR)} * a;
    if (q > 0.0) r += q; else g -= q;
  }
  // The 8-bit topology target: saturate, and quantise as the blend unit did.
  r = floor(min(r, 1.0) * 255.0 + 0.5) / 255.0;
  g = floor(min(g, 1.0) * 255.0 + 0.5) / 255.0;
  float charge = 0.5 + r - g;
  vec3 c;
  if (charge > 0.5) c = mix(u_neutral, u_pos, (charge - 0.5) * 2.0);
  else c = mix(u_neg, u_neutral, charge * 2.0);
  return clamp(c, 0.0, 1.0);
}`;

// Smoother: the signed charge field as one sum of Gaussians, squashed by tanh, mixed in
// linear light, and dithered so 8-bit output never bands.
const SOFT_BODY = `
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
vec3 chargeColour(vec2 world, vec2 px) {
  float field = 0.0;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= u_count) break;
    vec4 gv = u_glows[i];
    float s = ${f(SOFT_SIGMA)} * max(gv.z, 0.001);
    vec2 dv = world - gv.xy;
    field += gv.w / 3.0 * exp(-dot(dv, dv) / (s * s));
  }
  float t = tanh(field * ${f(SOFT_GAIN)});
  vec3 n = toLinear(u_neutral);
  vec3 c = t >= 0.0 ? mix(n, toLinear(u_pos), t) : mix(n, toLinear(u_neg), -t);
  c = toSrgb(c);
  c += (hash12(px) - 0.5) / 255.0;
  return clamp(c, 0.0, 1.0);
}`;

// Specks are white on the dark surface and graphite on the paper (judged from the neutral's
// luminance, so they follow the theme crossfade).
const DUST_APPLY = `
  float paper = smoothstep(0.3, 0.7, dot(u_neutral, vec3(0.2126, 0.7152, 0.0722)));
  colour = mix(colour, mix(vec3(1.0), vec3(${DUST_ON_PAPER.map(f).join(', ')}), paper), dust(world));`;

// Specks that live DUST_LIFE_SECONDS each, one per world cell, shown only near particles.
const DUST_FN = `
float dust(vec2 world) {
  float mask = 0.0;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= u_count) break;
    vec4 gv = u_glows[i];
    float d = length(world - gv.xy) / (${f(DUST_MASK_RADIUS)} * max(gv.z, 0.001));
    mask += 1.0 - smoothstep(0.4, 1.0, d);
  }
  mask = min(mask, 1.0) * u_dustFade;
  if (mask <= 0.0) return 0.0;
  vec2 cell = floor(world / ${f(DUST_CELL)});
  float seed = hash12(cell);
  float life = u_time / ${f(DUST_LIFE_SECONDS)} + seed;
  float gen = floor(life);
  float age = fract(life);
  vec2 jitter = vec2(hash12(cell + gen * 17.0), hash12(cell.yx + gen * 31.0 + 7.0));
  // A slow drift across the cell over its life.
  vec2 drift = (vec2(hash12(cell + 3.1), hash12(cell + 5.7)) - 0.5) * 0.6 * age;
  vec2 at = (cell + 0.15 + jitter * 0.7) * ${f(DUST_CELL)} + drift;
  float r = ${f(DUST_SIZE / 2)};
  float pxw = 1.0 / u_proj.x;
  float rr = max(r, pxw * 0.8);
  float dot1 = 1.0 - smoothstep(rr - pxw, rr + pxw, length(world - at));
  float fade = sin(age * 3.14159265);
  return dot1 * fade * mask * ${f(DUST_ALPHA)};
}`;
