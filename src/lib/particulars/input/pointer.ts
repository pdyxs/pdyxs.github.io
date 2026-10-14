import type { Vec } from './steer';

/** Pure: client pixel position to world units, given the element rect and the viewBox it shows. */
export function clientToWorld(
  client: Vec,
  rect: { left: number; top: number; width: number; height: number },
  view: { x: number; y: number; width: number; height: number },
): Vec {
  return {
    x: view.x + ((client.x - rect.left) / rect.width) * view.width,
    y: view.y + ((client.y - rect.top) / rect.height) * view.height,
  };
}

/** Pure: whether a world point lands on the player. A press here is the action, never steering. */
export function hitsPlayer(point: Vec, player: { x: number; y: number; radius: number }): boolean {
  return Math.hypot(point.x - player.x, point.y - player.y) <= player.radius;
}

/** Pure: a press on the player is the action's `tap-self`; anywhere else steers. No timing involved. */
export function pressKind(point: Vec, player: { x: number; y: number; radius: number }): 'tap-self' | 'steer' {
  return hitsPlayer(point, player) ? 'tap-self' : 'steer';
}
