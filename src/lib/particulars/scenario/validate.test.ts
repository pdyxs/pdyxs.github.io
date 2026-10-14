import { describe, it, expect } from 'vitest';
import { validate } from './validate';

const GOOD = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0, radius: 0.5 } };

describe('validate', () => {
  it('accepts a minimal scenario and returns it typed', () => {
    const result = validate(GOOD);
    expect(result).toEqual({ ok: true, scenario: GOOD });
  });
});

describe('validate errors', () => {
  it('names the path of each problem readably', () => {
    const result = validate({ walls: { width: -1, height: 'tall' }, player: { x: 0, y: 0 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'walls.width must be a positive number',
      'walls.height must be a positive number',
      'player.radius must be a positive number',
    ]);
  });

  it('rejects a non-object and missing sections', () => {
    expect(validate(null)).toEqual({ ok: false, errors: ['scenario must be an object'] });
    const result = validate({});
    expect(result).toEqual({ ok: false, errors: ['walls must be an object', 'player must be an object'] });
  });

  it('rejects a player that does not fit inside the walls', () => {
    const result = validate({ walls: { width: 4, height: 4 }, player: { x: 1.8, y: 0, radius: 0.5 } });
    expect(result).toEqual({ ok: false, errors: ['player must lie fully inside the walls'] });
  });
});

const FULL = {
  ...GOOD,
  formations: {
    ring: { kind: 'circle', count: 4, radius: 2, contents: ['electron', { type: 'electron', parity: -1 }] },
    spoke: { kind: 'line', count: 3, distance: 1, angle: 30, contents: ['ring'] },
  },
  waves: [{ id: 'a', entries: [{ spawn: 'spoke', position: { x: 1, y: 1 }, angle: 10, velocity: { magnitude: 2, angle: 90 }, telegraph: 1 }] }],
  triggers: [{ kind: 'time', at: 1, every: 2, repeats: 3, actions: [{ kind: 'spawn', wave: 'a' }] }],
};
const errorsOf = (json: unknown) => {
  const r = validate(json);
  return r.ok ? [] : r.errors;
};

describe('validate formations, waves and triggers', () => {
  it('accepts a scenario with formations, waves and a repeating trigger', () => {
    expect(validate(FULL)).toEqual({ ok: true, scenario: FULL });
  });

  it('accepts all 12 particle types, every colour and both parities', () => {
    const types = ['up', 'down', 'strange', 'charm', 'top', 'bottom', 'electron', 'muon', 'tau', 'electronNeutrino', 'muonNeutrino', 'tauNeutrino'];
    const entries = types.flatMap((type) =>
      ['white', 'red', 'green', 'blue'].flatMap((colour) => [1, -1].map((parity) => ({ spawn: { type, colour, parity } }))),
    );
    expect(validate({ ...GOOD, waves: [{ id: 'all', entries }] }).ok).toBe(true);
  });

  it('rejects an unknown particle, colour or parity', () => {
    const bad = (spawn: unknown) => errorsOf({ ...GOOD, waves: [{ id: 'a', entries: [{ spawn }] }] });
    expect(bad('gluon')).toEqual(['waves[0].entries[0].spawn: "gluon" is neither a formation nor a particle type']);
    expect(bad({ type: 'up', colour: 'pink' })).toEqual(['waves[0].entries[0].spawn.colour must be one of white, red, green, blue']);
    expect(bad({ type: 'up', parity: 0 })).toEqual(['waves[0].entries[0].spawn.parity must be 1 or -1']);
  });

  it('checks formation shape fields and contents', () => {
    const errs = errorsOf({
      ...GOOD,
      formations: {
        a: { kind: 'blob', contents: ['up'] },
        b: { kind: 'line', count: 0, distance: 'far', contents: [] },
        c: { kind: 'circle', count: 3, radius: 1, arc: 2, contents: ['nope'] },
      },
    });
    expect(errs).toEqual([
      'formations.a.kind must be single, line or circle',
      'formations.b.count must be a positive integer',
      'formations.b.distance must be a number',
      'formations.b.contents must be a non-empty array',
      'formations.c.arc must be greater than 0 and at most 1',
      'formations.c.contents[0]: "nope" is neither a formation nor a particle type',
    ]);
  });

  it('checks entries: velocity, telegraph, position', () => {
    const errs = errorsOf({
      ...GOOD,
      waves: [{ id: 'a', entries: [{ spawn: 'up', velocity: { speed: 1 }, telegraph: -1, position: { x: 'a', y: 0 } }] }],
    });
    expect(errs).toEqual([
      'waves[0].entries[0].position must have numeric x and y',
      'waves[0].entries[0].velocity must be {magnitude, angle?} or {x, y}',
      'waves[0].entries[0].telegraph must be zero or more seconds',
    ]);
  });

  it('checks wave ids and trigger fields, and that a trigger names a real wave', () => {
    const errs = errorsOf({
      ...GOOD,
      waves: [{ id: 'a', entries: [] }, { id: 'a', entries: [] }],
      triggers: [
        { kind: 'button', actions: [] },
        { kind: 'time', at: -1, every: 0, repeats: 1.5, actions: [{ kind: 'spawn', wave: 'zzz' }, { kind: 'explode' }] },
      ],
    });
    expect(errs).toEqual([
      'waves[1].id "a" is already used',
      'triggers[0].kind must be time',
      'triggers[1].at must be zero or more seconds',
      'triggers[1].every must be a positive number',
      'triggers[1].repeats must be a non-negative integer',
      'triggers[1].actions[0].wave: no wave "zzz"',
      'triggers[1].actions[1].kind must be spawn',
    ]);
  });

  it('rejects formations that contain themselves', () => {
    const errs = errorsOf({
      ...GOOD,
      formations: {
        a: { kind: 'single', contents: ['b'] },
        b: { kind: 'single', contents: ['a'] },
      },
    });
    expect(errs).toEqual(['formations.a contains itself through b']);
  });

  it('leaves unknown top-level sections alone, for win/lose rules later', () => {
    expect(validate({ ...GOOD, rules: { win: [] } }).ok).toBe(true);
  });
});


describe('validate forces and black holes', () => {
  const errorsOf = (extra: object) => {
    const r = validate({ ...GOOD, ...extra });
    return r.ok ? [] : r.errors;
  };

  it('accepts force switches and black holes', () => {
    const extra = { forces: { em: true, gravity: false }, blackHoles: [{ x: 3, y: -2, mass: 10 }] };
    expect(validate({ ...GOOD, ...extra })).toEqual({ ok: true, scenario: { ...GOOD, ...extra } });
  });

  it('rejects a non-object forces, unknown force names and non-boolean switches', () => {
    expect(errorsOf({ forces: [] })).toEqual(['forces must be an object']);
    expect(errorsOf({ forces: { magnetism: true, em: 1 } })).toEqual([
      'forces.magnetism is not a force (use strong, weak, em, gravity)',
      'forces.em must be true or false',
    ]);
  });

  it('checks each black hole', () => {
    expect(errorsOf({ blackHoles: {} })).toEqual(['blackHoles must be an array']);
    expect(errorsOf({ blackHoles: [{ x: 'a', y: 0, mass: 0 }, 3] })).toEqual([
      'blackHoles[0].x must be a number',
      'blackHoles[0].mass must be a positive number',
      'blackHoles[1] must be an object',
    ]);
  });

  it('keeps a black hole inside the walls, and allows one while gravity is off', () => {
    expect(errorsOf({ blackHoles: [{ x: 11, y: 0, mass: 1 }] })).toEqual(['blackHoles[0] must lie inside the walls']);
    expect(errorsOf({ forces: { gravity: false }, blackHoles: [{ x: 1, y: 1, mass: 1 }] })).toEqual([]);
  });
});
