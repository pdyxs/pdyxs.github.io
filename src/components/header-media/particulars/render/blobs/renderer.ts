// The thin effect: WebGL2 drawing of blob outlines from bodies + radii that
// shape.ts decided. Two pipelines:
//  - 'unity': RenderBlobs.cs as it was — blob discs into a quarter-size
//    offscreen target (BlobA green / BlobB red by parity), blurred, then
//    BlobCutoff.shader keeps a band of the blurred alpha and tints it.
//  - 'field': the same picture computed analytically per pixel — each blob's
//    blurred edge is a logistic falloff across its (force-deformed) outline,
//    the falloffs are summed and the iso-line drawn at a fixed world width.
//    Crisp at any resolution, no offscreen targets.
import type { Projection, ViewBox } from '../types';
import {
  AA_WIDTH,
  BLOB_POINTS,
  CUTOFF_RADIUS,
  CUTOFF_WIDTH,
  MAX_BODIES,
  MIN_LINE_CSS_PX,
  UNITY_DOWNSAMPLE,
} from './constants';
import type { BlobBody } from './shape';
import { EDGE_ALPHA_WIDTH, EDGE_CSS_PX, type BlobPalette } from './palette';

export interface FieldStyle {
  sigma: number;
  lineWidth: number;
  iso: number;
}

export type Pipeline = { kind: 'unity'; sigma: number } | ({ kind: 'field' } & FieldStyle);

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Shared body lookup: u_bodies is MAX_BODIES x 1 RGBA32F (x, y, zero, parity);
// u_radii is BLOB_POINTS x MAX_BODIES R16F, linear-filtered and repeating in s.
const BODY_GLSL = `
uniform highp sampler2D u_bodies;
uniform highp sampler2D u_radii;
uniform int u_count;
uniform vec4 u_proj;   // scale, offsetX, offsetY, canvas height (device px)
uniform vec2 u_view;   // view.x, view.y
uniform float u_pixelScale; // fragment px -> canvas px
const float TAU = 6.28318530718;
vec2 worldAt(vec2 frag) {
  vec2 px = vec2(frag.x, u_proj.w / u_pixelScale - frag.y) * u_pixelScale;
  return (px - u_proj.yz) / u_proj.x + u_view;
}
float radiusAt(int i, vec2 delta) {
  float u = atan(delta.y, delta.x) / TAU + ${(0.5 / BLOB_POINTS).toFixed(6)};
  float v = (float(i) + 0.5) / ${MAX_BODIES}.0;
  return texture(u_radii, vec2(u, v)).r;
}`;

const MASK_FRAG = `#version 300 es
precision highp float;
${BODY_GLSL}
out vec4 o;
void main() {
  vec2 w = worldAt(gl_FragCoord.xy);
  vec4 c = vec4(0.0);
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= u_count) break;
    vec4 b = texelFetch(u_bodies, ivec2(i, 0), 0);
    vec2 d = w - b.xy;
    float dist = length(d);
    if (dist > 2.0 * b.z) continue;
    if (dist < radiusAt(i, d)) c = b.w > 0.0 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0);
  }
  o = c;
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_dir;    // one texel along the blur axis, in uv
uniform float u_sigma; // texels
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_src, 0));
  float s = max(u_sigma, 0.5);
  int r = int(ceil(3.0 * s));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int k = -48; k <= 48; k++) {
    if (k < -r || k > r) continue;
    float w = exp(-0.5 * float(k * k) / (s * s));
    acc += w * texture(u_src, uv + u_dir * float(k));
    wsum += w;
  }
  o = acc / wsum;
}`;

// BlobCutoff.shader, line for line (clip, normalise, band, lerp A→B on red).
const CUTOFF_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_size;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform float u_cutRadius;
uniform float u_cutWidth;
uniform float u_aa;
uniform vec4 u_edge;      // rgb, alpha: an edge either side of the antimatter line (theme)
uniform float u_edgeWidth; // alpha units
out vec4 o;
float band(float v, float outer, float inner) {
  if (v < outer) return smoothstep(outer - u_aa, outer, v);
  if (v > inner) return smoothstep(inner + u_aa, inner, v);
  return 1.0;
}
void main() {
  vec4 color = texture(u_src, gl_FragCoord.xy / u_size);
  if (color.a <= 0.0) discard;
  float sum = color.r + color.g + color.b;
  vec3 rgb = color.rgb / max(sum, 1e-5);
  float outer = u_cutRadius - u_cutWidth * 0.5;
  float inner = u_cutRadius + u_cutWidth * 0.5;
  float a = band(color.a, outer, inner);
  float e = band(color.a, outer - u_edgeWidth, inner + u_edgeWidth) * u_edge.a * rgb.r * (1.0 - a);
  vec3 col = mix(u_colA, u_colB, rgb.r);
  o = vec4(col * a + u_edge.rgb * e, a + e);
}`;

const FIELD_FRAG = `#version 300 es
precision highp float;
${BODY_GLSL}
uniform float u_sigma;
uniform float u_iso;
uniform float u_halfLinePx;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform vec4 u_edge;     // rgb, alpha: an edge either side of the antimatter line (theme)
uniform float u_edgePx;
out vec4 o;
void main() {
  vec2 w = worldAt(gl_FragCoord.xy);
  float A = 0.0;
  float neg = 0.0;
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= u_count) break;
    vec4 b = texelFetch(u_bodies, ivec2(i, 0), 0);
    vec2 d = w - b.xy;
    float dist = length(d);
    if (dist > 2.0 * b.z + 5.0 * u_sigma || b.z <= 0.0) continue;
    // a gaussian-blurred edge, as the logistic fit to the normal CDF
    float x = (dist - radiusAt(i, d)) / u_sigma;
    float a = 1.0 / (1.0 + exp(1.702 * x));
    A += a;
    if (b.w < 0.0) neg += a;
  }
  float g = max(fwidth(A), 1e-6);
  float s = (A - u_iso) / g;           // ~signed distance to the iso-line, px
  float negFrac = neg / max(A, 1e-6);
  float alpha = clamp(u_halfLinePx + 0.5 - abs(s), 0.0, 1.0);
  float e = clamp(u_halfLinePx + u_edgePx + 0.5 - abs(s), 0.0, 1.0) * u_edge.a * negFrac * (1.0 - alpha);
  if (alpha + e <= 0.0) discard;
  vec3 col = mix(u_colA, u_colB, negFrac);
  o = vec4(col * alpha + u_edge.rgb * e, alpha + e);
}`;

function compile(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`blobs shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`blobs link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export class BlobRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly pipeline: Pipeline;
  private readonly bodyData = new Float32Array(MAX_BODIES * 4);
  private readonly bodyTex: WebGLTexture;
  private readonly radiiTex: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly progs: Record<string, WebGLProgram> = {};
  private readonly locs = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private targets: Target[] = [];

  constructor(gl: WebGL2RenderingContext, pipeline: Pipeline) {
    this.gl = gl;
    this.pipeline = pipeline;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.bodyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.bodyTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, MAX_BODIES, 1);
    this.texParams(gl.NEAREST, gl.CLAMP_TO_EDGE);

    this.radiiTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.radiiTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, BLOB_POINTS, MAX_BODIES);
    this.texParams(gl.LINEAR, gl.REPEAT);

    if (pipeline.kind === 'unity') {
      this.progs.mask = compile(gl, MASK_FRAG);
      this.progs.blur = compile(gl, BLUR_FRAG);
      this.progs.cutoff = compile(gl, CUTOFF_FRAG);
    } else {
      this.progs.field = compile(gl, FIELD_FRAG);
    }
  }

  private texParams(filter: number, wrapS: number) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.locs.get(p);
    if (!m) this.locs.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name)!;
  }

  /** The canvas changed size: rebuild the offscreen targets for the 'unity' pipeline. */
  resize(p: Projection): void {
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets = [];
    if (this.pipeline.kind !== 'unity') return;
    const w = Math.max(1, Math.ceil(p.width / UNITY_DOWNSAMPLE));
    const h = Math.max(1, Math.ceil(p.height / UNITY_DOWNSAMPLE));
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      this.texParams(gl.LINEAR, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.targets.push({ tex, fbo, w, h });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  draw(bodies: readonly BlobBody[], count: number, radii: Float32Array, view: ViewBox, p: Projection, palette: BlobPalette): void {
    const gl = this.gl;
    const n = Math.min(count, MAX_BODIES);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, p.width, p.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (n === 0) return;

    const bd = this.bodyData;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      bd[i * 4] = b.x; bd[i * 4 + 1] = b.y; bd[i * 4 + 2] = b.zero; bd[i * 4 + 3] = b.parity;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bodyTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 1, gl.RGBA, gl.FLOAT, bd, 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.radiiTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BLOB_POINTS, n, gl.RED, gl.FLOAT, radii, 0);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    if (this.pipeline.kind === 'unity') this.drawUnity(n, view, p, this.pipeline.sigma, palette);
    else this.drawField(n, view, p, this.pipeline, palette);
  }

  private bindBodies(prog: WebGLProgram, n: number, view: ViewBox, p: Projection, pixelScale: number) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.uniform1i(this.loc(prog, 'u_bodies'), 1);
    gl.uniform1i(this.loc(prog, 'u_radii'), 2);
    gl.uniform1i(this.loc(prog, 'u_count'), n);
    gl.uniform4f(this.loc(prog, 'u_proj'), p.scale, p.offsetX, p.offsetY, p.height);
    gl.uniform2f(this.loc(prog, 'u_view'), view.x, view.y);
    gl.uniform1f(this.loc(prog, 'u_pixelScale'), pixelScale);
  }

  private drawUnity(n: number, view: ViewBox, p: Projection, sigmaWorld: number, pal: BlobPalette) {
    const gl = this.gl;
    if (this.targets.length < 2) this.resize(p);
    const [a, b] = this.targets;
    // 1. blob discs → a (RenderBlobs' post-process camera on the Blob layer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, a.w, a.h);
    this.bindBodies(this.progs.mask, n, view, p, UNITY_DOWNSAMPLE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. blur a → b → a (BlobBlur iterations, as one separable gaussian)
    const blur = this.progs.blur;
    gl.useProgram(blur);
    gl.uniform1i(this.loc(blur, 'u_src'), 0);
    gl.uniform1f(this.loc(blur, 'u_sigma'), (sigmaWorld * p.scale) / UNITY_DOWNSAMPLE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform2f(this.loc(blur, 'u_dir'), 1 / a.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform2f(this.loc(blur, 'u_dir'), 0, 1 / a.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. cutoff a → canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, p.width, p.height);
    const cut = this.progs.cutoff;
    gl.useProgram(cut);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(this.loc(cut, 'u_src'), 0);
    gl.uniform2f(this.loc(cut, 'u_size'), a.w * UNITY_DOWNSAMPLE, a.h * UNITY_DOWNSAMPLE);
    gl.uniform3fv(this.loc(cut, 'u_colA'), pal.pos);
    gl.uniform3fv(this.loc(cut, 'u_colB'), pal.neg);
    gl.uniform4f(this.loc(cut, 'u_edge'), pal.edge[0], pal.edge[1], pal.edge[2], pal.edgeAlpha);
    gl.uniform1f(this.loc(cut, 'u_edgeWidth'), EDGE_ALPHA_WIDTH);
    gl.uniform1f(this.loc(cut, 'u_cutRadius'), CUTOFF_RADIUS);
    gl.uniform1f(this.loc(cut, 'u_cutWidth'), CUTOFF_WIDTH);
    gl.uniform1f(this.loc(cut, 'u_aa'), AA_WIDTH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawField(n: number, view: ViewBox, p: Projection, style: FieldStyle, pal: BlobPalette) {
    const gl = this.gl;
    const prog = this.progs.field;
    this.bindBodies(prog, n, view, p, 1);
    gl.uniform1f(this.loc(prog, 'u_sigma'), style.sigma);
    gl.uniform1f(this.loc(prog, 'u_iso'), style.iso);
    gl.uniform1f(this.loc(prog, 'u_halfLinePx'), Math.max(style.lineWidth * p.scale, MIN_LINE_CSS_PX * p.dpr) / 2);
    // Only shade the box the blobs can reach: the per-pixel loop is the cost.
    const bd = this.bodyData;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const reach = 2 * bd[i * 4 + 2] + 5 * style.sigma;
      x0 = Math.min(x0, bd[i * 4] - reach); x1 = Math.max(x1, bd[i * 4] + reach);
      y0 = Math.min(y0, bd[i * 4 + 1] - reach); y1 = Math.max(y1, bd[i * 4 + 1] + reach);
    }
    const left = Math.floor((x0 - view.x) * p.scale + p.offsetX) - 2;
    const right = Math.ceil((x1 - view.x) * p.scale + p.offsetX) + 2;
    const top = Math.floor((y0 - view.y) * p.scale + p.offsetY) - 2;
    const bottom = Math.ceil((y1 - view.y) * p.scale + p.offsetY) + 2;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, p.height - bottom, Math.max(0, right - left), Math.max(0, bottom - top));
    gl.uniform3fv(this.loc(prog, 'u_colA'), pal.pos);
    gl.uniform3fv(this.loc(prog, 'u_colB'), pal.neg);
    gl.uniform4f(this.loc(prog, 'u_edge'), pal.edge[0], pal.edge[1], pal.edge[2], pal.edgeAlpha);
    gl.uniform1f(this.loc(prog, 'u_edgePx'), EDGE_CSS_PX * p.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  destroy(): void {
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    gl.deleteTexture(this.bodyTex);
    gl.deleteTexture(this.radiiTex);
    for (const prog of Object.values(this.progs)) gl.deleteProgram(prog);
  }
}
