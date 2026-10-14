import { World as PlanckWorld, Circle, Box, Vec2 } from 'planck';
import type { Body } from 'planck';
import type { Scenario, ParticleSpec, SpawnSpec } from '../scenario/types';
import { dueSpawns, initialSchedule } from './scheduler';
import type { ScheduleState } from './scheduler';
import type { Vec } from '../input/steer';
import type { Snapshot } from './snapshot';

import { telegraphTicks, thrustFor, wallSlabs } from './decisions';
import {
  FIXED_DT,
  PARTICLE_DENSITY,
  PARTICLE_FRICTION,
  PARTICLE_RADIUS,
  PARTICLE_RESTITUTION,
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
interface Spawned {
  id: number;
  particle: ParticleSpec;
  body: Body;
  velocity: Vec;
  /** The tick at which it becomes live. */
  liveTick: number;
  live: boolean;
}

export class World {
  private readonly world = new PlanckWorld({ gravity: new Vec2(0, 0) });
  private readonly player: Body;
  private readonly walls: Scenario['walls'];
  private tick = 0;
  private readonly scenario: Scenario;
  private schedule: ScheduleState = initialSchedule();
  private readonly spawned: Spawned[] = [];
  private nextId = 0;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
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

  /** Put a spawn in the world, inert until its telegraph has run out. */
  private spawn(spec: SpawnSpec): void {
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(spec.x, spec.y),
      fixedRotation: true,
      bullet: true,
    });
    body.createFixture(new Circle(PARTICLE_RADIUS), {
      density: PARTICLE_DENSITY,
      restitution: PARTICLE_RESTITUTION,
      friction: PARTICLE_FRICTION,
    });
    body.setActive(false);
    this.spawned.push({
      id: this.nextId++,
      particle: spec.particle,
      body,
      velocity: { x: spec.vx, y: spec.vy },
      liveTick: this.tick + telegraphTicks(spec.telegraph, FIXED_DT),
      live: false,
    });
  }

  /** Advance exactly one fixed step under the given steer vector. */
  step(steerVec: Vec): void {
    const due = dueSpawns(this.scenario, this.tick * FIXED_DT, this.schedule);
    this.schedule = due.state;
    for (const spec of due.spawns) this.spawn(spec);
    for (const s of this.spawned) {
      if (!s.live && s.liveTick <= this.tick) {
        s.live = true;
        s.body.setActive(true);
        s.body.setLinearVelocity(new Vec2(s.velocity.x, s.velocity.y));
      }
    }
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
      particles: this.spawned.map((s) => {
        const pos = s.body.getPosition();
        return { id: s.id, ...s.particle, x: pos.x, y: pos.y, radius: PARTICLE_RADIUS, live: s.live };
      }),
    };
  }
}
