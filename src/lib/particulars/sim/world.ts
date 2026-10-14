import { World as PlanckWorld, Circle, Box, Vec2 } from 'planck';
import type { Body } from 'planck';
import type { Scenario } from '../scenario/types';
import type { Vec } from '../input/steer';
import type { Snapshot } from './snapshot';
import { thrustFor, wallSlabs } from './decisions';
import {
  FIXED_DT,
  PLAYER_DAMPING,
  PLAYER_DENSITY,
  PLAYER_FRICTION,
  PLAYER_RESTITUTION,
  POSITION_ITERATIONS,
  STEER_FORCE,
  VELOCITY_ITERATIONS,
  WALL_THICKNESS,
} from '../constants';

/**
 * Headless planck world: the thin applier. Decisions live in decisions.ts and
 * steer(); this class only writes them to bodies and reads state back out as a
 * Snapshot. Nothing outside sim/ ever sees a planck object.
 */
export class World {
  private readonly world = new PlanckWorld({ gravity: new Vec2(0, 0) });
  private readonly player: Body;
  private readonly walls: Scenario['walls'];
  private tick = 0;

  constructor(scenario: Scenario) {
    this.walls = { ...scenario.walls };

    const ground = this.world.createBody();
    for (const s of wallSlabs(scenario.walls.width, scenario.walls.height, WALL_THICKNESS)) {
      ground.createFixture(new Box(s.hw, s.hh, new Vec2(s.cx, s.cy), 0));
    }

    this.player = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(scenario.player.x, scenario.player.y),
      linearDamping: PLAYER_DAMPING,
      fixedRotation: true,
      bullet: true,
    });
    this.player.createFixture(new Circle(scenario.player.radius), {
      density: PLAYER_DENSITY,
      restitution: PLAYER_RESTITUTION,
      friction: PLAYER_FRICTION,
    });
  }

  /** Advance exactly one fixed step under the given steer vector. */
  step(steerVec: Vec): void {
    const f = thrustFor(steerVec, STEER_FORCE);
    this.player.applyForceToCenter(new Vec2(f.x, f.y), true);
    this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.tick++;
  }

  snapshot(): Snapshot {
    const p = this.player.getPosition();
    const shape = this.player.getFixtureList()!.getShape() as Circle;
    return {
      tick: this.tick,
      walls: { ...this.walls },
      player: { x: p.x, y: p.y, radius: shape.getRadius() },
    };
  }
}
