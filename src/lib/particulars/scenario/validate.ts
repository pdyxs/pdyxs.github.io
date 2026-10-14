import { BOSON_TYPES, FORCE_NAMES, PARTICLE_COLOURS, PARTICLE_TYPES, WALL_MODES } from './types';
import type { Scenario, ValidationResult } from './types';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0;
const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isParticleType = (v: unknown) => ([...PARTICLE_TYPES, ...BOSON_TYPES] as readonly string[]).includes(v as string);

/** Checks a formation slot or wave target; pushes problems and returns nothing. */
function checkRef(ref: unknown, at: string, formations: Record<string, unknown>, errors: string[]): void {
  if (typeof ref === 'string') {
    if (!(ref in formations) && !isParticleType(ref)) {
      errors.push(`${at}: "${ref}" is neither a formation nor a particle type`);
    }
    return;
  }
  if (!isObject(ref)) {
    errors.push(`${at} must be a formation name, a particle type or a particle object`);
    return;
  }
  if (!isParticleType(ref.type)) errors.push(`${at}.type must be one of ${[...PARTICLE_TYPES, ...BOSON_TYPES].join(', ')}`);
  if (ref.colour !== undefined && !(PARTICLE_COLOURS as readonly string[]).includes(ref.colour as string)) {
    errors.push(`${at}.colour must be one of ${PARTICLE_COLOURS.join(', ')}`);
  }
  if (ref.parity !== undefined && ref.parity !== 1 && ref.parity !== -1) errors.push(`${at}.parity must be 1 or -1`);
}

function checkFormations(formations: Record<string, unknown>, errors: string[]): void {
  for (const [name, f] of Object.entries(formations)) {
    const at = `formations.${name}`;
    if (!isObject(f)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (f.kind !== 'single' && f.kind !== 'line' && f.kind !== 'circle') {
      errors.push(`${at}.kind must be single, line or circle`);
    }
    if (f.kind === 'line' || f.kind === 'circle' ? !isPositiveInt(f.count) : f.count !== undefined && !isPositiveInt(f.count)) {
      errors.push(`${at}.count must be a positive integer`);
    }
    if (f.kind === 'line' && !isFiniteNumber(f.distance)) errors.push(`${at}.distance must be a number`);
    if (f.kind === 'circle' && !isNonNegative(f.radius)) errors.push(`${at}.radius must be zero or more`);
    if (f.kind === 'circle' && f.arc !== undefined && !(isFiniteNumber(f.arc) && f.arc > 0 && f.arc <= 1)) {
      errors.push(`${at}.arc must be greater than 0 and at most 1`);
    }
    if (f.angle !== undefined && !isFiniteNumber(f.angle)) errors.push(`${at}.angle must be a number`);
    if (!Array.isArray(f.contents) || f.contents.length === 0) errors.push(`${at}.contents must be a non-empty array`);
    else f.contents.forEach((c, i) => checkRef(c, `${at}.contents[${i}]`, formations, errors));
  }
}

/** Formation names directly referenced by a formation's contents. */
const childrenOf = (f: unknown, formations: Record<string, unknown>): string[] =>
  isObject(f) && Array.isArray(f.contents)
    ? f.contents.filter((c): c is string => typeof c === 'string' && c in formations)
    : [];

/** One error per cycle among formations that reference each other. */
function checkCycles(formations: Record<string, unknown>, errors: string[]): void {
  const inReportedCycle = new Set<string>();
  for (const start of Object.keys(formations)) {
    if (inReportedCycle.has(start)) continue;
    const visit = (name: string, path: string[]): string[] | null => {
      for (const child of childrenOf(formations[name], formations)) {
        if (child === start) return [...path, name];
        if (path.includes(child) || child === name) continue;
        const found = visit(child, [...path, name]);
        if (found) return found;
      }
      return null;
    };
    const cycle = visit(start, []);
    if (!cycle) continue;
    cycle.forEach((n) => inReportedCycle.add(n));
    errors.push(
      cycle.length === 1
        ? `formations.${start} contains itself`
        : `formations.${start} contains itself through ${cycle[cycle.length - 1]}`,
    );
  }
}

function checkForces(forces: unknown, errors: string[]): void {
  if (!isObject(forces)) return void errors.push('forces must be an object');
  for (const [name, on] of Object.entries(forces)) {
    if (!(FORCE_NAMES as readonly string[]).includes(name)) {
      errors.push(`forces.${name} is not a force (use ${FORCE_NAMES.join(', ')})`);
    } else if (typeof on !== 'boolean') errors.push(`forces.${name} must be true or false`);
  }
}

function checkBlackHoles(holes: unknown, errors: string[]): void {
  if (!Array.isArray(holes)) return void errors.push('blackHoles must be an array');
  holes.forEach((h, i) => {
    const at = `blackHoles[${i}]`;
    if (!isObject(h)) return void errors.push(`${at} must be an object`);
    if (!isFiniteNumber(h.x)) errors.push(`${at}.x must be a number`);
    if (!isFiniteNumber(h.y)) errors.push(`${at}.y must be a number`);
    if (!isPositive(h.mass)) errors.push(`${at}.mass must be a positive number`);
  });
}

function checkBarriers(barriers: unknown, errors: string[]): void {
  if (!Array.isArray(barriers)) return void errors.push('barriers must be an array');
  barriers.forEach((w, i) => {
    const at = `barriers[${i}]`;
    if (!isObject(w)) return void errors.push(`${at} must be an object`);
    if (w.shape !== 'rect' && w.shape !== 'arc') return void errors.push(`${at}.shape must be rect or arc`);
    if (!(WALL_MODES as readonly string[]).includes(w.mode as string)) {
      errors.push(`${at}.mode must be one of ${WALL_MODES.join(', ')}`);
    }
    if (!isFiniteNumber(w.x)) errors.push(`${at}.x must be a number`);
    if (!isFiniteNumber(w.y)) errors.push(`${at}.y must be a number`);
    if (w.shape === 'rect') {
      if (!isPositive(w.width)) errors.push(`${at}.width must be a positive number`);
      if (!isPositive(w.height)) errors.push(`${at}.height must be a positive number`);
      if (w.angle !== undefined && !isFiniteNumber(w.angle)) errors.push(`${at}.angle must be a number`);
      return;
    }
    if (!isPositive(w.radius)) errors.push(`${at}.radius must be a positive number`);
    else if (!(isPositive(w.thickness) && w.thickness < w.radius)) {
      errors.push(`${at}.thickness must be positive and less than the radius`);
    }
    if (w.start !== undefined && !isFiniteNumber(w.start)) errors.push(`${at}.start must be a number`);
    if (w.sweep !== undefined && !(isFiniteNumber(w.sweep) && w.sweep > 0 && w.sweep <= 360)) {
      errors.push(`${at}.sweep must be greater than 0 and at most 360`);
    }
  });
}

function checkWaves(waves: unknown, formations: Record<string, unknown>, errors: string[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(waves)) {
    errors.push('waves must be an array');
    return ids;
  }
  waves.forEach((w, i) => {
    const at = `waves[${i}]`;
    if (!isObject(w)) return void errors.push(`${at} must be an object`);
    if (typeof w.id !== 'string' || w.id === '') errors.push(`${at}.id must be a non-empty string`);
    else if (ids.has(w.id)) errors.push(`${at}.id "${w.id}" is already used`);
    else ids.add(w.id);
    if (!Array.isArray(w.entries)) return void errors.push(`${at}.entries must be an array`);
    w.entries.forEach((e, j) => {
      const ea = `${at}.entries[${j}]`;
      if (!isObject(e)) return void errors.push(`${ea} must be an object`);
      checkRef(e.spawn, `${ea}.spawn`, formations, errors);
      if (e.position !== undefined && !(isObject(e.position) && isFiniteNumber(e.position.x) && isFiniteNumber(e.position.y))) {
        errors.push(`${ea}.position must have numeric x and y`);
      }
      if (e.angle !== undefined && !isFiniteNumber(e.angle)) errors.push(`${ea}.angle must be a number`);
      const v = e.velocity;
      if (v !== undefined) {
        const polar = isObject(v) && isFiniteNumber(v.magnitude) && (v.angle === undefined || isFiniteNumber(v.angle));
        const cartesian = isObject(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y);
        if (!polar && !cartesian) errors.push(`${ea}.velocity must be {magnitude, angle?} or {x, y}`);
      }
      if (e.telegraph !== undefined && !isNonNegative(e.telegraph)) {
        errors.push(`${ea}.telegraph must be zero or more seconds`);
      }
    });
  });
  return ids;
}

function checkTriggers(triggers: unknown, waveIds: Set<string>, errors: string[]): void {
  if (!Array.isArray(triggers)) return void errors.push('triggers must be an array');
  triggers.forEach((t, i) => {
    const at = `triggers[${i}]`;
    if (!isObject(t)) return void errors.push(`${at} must be an object`);
    if (t.kind === 'page-button') {
      if (typeof t.button !== 'string' || t.button === '') errors.push(`${at}.button must be a non-empty string`);
    } else if (t.kind === 'time') {
      if (!isNonNegative(t.at)) errors.push(`${at}.at must be zero or more seconds`);
      if (t.every !== undefined && !isPositive(t.every)) errors.push(`${at}.every must be a positive number`);
      if (t.repeats !== undefined && !(Number.isInteger(t.repeats) && (t.repeats as number) >= 0)) {
        errors.push(`${at}.repeats must be a non-negative integer`);
      }
    } else return void errors.push(`${at}.kind must be time or page-button`);
    if (!Array.isArray(t.actions)) return void errors.push(`${at}.actions must be an array`);
    t.actions.forEach((a, j) => {
      const aa = `${at}.actions[${j}]`;
      if (!isObject(a) || a.kind !== 'spawn') return void errors.push(`${aa}.kind must be spawn`);
      if (typeof a.wave !== 'string' || !waveIds.has(a.wave)) errors.push(`${aa}.wave: no wave "${String(a.wave)}"`);
    });
  });
}

/** Pure: checks parsed JSON against the scenario shape, collecting every problem. */
export function validate(json: unknown): ValidationResult {
  if (!isObject(json)) return { ok: false, errors: ['scenario must be an object'] };
  const errors: string[] = [];
  const { walls, player } = json;

  if (!isObject(walls)) errors.push('walls must be an object');
  else {
    if (!isPositive(walls.width)) errors.push('walls.width must be a positive number');
    if (!isPositive(walls.height)) errors.push('walls.height must be a positive number');
  }

  if (!isObject(player)) errors.push('player must be an object');
  else {
    if (!isFiniteNumber(player.x)) errors.push('player.x must be a number');
    if (!isFiniteNumber(player.y)) errors.push('player.y must be a number');
    if (!isPositive(player.radius)) errors.push('player.radius must be a positive number');
    if (player.particle !== undefined) {
      if (isObject(player.particle)) checkRef(player.particle, 'player.particle', {}, errors);
      else errors.push('player.particle must be a particle object');
    }
  }

  const formations = isObject(json.formations) ? json.formations : {};
  if (json.formations !== undefined) {
    if (!isObject(json.formations)) errors.push('formations must be an object');
    else {
      checkFormations(formations, errors);
      checkCycles(formations, errors);
    }
  }
  if (json.forces !== undefined) checkForces(json.forces, errors);
  if (json.blackHoles !== undefined) checkBlackHoles(json.blackHoles, errors);
  if (json.barriers !== undefined) checkBarriers(json.barriers, errors);
  const waveIds = json.waves !== undefined ? checkWaves(json.waves, formations, errors) : new Set<string>();
  if (json.triggers !== undefined) checkTriggers(json.triggers, waveIds, errors);

  if (errors.length === 0) {
    const w = walls as Scenario['walls'];
    const p = player as Scenario['player'];
    if (Math.abs(p.x) + p.radius > w.width / 2 || Math.abs(p.y) + p.radius > w.height / 2) {
      errors.push('player must lie fully inside the walls');
    }
    (json.blackHoles as Scenario['blackHoles'] ?? []).forEach((h, i) => {
      if (Math.abs(h.x) > w.width / 2 || Math.abs(h.y) > w.height / 2) errors.push(`blackHoles[${i}] must lie inside the walls`);
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, scenario: json as unknown as Scenario };
}
