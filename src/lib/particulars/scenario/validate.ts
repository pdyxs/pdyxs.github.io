import type { Scenario, ValidationResult } from './types';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
  }

  if (errors.length === 0) {
    const w = walls as Scenario['walls'];
    const p = player as Scenario['player'];
    if (Math.abs(p.x) + p.radius > w.width / 2 || Math.abs(p.y) + p.radius > w.height / 2) {
      errors.push('player must lie fully inside the walls');
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, scenario: json as unknown as Scenario };
}
