import { World as PlanckWorld, Circle, Box, Vec2 } from 'planck';
import type { Body } from 'planck';
import { resolveParticle } from '../scenario/expand';
import type { Scenario, ParticleSpec, SpawnSpec } from '../scenario/types';
import { dueSpawns, initialSchedule } from './scheduler';
import type { ScheduleState } from './scheduler';
import type { Vec } from '../input/steer';
import type { Intent } from '../input/bindings';
import type { Snapshot } from './snapshot';

import { forces } from './forces';
import { resolveSwitches } from '../scenario/switches';
import { blackHoleRadius, bosonDirection, telegraphTicks, thrustFor, wallSlabs } from './decisions';
import { change, decay, interactions } from './interactions';
import type { Outcome, Participant } from './interactions';
import type { WorldEvent } from './events';
import {
  BLACK_HOLE_DENSITY,
  FIXED_DT,
  W_CLEARANCE,
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
  W_RECOIL,
  W_SPEED,
} from '../constants';

/**
 * Headless planck world: the thin applier. Decisions live in decisions.ts and
 * steer(); this class only writes them to bodies and reads state back out as a
 * Snapshot. Nothing outside sim/ ever sees a planck object.
 */
const spec = ({ type, colour, parity }: ParticleSpec): ParticleSpec => ({ type, colour, parity });

/** The player is not in `spawned`, so the rules address it by this id. */
const PLAYER_ID = -1;

export type { Intent };

interface Spawned {
  id: number;
  particle: ParticleSpec;
  body: Body;
  velocity: Vec;
  /** The tick at which it becomes live. */
  liveTick: number;
  live: boolean;
  /** Fixed steps lived since going live or last changing: the decay clock. */
  age: number;
}

export class World {
  private readonly world = new PlanckWorld({ gravity: new Vec2(0, 0) });
  private readonly player: Body;
  private readonly walls: Scenario['walls'];
  private playerSpec: ParticleSpec;
  private playerAge = 0;
  private playerAlive = true;
  /** Pairs that touched this step, collected by the contact listener and decided after the step. */
  private touches: [number, number][] = [];
  private tick = 0;
  private readonly scenario: Scenario;
  private schedule: ScheduleState = initialSchedule();
  private readonly spawned: Spawned[] = [];
  private nextId = 0;
  private events: WorldEvent[] = [];

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.walls = { ...scenario.walls };
    this.playerSpec = resolveParticle(scenario.player.particle ?? { type: 'down' });

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
    this.player.setUserData(PLAYER_ID);
    this.world.on('begin-contact', (c) => {
      const a = c.getFixtureA().getBody().getUserData();
      const b = c.getFixtureB().getBody().getUserData();
      if (typeof a === 'number' && typeof b === 'number') this.touches.push([a, b]);
    });
    this.player.createFixture(new Circle(scenario.player.radius), {
      density: PLAYER_DENSITY,
      restitution: PLAYER_RESTITUTION,
      friction: PLAYER_FRICTION,
    });
  }

  /** Put a body in the world. A telegraphing one is inert until `liveTick`. */
  private addParticle(particle: ParticleSpec, x: number, y: number, velocity: Vec, liveTick: number): void {
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      fixedRotation: true,
      bullet: true,
    });
    body.createFixture(new Circle(PARTICLE_RADIUS), {
      density: PARTICLE_DENSITY,
      restitution: PARTICLE_RESTITUTION,
      friction: PARTICLE_FRICTION,
    });
    body.setUserData(this.nextId);
    const live = liveTick <= this.tick;
    if (live) body.setLinearVelocity(new Vec2(velocity.x, velocity.y));
    else body.setActive(false);
    this.spawned.push({ id: this.nextId++, particle, body, velocity, liveTick, live, age: 0 });
  }

  private spawn(spec: SpawnSpec): void {
    this.addParticle(spec.particle, spec.x, spec.y, { x: spec.vx, y: spec.vy }, this.tick + telegraphTicks(spec.telegraph, FIXED_DT));
  }

  private participants(): Participant[] {
    const player = this.playerAlive ? [{ id: PLAYER_ID, ...this.playerSpec }] : [];
    return [...player, ...this.spawned.map((s) => ({ id: s.id, ...s.particle }))];
  }

  private switches() {
    return { weak: resolveSwitches(this.scenario.forces).weak };
  }

  /** Apply one rule outcome to the bodies and say so as an event. */
  private apply(o: Outcome, steerVec: Vec): void {
    if (o.kind === 'annihilate') {
      const [a, b] = o.ids.map((id) => this.participants().find((p) => p.id === id)!);
      o.ids.forEach((id) => this.remove(id));
      this.events.push({ tick: this.tick, kind: 'annihilated', a: spec(a), b: spec(b), playerDied: o.ids.includes(PLAYER_ID) });
      return;
    }
    if (o.kind === 'absorb') {
      const from = this.becomes(o.id, o.becomes);
      this.remove(o.bosonId);
      this.events.push({ tick: this.tick, kind: 'absorbed', from, to: o.becomes, isPlayer: o.id === PLAYER_ID });
      return;
    }
    const isPlayer = o.id === PLAYER_ID;
    const body = isPlayer ? this.player : this.spawned.find((s) => s.id === o.id)!.body;
    const from = this.becomes(o.id, o.becomes);
    const dir = bosonDirection(isPlayer ? steerVec : { x: 0, y: 0 }, body.getLinearVelocity());
    const radius = isPlayer ? (this.player.getFixtureList()!.getShape() as Circle).getRadius() : PARTICLE_RADIUS;
    const at = body.getPosition();
    const gap = radius + PARTICLE_RADIUS + W_CLEARANCE;
    this.addParticle(o.boson, at.x + dir.x * gap, at.y + dir.y * gap, { x: dir.x * W_SPEED, y: dir.y * W_SPEED }, this.tick);
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(v.x - dir.x * W_RECOIL, v.y - dir.y * W_RECOIL));
    this.events.push({ tick: this.tick, kind: o.kind === 'change' ? 'changed' : 'decayed', from, to: o.becomes, isPlayer });
  }

  /** Decide each touching pair once, skipping any particle an earlier pair already consumed this step. */
  private resolveTouches(steerVec: Vec): void {
    const touches = this.touches;
    this.touches = [];
    const spent = new Set<number>();
    const find = (id: number) => this.participants().find((p) => p.id === id);
    for (const [ia, ib] of touches) {
      const a = find(ia);
      const b = find(ib);
      if (!a || !b || spent.has(ia) || spent.has(ib)) continue;
      for (const o of interactions(a, b, this.switches())) {
        const ids = o.kind === 'annihilate' ? o.ids : o.kind === 'absorb' ? [o.id, o.bosonId] : [];
        ids.forEach((i) => spent.add(i));
        this.apply(o, steerVec);
      }
    }
  }

  private remove(id: number): void {
    if (id === PLAYER_ID) {
      this.playerAlive = false;
      this.player.setActive(false);
      return;
    }
    const i = this.spawned.findIndex((s) => s.id === id);
    this.world.destroyBody(this.spawned[i].body);
    this.spawned.splice(i, 1);
  }

  private decayDue(steerVec: Vec): void {
    const ages = new Map<number, number>([[PLAYER_ID, this.playerAge], ...this.spawned.map((s) => [s.id, s.age] as [number, number])]);
    for (const p of this.participants()) {
      if (p.id !== PLAYER_ID && !this.spawned.find((s) => s.id === p.id)!.live) continue;
      for (const o of decay(p, ages.get(p.id)! * FIXED_DT, this.switches())) this.apply(o, steerVec);
    }
  }

  /** Swap a particle's spec in place (same body, same id) and restart its decay clock; returns the old spec. */
  private becomes(id: number, next: ParticleSpec): ParticleSpec {
    if (id === PLAYER_ID) {
      const from = this.playerSpec;
      this.playerSpec = next;
      this.playerAge = 0;
      return from;
    }
    const s = this.spawned.find((x) => x.id === id)!;
    const from = s.particle;
    s.particle = next;
    s.age = 0;
    return from;
  }

  /** The events since the last call, oldest first. */
  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Advance exactly one fixed step under the given steer vector; `buttons` are page buttons pressed since the last. */
  step(steerVec: Vec, intents: Intent[] = [], buttons: string[] = []): void {
    const due = dueSpawns(this.scenario, this.tick * FIXED_DT, this.schedule, buttons);
    this.schedule = due.state;
    for (const spec of due.spawns) this.spawn(spec);
    for (const s of this.spawned) {
      if (!s.live && s.liveTick <= this.tick) {
        s.live = true;
        s.body.setActive(true);
        s.body.setLinearVelocity(new Vec2(s.velocity.x, s.velocity.y));
      }
    }
    for (const intent of intents) {
      if (intent.kind !== 'change') continue; // 'explode' has no rule yet
      if (!this.playerAlive) break;
      for (const o of change({ id: PLAYER_ID, ...this.playerSpec }, this.switches())) this.apply(o, steerVec);
    }
    const f = this.playerAlive ? thrustFor(steerVec, STEER_FORCE) : { x: 0, y: 0 };
    const snap = this.snapshot();
    const accel = forces(snap, snap.forces);
    this.spawned.forEach((s, i) => {
      if (!s.live) return;
      const m = s.body.getMass();
      s.body.applyForceToCenter(new Vec2(accel[i].x * m, accel[i].y * m), true);
    });
    this.player.applyForceToCenter(new Vec2(f.x, f.y), true);
    this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.tick++;
    this.playerAge++;
    this.resolveTouches(steerVec);
    for (const s of this.spawned) if (s.live) s.age++;
    this.decayDue(steerVec);
  }

  snapshot(): Snapshot {
    const p = this.player.getPosition();
    const shape = this.player.getFixtureList()!.getShape() as Circle;
    return {
      tick: this.tick,
      walls: { ...this.walls },
      player: { x: p.x, y: p.y, radius: shape.getRadius(), ...this.playerSpec, alive: this.playerAlive },
      forces: resolveSwitches(this.scenario.forces),
      blackHoles: (this.scenario.blackHoles ?? []).map((h) => ({
        ...h,
        radius: blackHoleRadius(h.mass, BLACK_HOLE_DENSITY),
      })),
      particles: this.spawned.map((s) => {
        const pos = s.body.getPosition();
        return { id: s.id, ...s.particle, x: pos.x, y: pos.y, radius: PARTICLE_RADIUS, live: s.live };
      }),
    };
  }
}
