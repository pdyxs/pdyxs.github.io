// The charge distribution lighting the background: a port of the original's Topology effect.
// Also paints the level's background colour, since the original cleared to it.
//
// Variants:
//   unity    — faithful Topology pipeline, graphite palette (the trailer's opening levels). Default.
//   slate    — same pipeline, the trailer's slate-purple chapter.
//   lavender — same pipeline, the trailer's lavender chapter.
//   soft     — a smooth signed field (Gaussians + tanh, linear-light mix, dithered), graphite.
//   dust     — unity + the RenderDust specks drifting near charged particles.
// Every variant has a light (paper) and dark palette; FrameInfo.theme picks one each frame,
// crossfading when the site's theme flips.
import type { FrameInfo, LayerDef, Projection } from '../types';
import { packGlows, stepEmFade, stepGlows, type Glow } from './glows';
import { MAX_GLOWS, THEME_FADE_SECONDS, THEMED, type ChargePalette, type ThemedPalette } from './palette';
import { paletteFor, shownPalette, stepPaletteFade, type PaletteFade } from './theme';
import { fragment, VERTEX, type Mode } from './shaders';

interface VariantSpec {
  mode: Mode;
  palette: ThemedPalette;
  dust: boolean;
}

const VARIANTS: Record<string, VariantSpec> = {
  unity: { mode: 'unity', palette: THEMED.graphite, dust: false },
  slate: { mode: 'unity', palette: THEMED.slate, dust: false },
  lavender: { mode: 'unity', palette: THEMED.lavender, dust: false },
  soft: { mode: 'soft', palette: THEMED.graphite, dust: false },
  dust: { mode: 'unity', palette: THEMED.graphite, dust: true },
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`charge layer shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function program(gl: WebGL2RenderingContext, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`charge layer link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Without WebGL2 the layer still owns the background: a flat 2D fill of the neutral colour. */
function flatFallback(canvas: HTMLCanvasElement, themed: ThemedPalette) {
  const ctx = canvas.getContext('2d');
  return {
    frame(f: FrameInfo) {
      if (!ctx) return;
      const [r, g, b] = paletteFor(themed, f.theme).neutral.map((v) => Math.round(v * 255));
      ctx.fillStyle = `rgb(${r} ${g} ${b})`;
      ctx.fillRect(0, 0, f.projection.width, f.projection.height);
    },
    destroy() {},
  };
}

export const chargeLayer: LayerDef = {
  id: 'charge',
  z: -40,
  paintsBackground: true,
  variants: Object.keys(VARIANTS),
  defaultVariant: 'unity',
  create(canvas, variant) {
    const spec = VARIANTS[variant] ?? VARIANTS.unity;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return flatFallback(canvas, spec.palette);

    const prog = program(gl, fragment(spec.mode, spec.dust));
    const vao = gl.createVertexArray();
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const loc = {
      glows: u('u_glows'),
      count: u('u_count'),
      proj: u('u_proj'),
      viewXY: u('u_viewXY'),
      time: u('u_time'),
      neutral: u('u_neutral'),
      pos: u('u_pos'),
      neg: u('u_neg'),
      dustFade: u('u_dustFade'),
    };
    const setPalette = (c: ChargePalette) => {
      gl.uniform3f(loc.neutral, ...c.neutral);
      gl.uniform3f(loc.pos, ...c.pos);
      gl.uniform3f(loc.neg, ...c.neg);
    };
    let fade: PaletteFade | null = null;

    const packed = new Float32Array(MAX_GLOWS * 4);
    let glows: Glow[] = [];
    let emFade = -1;

    const viewport = (p: Projection) => gl.viewport(0, 0, p.width, p.height);

    return {
      frame(f: FrameInfo) {
        const em = f.snapshot.forces.em ?? false;
        // First frame: start at the switch's state rather than fading in from nothing.
        emFade = emFade < 0 ? (em ? 1 : 0) : stepEmFade(emFade, em, f.dt);
        glows = stepGlows(glows, f.snapshot, f.dt);
        const target = paletteFor(spec.palette, f.theme);
        // First frame: show the current theme at once; later flips crossfade.
        fade = fade ? stepPaletteFade(fade, target, f.dt, THEME_FADE_SECONDS) : { from: target, to: target, t: 1 };
        const n = packGlows(glows, emFade, packed);

        const p = f.projection;
        viewport(p);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform4fv(loc.glows, packed);
        gl.uniform1i(loc.count, n);
        gl.uniform4f(loc.proj, p.scale, p.offsetX, p.offsetY, p.height);
        gl.uniform2f(loc.viewXY, f.view.x, f.view.y);
        gl.uniform1f(loc.time, f.time);
        gl.uniform1f(loc.dustFade, emFade);
        setPalette(shownPalette(fade));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      resize(p) {
        viewport(p);
      },
      destroy() {
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
      },
    };
  },
};
