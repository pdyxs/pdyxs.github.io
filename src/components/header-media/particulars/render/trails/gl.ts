// The thin WebGL2 effect: upload this frame's geometry and draw it. No decisions here.
import type { Projection, ViewBox } from '../types';
import { FLOATS_PER_VERTEX } from './strip';
import { MARK_FLOATS } from './perma';
import { PERMA_EXPLOSION_RIM_ALPHA } from './constants';

const STRIP_VS = `#version 300 es
in vec2 a_pos;
in vec4 a_col;
uniform vec4 u_xf; // world -> clip: clip = a_pos * u_xf.xy + u_xf.zw
out vec4 v_col;
void main() {
  gl_Position = vec4(a_pos * u_xf.xy + u_xf.zw, 0.0, 1.0);
  v_col = a_col;
}`;
const STRIP_FS = `#version 300 es
precision mediump float;
in vec4 v_col;
out vec4 o;
void main() { o = vec4(v_col.rgb * v_col.a, v_col.a); }`;

// Marks: permaTrail-trail.shader. Colour is irrelevant (Blend DstColor Zero on a black buffer).
const MARK_VS = `#version 300 es
in vec2 a_pos;
in float a_alpha;
in float a_depth;
uniform vec4 u_xf;
out float v_a;
void main() {
  gl_Position = vec4(a_pos * u_xf.xy + u_xf.zw, a_depth * 2.0 - 1.0, 1.0);
  v_a = a_alpha;
}`;
const MARK_FS = `#version 300 es
precision mediump float;
in float v_a;
out vec4 o;
void main() { o = vec4(0.0, 0.0, 0.0, v_a); }`;

// Explosion: permaTrail-explosion.shader on a sphere seen face-on. Writes, not blends.
const DISC_VS = `#version 300 es
in vec2 a_corner; // 0..1
uniform vec4 u_xf;
uniform vec3 u_disc; // left, top, diameter (world)
out vec2 v_p;
void main() {
  v_p = a_corner * 2.0 - 1.0;
  vec2 w = u_disc.xy + a_corner * u_disc.z;
  gl_Position = vec4(w * u_xf.xy + u_xf.zw, 1.0, 1.0);
}`;
const DISC_FS = `#version 300 es
precision mediump float;
in vec2 v_p;
out vec4 o;
void main() {
  float r = length(v_p);
  if (r >= 1.0) discard;
  float d = sqrt(1.0 - r * r);
  float d2 = 1.0 - smoothstep(0.1, 0.15, d) - (1.0 - smoothstep(0.0, 0.1, d));
  o = vec4(0.0, 0.0, 0.0, d2 * ${PERMA_EXPLOSION_RIM_ALPHA.toFixed(4)});
}`;

// Showing the marks: PermaTrailMaterial (white × black texture, alpha × 0.1176).
const SHOW_VS = `#version 300 es
in vec2 a_corner; // 0..1 over the view box
uniform vec4 u_xf;
uniform vec4 u_view; // x, y, w, h
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  vec2 w = u_view.xy + a_corner * u_view.zw;
  gl_Position = vec4(w * u_xf.xy + u_xf.zw, 0.0, 1.0);
}`;
const SHOW_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
uniform vec3 u_rgb;
out vec4 o;
void main() {
  float a = clamp(texture(u_tex, v_uv).a * u_alpha, 0.0, 1.0);
  o = vec4(u_rgb * a, a);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`trails shader: ${gl.getShaderInfoLog(s)}`);
    gl.attachShader(p, s);
  }
  // The quad programs share one VAO: pin their corner attribute to location 0.
  gl.bindAttribLocation(p, 0, 'a_corner');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`trails link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** world → clip for the canvas: matches the SVG's projection. */
function canvasXf(p: Projection, v: ViewBox): [number, number, number, number] {
  const sx = (2 * p.scale) / p.width;
  const sy = (-2 * p.scale) / p.height;
  return [sx, sy, ((p.offsetX - v.x * p.scale) * 2) / p.width - 1, 1 - ((p.offsetY - v.y * p.scale) * 2) / p.height];
}

/** world → clip for the mark buffer, which covers exactly the view box (row 0 at view.y). */
function bufferXf(v: ViewBox): [number, number, number, number] {
  return [2 / v.width, 2 / v.height, (-2 * v.x) / v.width - 1, (-2 * v.y) / v.height - 1];
}

export interface MarkBufferSize {
  width: number;
  height: number;
}

export class TrailsGL {
  private strip: WebGLProgram;
  private mark: WebGLProgram;
  private disc: WebGLProgram;
  private show: WebGLProgram;
  private stripVao: WebGLVertexArrayObject;
  private markVao: WebGLVertexArrayObject;
  private quadVao: WebGLVertexArrayObject;
  private stripBuf: WebGLBuffer;
  private markBuf: WebGLBuffer;
  private quadBuf: WebGLBuffer;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private fb: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private size: MarkBufferSize = { width: 0, height: 0 };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.strip = compile(gl, STRIP_VS, STRIP_FS);
    this.mark = compile(gl, MARK_VS, MARK_FS);
    this.disc = compile(gl, DISC_VS, DISC_FS);
    this.show = compile(gl, SHOW_VS, SHOW_FS);
    for (const [name, prog] of [['strip', this.strip], ['mark', this.mark], ['disc', this.disc], ['show', this.show]] as const) {
      this.u[`${name}.xf`] = gl.getUniformLocation(prog, 'u_xf');
    }
    this.u['disc.disc'] = gl.getUniformLocation(this.disc, 'u_disc');
    this.u['show.view'] = gl.getUniformLocation(this.show, 'u_view');
    this.u['show.tex'] = gl.getUniformLocation(this.show, 'u_tex');
    this.u['show.alpha'] = gl.getUniformLocation(this.show, 'u_alpha');
    this.u['show.rgb'] = gl.getUniformLocation(this.show, 'u_rgb');

    this.stripBuf = gl.createBuffer()!;
    this.stripVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.stripVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stripBuf);
    const sStride = FLOATS_PER_VERTEX * 4;
    const sPos = gl.getAttribLocation(this.strip, 'a_pos');
    const sCol = gl.getAttribLocation(this.strip, 'a_col');
    gl.enableVertexAttribArray(sPos);
    gl.vertexAttribPointer(sPos, 2, gl.FLOAT, false, sStride, 0);
    gl.enableVertexAttribArray(sCol);
    gl.vertexAttribPointer(sCol, 4, gl.FLOAT, false, sStride, 8);

    this.markBuf = gl.createBuffer()!;
    this.markVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.markVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markBuf);
    const mStride = MARK_FLOATS * 4;
    const mPos = gl.getAttribLocation(this.mark, 'a_pos');
    const mA = gl.getAttribLocation(this.mark, 'a_alpha');
    const mD = gl.getAttribLocation(this.mark, 'a_depth');
    gl.enableVertexAttribArray(mPos);
    gl.vertexAttribPointer(mPos, 2, gl.FLOAT, false, mStride, 0);
    gl.enableVertexAttribArray(mA);
    gl.vertexAttribPointer(mA, 1, gl.FLOAT, false, mStride, 8);
    gl.enableVertexAttribArray(mD);
    gl.vertexAttribPointer(mD, 1, gl.FLOAT, false, mStride, 12);

    // One unit quad (0..1) shared by the disc and the show pass.
    this.quadBuf = gl.createBuffer()!;
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** (Re)allocate the mark buffer. Its contents start clear: colour 0, depth 1. */
  ensureMarkBuffer(size: MarkBufferSize): void {
    if (size.width === this.size.width && size.height === this.size.height && this.fb) return;
    const gl = this.gl;
    if (this.fb) gl.deleteFramebuffer(this.fb);
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.depth) gl.deleteRenderbuffer(this.depth);
    this.size = { ...size };
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size.width, size.height);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.viewport(0, 0, size.width, size.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Stamp explosion discs, then segments, into the mark buffer. */
  stampMarks(view: ViewBox, discs: readonly { x: number; y: number; r: number }[], marks: Float32Array, markCount: number): void {
    const gl = this.gl;
    if (!this.fb || (discs.length === 0 && markCount === 0)) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.size.width, this.size.height);
    const xf = bufferXf(view);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    if (discs.length > 0) {
      // ZWrite On, ZTest Off, Blend One Zero: overwrite colour and reset depth so anyone may mark again.
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.ALWAYS);
      gl.useProgram(this.disc);
      gl.uniform4fv(this.u['disc.xf'], xf);
      gl.bindVertexArray(this.quadVao);
      for (const d of discs) {
        // The quad is 0..1; the shader wants -1..1, so centre at x - r with diameter 2r.
        gl.uniform3f(this.u['disc.disc'], d.x - d.r, d.y - d.r, d.r * 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (markCount > 0) {
      // ZWrite On, ZTest NotEqual, Blend DstColor Zero, One One.
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ONE, gl.ONE);
      gl.depthFunc(gl.NOTEQUAL);
      gl.useProgram(this.mark);
      gl.uniform4fv(this.u['mark.xf'], xf);
      gl.bindVertexArray(this.markVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.markBuf);
      gl.bufferData(gl.ARRAY_BUFFER, marks.subarray(0, markCount * MARK_FLOATS), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, markCount);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Clear the canvas, show the marks, draw the strips on top. */
  drawFrame(p: Projection, view: ViewBox, markAlpha: number, markRgb: readonly number[], strips: Float32Array, stripCount: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, p.width, p.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const xf = canvasXf(p, view);
    if (this.tex && markAlpha > 0) {
      gl.useProgram(this.show);
      gl.uniform4fv(this.u['show.xf'], xf);
      gl.uniform4f(this.u['show.view'], view.x, view.y, view.width, view.height);
      gl.uniform1f(this.u['show.alpha'], markAlpha);
      gl.uniform3f(this.u['show.rgb'], markRgb[0], markRgb[1], markRgb[2]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.u['show.tex'], 0);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (stripCount > 0) {
      gl.useProgram(this.strip);
      gl.uniform4fv(this.u['strip.xf'], xf);
      gl.bindVertexArray(this.stripVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stripBuf);
      gl.bufferData(gl.ARRAY_BUFFER, strips.subarray(0, stripCount * FLOATS_PER_VERTEX), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, stripCount);
    }
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    for (const p of [this.strip, this.mark, this.disc, this.show]) gl.deleteProgram(p);
    for (const b of [this.stripBuf, this.markBuf, this.quadBuf]) gl.deleteBuffer(b);
    for (const v of [this.stripVao, this.markVao, this.quadVao]) gl.deleteVertexArray(v);
    if (this.fb) gl.deleteFramebuffer(this.fb);
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.depth) gl.deleteRenderbuffer(this.depth);
  }
}
