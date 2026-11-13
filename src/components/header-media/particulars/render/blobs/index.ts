// Blob outlines: an extra outline round every particle that stretches toward
// what pulls on it and webs across to close neighbours — the rubber band
// between bound quarks. Ported from the Unity original's ParticleBlob.cs +
// RenderBlobs.cs (BlobBlur / BlobCutoff shaders). shape.ts decides the
// outlines; renderer.ts draws them.
import type { LayerDef, Layer, FrameInfo, Projection } from '../types';
import { BLOB_POINTS, BLUR_SIGMA, FIELD_ISO, FIELD_LINE_WIDTH, GOO_ISO, GOO_LINE_WIDTH, GOO_SIGMA, MAX_BODIES } from './constants';
import { BlobRenderer, type Pipeline } from './renderer';
import { blobPalette } from './palette';
import { blobBodies, blobOutlines, type BlobBody } from './shape';

const PIPELINES: Record<string, Pipeline> = {
  /** Faithful: offscreen blob discs, blurred, banded by BlobCutoff. */
  unity: { kind: 'unity', sigma: BLUR_SIGMA },
  /** The same look computed analytically: crisp and resolution independent. */
  field: { kind: 'field', sigma: BLUR_SIGMA, lineWidth: FIELD_LINE_WIDTH, iso: FIELD_ISO },
  /** A softer field: neighbours web together from further apart. */
  goo: { kind: 'field', sigma: GOO_SIGMA, lineWidth: GOO_LINE_WIDTH, iso: GOO_ISO },
};

function createBlobs(canvas: HTMLCanvasElement, variant: string): Layer {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return { frame() {}, destroy() {} };
  const renderer = new BlobRenderer(gl, PIPELINES[variant] ?? PIPELINES.field);

  const bodies: BlobBody[] = [];
  const ring = new Float32Array(MAX_BODIES * BLOB_POINTS);
  const radii = new Float32Array(MAX_BODIES * BLOB_POINTS);
  // When each blob first appeared (seconds of layer time), so it can grow in; pruned as bodies go.
  const born = new Map<number, number>();
  const seen = new Map<number, number>();
  let frameNo = 0;
  let now = 0;
  const bornAt = (id: number) => {
    seen.set(id, frameNo);
    let t = born.get(id);
    if (t === undefined) born.set(id, (t = now));
    return t;
  };

  return {
    frame(f: FrameInfo) {
      frameNo++;
      now = f.time;
      const count = Math.min(blobBodies(f.snapshot, f.time, bornAt, bodies), MAX_BODIES);
      if (frameNo % 120 === 0) {
        for (const [id, last] of seen) if (last !== frameNo) { seen.delete(id); born.delete(id); }
      }
      blobOutlines(bodies, count, f.snapshot.blackHoles, f.snapshot.forces, ring, radii);
      renderer.draw(bodies, count, radii, f.view, f.projection, blobPalette(f.theme));
    },
    resize(p: Projection) {
      renderer.resize(p);
    },
    destroy() {
      renderer.destroy();
    },
  };
}

export const blobsLayer: LayerDef = {
  id: 'blobs',
  z: -20,
  variants: ['unity', 'field', 'goo'],
  defaultVariant: 'field',
  create: createBlobs,
};
