import { describe, it, expect } from 'vitest';
import { stepPickup } from './pickups';
import { FIXED_DT, PICKUP_LIFETIME_SECONDS, PICKUP_NEAR_SPEED, PICKUP_SPEED } from '../constants';

const player = { x: 0, y: 0, radius: 0.75 };

describe('stepPickup', () => {
  it('drifts toward the player slowly when far, quickly when near', () => {
    const far = stepPickup({ x: 10, y: 0, age: 0 }, player);
    expect(10 - far.x).toBeCloseTo(PICKUP_SPEED * FIXED_DT);
    const near = stepPickup({ x: 2, y: 0, age: 0 }, player);
    expect(2 - near.x).toBeCloseTo(PICKUP_NEAR_SPEED * FIXED_DT);
    expect(far.collected || near.collected).toBe(false);
  });

  it('is collected when it reaches the player', () => {
    expect(stepPickup({ x: 1, y: 0, age: 0 }, player).collected).toBe(true);
  });

  it('sits still with no player, and expires after its lifetime', () => {
    const idle = stepPickup({ x: 4, y: 4, age: 0 }, null);
    expect(idle).toMatchObject({ x: 4, y: 4, collected: false, expired: false });
    expect(stepPickup({ x: 4, y: 4, age: PICKUP_LIFETIME_SECONDS }, null).expired).toBe(true);
  });
});
