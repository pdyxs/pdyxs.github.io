import { FIXED_DT, PICKUP_LIFETIME_SECONDS, PICKUP_NEAR_RADIUS, PICKUP_NEAR_SPEED, PICKUP_RADIUS, PICKUP_SPEED } from '../constants';
import type { Vec } from '../input/steer';

export interface PickupState {
  x: number;
  y: number;
  /** Seconds since it appeared. */
  age: number;
}

export type PickupStep = PickupState & { collected: boolean; expired: boolean };

/**
 * Pure: one fixed step of a pickup. It is collected when within PICKUP_RADIUS
 * of the player's edge, otherwise it drifts toward the player (faster when
 * close); with no player it sits still. It expires when its lifetime is up.
 */
export function stepPickup(p: PickupState, player: (Vec & { radius: number }) | null): PickupStep {
  const age = p.age + FIXED_DT;
  if (age > PICKUP_LIFETIME_SECONDS) return { ...p, age, collected: false, expired: true };
  if (!player) return { ...p, age, collected: false, expired: false };
  const dx = player.x - p.x;
  const dy = player.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < PICKUP_RADIUS + player.radius) return { ...p, age, collected: true, expired: false };
  const speed = (d < PICKUP_NEAR_RADIUS ? PICKUP_NEAR_SPEED : PICKUP_SPEED) * FIXED_DT;
  return { x: p.x + (dx / d) * speed, y: p.y + (dy / d) * speed, age, collected: false, expired: false };
}
