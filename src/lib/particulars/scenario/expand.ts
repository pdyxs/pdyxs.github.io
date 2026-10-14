import type { Formation, ParticleDef, ParticleSpec, Ref, SpawnSpec, VelocityDef, WaveEntry } from './types';

type Vec = { x: number; y: number };
type Library = Record<string, Formation>;
interface Frame {
  x: number;
  y: number;
  /** Degrees; the sum of every enclosing formation's angle. */
  angle: number;
}
type Placed = { particle: ParticleSpec; x: number; y: number };

/** Pure: an authored particle with colour and parity defaulted. */
export function resolveParticle(ref: Ref): ParticleSpec {
  // A string reaching here is a built-in type name; validate() has vouched for it.
  const def = (typeof ref === 'string' ? { type: ref } : ref) as ParticleDef;
  return { type: def.type, colour: def.colour ?? 'white', parity: def.parity ?? 1 };
}

function place(ref: Ref, frame: Frame, library: Library): Placed[] {
  if (typeof ref === 'string' && ref in library) return placeFormation(library[ref], frame, library);
  return [{ particle: resolveParticle(ref), x: frame.x, y: frame.y }];
}

const rotate = (v: Vec, degrees: number): Vec => {
  const a = (degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
};

/** Where slot i sits relative to the formation's centre, before rotation. */
function slotOffset(f: Formation, i: number): Vec {
  const count = f.count ?? 1;
  if (f.kind === 'line') return { x: (i - (count - 1) / 2) * f.distance, y: 0 };
  if (f.kind === 'circle') {
    const arc = f.arc ?? 1;
    const gaps = arc === 1 ? count : count - 1;
    const a = (2 * Math.PI * arc * (gaps > 0 ? i / gaps : 0));
    return { x: f.radius * Math.cos(a), y: f.radius * Math.sin(a) };
  }
  return { x: 0, y: 0 };
}

function placeFormation(f: Formation, frame: Frame, library: Library): Placed[] {
  const count = f.count ?? 1;
  const angle = frame.angle + (f.angle ?? 0);
  const out: Placed[] = [];
  for (let i = 0; i < count; i++) {
    const o = rotate(slotOffset(f, i), angle);
    const slot = { x: frame.x + o.x, y: frame.y + o.y, angle };
    out.push(...place(f.contents[i % f.contents.length], slot, library));
  }
  return out;
}

function velocityOf(v: VelocityDef | undefined): Vec {
  if (!v) return { x: 0, y: 0 };
  if ('magnitude' in v) return rotate({ x: v.magnitude, y: 0 }, v.angle ?? 0);
  return { x: v.x, y: v.y };
}

/** Pure: a wave entry and the formation library become the particles to spawn. */
export function expand(entry: WaveEntry, library: Library): SpawnSpec[] {
  const p = entry.position ?? { x: 0, y: 0 };
  const frame = { x: p.x, y: p.y, angle: entry.angle ?? 0 };
  const v = velocityOf(entry.velocity);
  const telegraph = entry.telegraph ?? 0;
  return place(entry.spawn, frame, library).map((s) => ({ ...s, vx: v.x, vy: v.y, telegraph }));
}
