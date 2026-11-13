// The thin effect: draws a Draw list with WebGL2 — textured quads from the atlas, multiplied by a
// tint (the original's echoLogin simplecolour shader: tex × colour, alpha blended), and
// antialiased rings (MeshArc).
import type { Projection, ViewBox } from '../types';
import { ATLAS, ATLAS_SIZE } from './atlas/atlas-map';
import type { Draw } from './scene';

const VERTEX = `#version 300 es
in vec2 a_corner;
uniform vec2 u_canvas;
uniform vec2 u_center;
uniform float u_half;
uniform vec2 u_rot;
uniform vec4 u_uv;
out vec2 v_uv;
out vec2 v_local;
void main() {
  vec2 c = vec2(a_corner.x * u_rot.x - a_corner.y * u_rot.y, a_corner.x * u_rot.y + a_corner.y * u_rot.x);
  vec2 px = u_center + c * u_half;
  v_uv = u_uv.xy + (a_corner * 0.5 + 0.5) * u_uv.zw;
  v_local = a_corner;
  gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec4 u_tint;      // premultiplied
uniform int u_mode;       // 0 sprite, 1 ring
uniform vec3 u_ring;      // inner, outer (fractions of the half size), antialias width
in vec2 v_uv;
in vec2 v_local;
out vec4 o;
void main() {
  if (u_mode == 0) {
    o = texture(u_tex, v_uv) * u_tint;
  } else {
    float r = length(v_local);
    float a = smoothstep(u_ring.x - u_ring.z, u_ring.x + u_ring.z, r) * (1.0 - smoothstep(u_ring.y - u_ring.z, u_ring.y + u_ring.z, r));
    o = u_tint * a;
  }
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`bodies shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}

export class BodiesRenderer {
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  private ready = false;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private gl: WebGL2RenderingContext, atlasUrl: string) {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`bodies link: ${gl.getProgramInfoLog(p)}`);
    this.prog = p;
    for (const n of ['u_canvas', 'u_center', 'u_half', 'u_rot', 'u_uv', 'u_tex', 'u_tint', 'u_mode', 'u_ring']) this.u[n] = gl.getUniformLocation(p, n);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'a_corner');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture()!;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.ready = true;
    };
    img.src = atlasUrl;
  }

  /** Whether the atlas has arrived (until then sprites are skipped; rings still draw). */
  get loaded(): boolean {
    return this.ready;
  }

  draw(draws: readonly Draw[], proj: Projection, view: ViewBox): void {
    const gl = this.gl;
    gl.viewport(0, 0, proj.width, proj.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const u = this.u;
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_canvas, proj.width, proj.height);
    const W = ATLAS_SIZE.width;
    const H = ATLAS_SIZE.height;
    let mode = -1;
    for (const d of draws) {
      const cx = (d.x - view.x) * proj.scale + proj.offsetX;
      const cy = (d.y - view.y) * proj.scale + proj.offsetY;
      const t = d.tint;
      gl.uniform4f(u.u_tint, t[0] * t[3], t[1] * t[3], t[2] * t[3], t[3]);
      gl.uniform2f(u.u_center, cx, cy);
      if (d.kind === 'sprite') {
        const r = ATLAS[d.sprite];
        if (!r || !this.ready) continue;
        if (mode !== 0) gl.uniform1i(u.u_mode, (mode = 0));
        gl.uniform1f(u.u_half, (d.diameter / 2) * proj.scale);
        gl.uniform2f(u.u_rot, Math.cos(d.angle), Math.sin(d.angle));
        gl.uniform4f(u.u_uv, r[0] / W, r[1] / H, r[2] / W, r[3] / H);
      } else {
        if (mode !== 1) gl.uniform1i(u.u_mode, (mode = 1));
        const half = d.outer * proj.scale + 2;
        const aa = 0.75 / half;
        gl.uniform1f(u.u_half, half);
        gl.uniform2f(u.u_rot, 1, 0);
        gl.uniform3f(u.u_ring, (d.inner * proj.scale) / half, (d.outer * proj.scale) / half, aa);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.tex);
  }
}
