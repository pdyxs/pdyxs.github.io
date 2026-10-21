import { World as PlanckWorld, Circle, Box, Vec2 } from 'planck';
import type { Body } from 'planck';
import { wallPieces, wallResponse } from './walls';
import { resolveParticle } from '../scenario/expand';
import type { Scenario, ParticleSpec, SpawnSpec, WallMode } from '../scenario/types';
import { dueSpawns, initialSchedule } from './scheduler';
import type { ScheduleState } from './scheduler';
import type { Vec } from '../input/steer';
import type { Intent } from '../input/bindings';
import type { Snapshot } from './snapshot';

import { forces } from './forces';
import type { ForcedParticle } from './forces';
import { resolveSwitches } from '../scenario/switches';
import {
  blackHoleRadius,
  bosonDirection,
  distanceToBox,
  easeInCubic,
  easeOutQuint,
  playerThrust,
  rotateToward,
  telegraphTicks,
  tweenAt,
  upgradedVelocity,
  wallSlabs,
} from './decisions';
import type { Tween } from './decisions';
import { change, decay, interactions, isNeutrino } from './interactions';
import type { Outcome, Participant } from './interactions';
import type { WorldEvent } from './events';
import {
  BLACK_HOLE_DENSITY,
  CHANGE_TWEEN_SECONDS,
  CHARGE_BY_TYPE,
  DECAY_EXPULSION_BY_TYPE,
  DECAY_TIME_BY_TYPE,
  FIXED_DT,
  GROWING_BOSON_START_MASS,
  NEUTRINO_EXTRA_LIFE_SECONDS,
  NEUTRINO_SPEED,
  PARTICLE_FRICTION,
  PARTICLE_RESTITUTION,
  PLAYER_FORCE_COEFFICIENT_BY_TYPE,
  POSITION_ITERATIONS,
  SIDEGRADE_EXPULSION_BY_TYPE,
  SIZE_BY_TYPE,
  VELOCITY_ITERATIONS,
  W_TURN_DEGREES_PER_SECOND,
  WALL_FRICTION,
  WALL_RESTITUTION,
  WALL_THICKNESS,
  massOf,
  radiusOf,
} from '../constants';

/**
 * Headless planck world: the thin applier. Decisions live in decisions.ts,
 * forces.ts and interactions.ts; this class only writes them to bodies and
 * reads state back out as a Snapshot. Nothing outside sim/ ever sees a planck object.
 */
const spec = ({ type, colour, parity }: ParticleSpec): ParticleSpec => ({ type, colour, parity });

/** The player is not in `spawned`, so the rules address it by this id. */
const PLAYER_ID = -1;
const ZERO: Vec = { x: 0, y: 0 };
const TWEEN_TICKS = Math.round(CHANGE_TWEEN_SECONDS / FIXED_DT);

export type { Intent };

/** Everything the world tracks about one particle beyond what its body knows. */
interface Entity {
  id: number;
  particle: ParticleSpec;
  body: Body;
  /** The velocity it goes live with. */
  velocity: Vec;
  /** The tick at which it becomes live. */
  liveTick: number;
  live: boolean;
  /** Fixed steps since it spawned or last changed type: the original's `lifeTime`. */
  lifeTicks: number;
  /** The decay timer, in steps. Only runs while the type decays; only a spawn resets it. */
  decayTicks: number;
  /** Ids it ignores (a W is immune to its emitter until it is older). */
  immune: number[];
  /** It is mid-change (ignoring contacts) until this tick. */
  changingUntil: number;
  /** Size and mass moving to a new type's, together. */
  radius: Tween | null;
  mass: Tween | null;
  /** A velocity change spread over the change time (momentum after absorbing a W). */
  dv: { change: Vec; start: number; applied: Vec } | null;
  /** A W's facing: it turns toward the nearest particle it could be absorbed by, and decays along it. */
  heading: Vec;
  /** Seconds a neutrino takes to reach the bounds from where it was sent; it is destroyed half a second after. */
  neutrinoFlight: number;
  /** Its velocity at the start of the step, before forces and contacts. */
  lastVelocity: Vec;
}

export class World {
  private readonly world = new PlanckWorld({ gravity: new Vec2(0, 0) });
  private readonly player: Entity;
  private readonly walls: Scenario['walls'];
  private playerAlive = true;
  /** Pairs whose contact began this step, collected by the contact listener and decided after the step. */
  private touches: [number, number][] = [];
  /** Ids that touched a destroy wall this step. */
  private destroyed: number[] = [];
  private tick = 0;
  private readonly scenario: Scenario;
  private schedule: ScheduleState = initialSchedule();
  private readonly spawned: Entity[] = [];
  private nextId = 0;
  private events: WorldEvent[] = [];

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.walls = { ...scenario.walls };

    const ground = this.world.createBody();
    for (const s of wallSlabs(scenario.walls.width, scenario.walls.height, WALL_THICKNESS)) {
      ground.createFixture(new Box(s.hw, s.hh, new Vec2(s.cx, s.cy), 0), { restitution: WALL_RESTITUTION, friction: WALL_FRICTION });
    }

    for (const wall of scenario.barriers ?? []) {
      for (const p of wallPieces(wall)) {
        const f = ground.createFixture(new Box(p.hw, p.hh, new Vec2(p.cx, p.cy), p.angle), { isSensor: wall.mode === 'destroy', restitution: WALL_RESTITUTION, friction: WALL_FRICTION });
        f.setUserData(wall.mode);
      }
    }

    this.player = this.makeEntity(
      PLAYER_ID,
      resolveParticle(scenario.player.particle ?? { type: 'down' }),
      scenario.player.x,
      scenario.player.y,
      ZERO,
      0,
    );
    this.world.on('begin-contact', (c) => {
      const a = c.getFixtureA().getBody().getUserData();
      const b = c.getFixtureB().getBody().getUserData();
      if (typeof a === 'number' && typeof b === 'number') this.touches.push([a, b]);
      else if (typeof a === 'number' && c.getFixtureB().getUserData() === 'destroy') this.destroyed.push(a);
      else if (typeof b === 'number' && c.getFixtureA().getUserData() === 'destroy') this.destroyed.push(b);
    });
    // Only block/pass walls reach here (destroy walls and neutrinos are sensors): a pass wall switches its contact off.
    this.world.on('pre-solve', (c) => {
      const [fa, fb] = [c.getFixtureA(), c.getFixtureB()];
      const [mode, id] = typeof fa.getBody().getUserData() === 'number'
        ? [fb.getUserData(), fa.getBody().getUserData()]
        : [fa.getUserData(), fb.getBody().getUserData()];
      if (typeof mode === 'string' && typeof id === 'number') {
        c.setEnabled(wallResponse(mode as WallMode, this.chargeOf(id)) === 'block');
      }
    });
  }

  // ── bodies ────────────────────────────────────────────────────────────────

  /** (Re)build a body's collider: `radius` wide, density 1 (so mass is pi r^2 unless `mass` overrides it), a trigger if a neutrino. */
  private shape(e: Entity, radius: number, mass?: number): void {
    const body = e.body;
    for (let f = body.getFixtureList(); f; f = body.getFixtureList()) body.destroyFixture(f);
    body.createFixture(new Circle(radius), {
      density: 1,
      restitution: PARTICLE_RESTITUTION,
      friction: PARTICLE_FRICTION,
      isSensor: isNeutrino(e.particle),
    });
    if (mass !== undefined) body.setMassData({ mass, center: Vec2.zero(), I: 0 });
  }

  private radiusNow(e: Entity): number {
    return (e.body.getFixtureList()!.getShape() as Circle).getRadius();
  }

  private makeEntity(id: number, particle: ParticleSpec, x: number, y: number, velocity: Vec, liveTick: number, startRadius?: number): Entity {
    const body = this.world.createBody({ type: 'dynamic', position: new Vec2(x, y), fixedRotation: true, bullet: true });
    body.setUserData(id);
    const e: Entity = {
      id, particle, body, velocity, liveTick, live: false, lifeTicks: 0, decayTicks: 0, immune: [], changingUntil: 0,
      radius: null, mass: null, dv: null, heading: { x: -1, y: 0 }, neutrinoFlight: 0, lastVelocity: ZERO,
    };
    this.shape(e, startRadius ?? radiusOf(particle.type));
    e.live = liveTick <= this.tick;
    if (e.live) body.setLinearVelocity(new Vec2(velocity.x, velocity.y));
    else body.setActive(false);
    return e;
  }

  /** Put a particle in the world. A telegraphing one is inert until `liveTick`. */
  private addParticle(particle: ParticleSpec, x: number, y: number, velocity: Vec, liveTick: number, startRadius?: number): Entity {
    const e = this.makeEntity(this.nextId++, particle, x, y, velocity, liveTick, startRadius);
    if (particle.type === 'W') e.heading = unitOr(negate(velocity), { x: -1, y: 0 });
    this.spawned.push(e);
    return e;
  }

  private spawn(s: SpawnSpec): void {
    this.addParticle(s.particle, s.x, s.y, { x: s.vx, y: s.vy }, this.tick + telegraphTicks(s.telegraph, FIXED_DT));
  }

  /** Change what a particle is: its size and mass tween to the new type's, its life and immunity restart. */
  private setType(e: Entity, next: ParticleSpec): void {
    e.particle = next;
    e.lifeTicks = 0;
    e.immune = [];
    e.radius = { from: this.radiusNow(e), to: radiusOf(next.type), start: this.tick, ticks: TWEEN_TICKS };
    e.mass = { from: e.body.getMass(), to: massOf(next.type), start: this.tick, ticks: TWEEN_TICKS };
    this.shape(e, e.radius.from, e.mass.from);
  }

  /** Send a neutrino along `dir` at the neutrino speed, and work out when it will have left the bounds. */
  private launchNeutrino(e: Entity, dir: Vec): void {
    const d = unitOr(dir, ZERO);
    if (d.x === 0 && d.y === 0) return;
    e.body.setLinearVelocity(new Vec2(d.x * NEUTRINO_SPEED, d.y * NEUTRINO_SPEED));
    const at = e.body.getPosition();
    e.neutrinoFlight = distanceToBox(at, d, this.walls.width, this.walls.height) / NEUTRINO_SPEED;
  }

  /** A W leaving `emitter` along `dir`; it grows from nothing and is immune to its emitter for a while. */
  private emitBoson(boson: ParticleSpec, emitter: Entity, dir: Vec, speed: number, offset: number): void {
    const at = emitter.body.getPosition();
    const w = this.addParticle(boson, at.x + dir.x * offset, at.y + dir.y * offset, { x: dir.x * speed, y: dir.y * speed }, this.tick, 0);
    w.immune = [emitter.id];
    w.radius = { from: 0, to: radiusOf('W'), start: this.tick, ticks: TWEEN_TICKS };
    w.mass = { from: GROWING_BOSON_START_MASS, to: massOf('W'), start: this.tick, ticks: TWEEN_TICKS };
    this.shape(w, 0, GROWING_BOSON_START_MASS);
  }

  // ── rules ─────────────────────────────────────────────────────────────────

  private entities(): Entity[] {
    return [...(this.playerAlive ? [this.player] : []), ...this.spawned];
  }

  private entity(id: number): Entity | undefined {
    return id === PLAYER_ID ? (this.playerAlive ? this.player : undefined) : this.spawned.find((s) => s.id === id);
  }

  private participant(e: Entity): Participant {
    return {
      id: e.id,
      ...e.particle,
      lifeTime: e.lifeTicks * FIXED_DT,
      immune: e.immune,
      changing: this.tick < e.changingUntil,
    };
  }

  private switches() {
    return { weak: resolveSwitches(this.scenario.forces).weak };
  }

  /** Apply one rule outcome to the bodies and say so as an event. */
  private apply(o: Outcome, steerVec: Vec): void {
    if (o.kind === 'annihilate') {
      const [a, b] = o.ids.map((id) => this.entity(id)!.particle);
      o.ids.forEach((id) => this.remove(id));
      this.events.push({ tick: this.tick, kind: 'annihilated', a: spec(a), b: spec(b), playerDied: o.ids.includes(PLAYER_ID) });
      return;
    }
    if (o.kind === 'boson-decay') {
      this.decayBoson(o.id);
      return;
    }
    const e = this.entity(o.id)!;
    const from = e.particle;
    if (o.kind === 'absorb') {
      this.absorb(e, this.entity(o.bosonId)!, o.becomes);
      this.events.push({ tick: this.tick, kind: 'absorbed', from, to: o.becomes, isPlayer: o.id === PLAYER_ID });
      return;
    }
    const isPlayer = o.id === PLAYER_ID;
    const velocity = e.body.getLinearVelocity();
    const dir = bosonDirection(isPlayer ? steerVec : ZERO, velocity);
    const table = o.kind === 'decay' ? DECAY_EXPULSION_BY_TYPE : SIDEGRADE_EXPULSION_BY_TYPE;
    const recoil = table[from.type];
    this.setType(e, o.becomes);
    e.changingUntil = this.tick + TWEEN_TICKS;
    if (isNeutrino(o.becomes)) this.launchNeutrino(e, velocity);
    this.emitBoson(o.boson, e, dir, table.W, SIZE_BY_TYPE[from.type] / 2);
    const v = e.body.getLinearVelocity();
    e.body.setLinearVelocity(new Vec2(v.x - dir.x * recoil, v.y - dir.y * recoil));
    this.events.push({ tick: this.tick, kind: o.kind === 'change' ? 'changed' : 'decayed', from, to: o.becomes, isPlayer });
  }

  /** A particle takes in a W: momentum is shared out over the change, and the W is gone. */
  private absorb(e: Entity, w: Entity, becomes: ParticleSpec): void {
    const now = e.body.getLinearVelocity();
    const settled = upgradedVelocity(
      { v: now, mass: massOf(e.particle.type) },
      { v: w.body.getLinearVelocity(), mass: massOf('W') },
      massOf(becomes.type),
    );
    this.setType(e, becomes);
    this.remove(w.id);
    if (isNeutrino(becomes)) {
      this.launchNeutrino(e, now);
      return;
    }
    e.dv = { change: { x: settled.x - e.lastVelocity.x, y: settled.y - e.lastVelocity.y }, start: this.tick, applied: ZERO };
    e.body.setLinearVelocity(new Vec2(e.lastVelocity.x, e.lastVelocity.y));
  }

  /** A W that has lived its time becomes an electron (shot along its heading) and a neutrino (sent the other way). */
  private decayBoson(id: number): void {
    const w = this.entity(id)!;
    const at = w.body.getPosition();
    const dir = w.heading;
    const parity = w.particle.parity;
    const spawned = w.particle;
    this.remove(id);
    const inset = (type: 'electronNeutrino' | 'electron') => (SIZE_BY_TYPE.W - SIZE_BY_TYPE[type]) / 2;
    const neutrino = this.addParticle(
      { type: 'electronNeutrino', colour: 'white', parity },
      at.x - dir.x * inset('electronNeutrino'), at.y - dir.y * inset('electronNeutrino'), ZERO, this.tick,
    );
    this.launchNeutrino(neutrino, negate(dir));
    const speed = DECAY_EXPULSION_BY_TYPE.electron;
    this.addParticle(
      { type: 'electron', colour: 'white', parity: -parity as 1 | -1 },
      at.x + dir.x * inset('electron'), at.y + dir.y * inset('electron'), { x: dir.x * speed, y: dir.y * speed }, this.tick,
    );
    this.events.push({ tick: this.tick, kind: 'bosonDecayed', boson: spec(spawned) });
  }

  /** Decide each contact once, skipping any particle an earlier pair already consumed this step. */
  private resolveTouches(steerVec: Vec): void {
    const fresh = this.touches;
    this.touches = [];
    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    const began = new Set(fresh.map(([a, b]) => key(a, b)));
    // Contacts still going on from before (the original's OnCollisionStay) matter only to a W waiting to be absorbed.
    const ongoing: [number, number][] = [];
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      const a = c.getFixtureA().getBody().getUserData();
      const b = c.getFixtureB().getBody().getUserData();
      if (typeof a === 'number' && typeof b === 'number' && c.isTouching() && !began.has(key(a, b))) ongoing.push([a, b]);
    }
    const spent = new Set<number>();
    for (const [pairs, isFresh] of [[fresh, true], [ongoing, false]] as const) {
      for (const [ia, ib] of pairs) {
        const a = this.entity(ia);
        const b = this.entity(ib);
        if (!a || !b || spent.has(ia) || spent.has(ib)) continue;
        for (const o of interactions(this.participant(a), this.participant(b), this.switches(), isFresh)) {
          const ids = o.kind === 'annihilate' ? o.ids : o.kind === 'absorb' ? [o.id, o.bosonId] : [];
          ids.forEach((i) => spent.add(i));
          this.apply(o, steerVec);
        }
      }
    }
  }

  private chargeOf(id: number): number {
    const p = this.entity(id)?.particle;
    return p ? CHARGE_BY_TYPE[p.type] * p.parity : 0;
  }

  /** Kill whatever touched a destroy wall this step. */
  private resolveDestroyed(): void {
    const ids = new Set(this.destroyed);
    this.destroyed = [];
    for (const id of ids) {
      const e = this.entity(id);
      if (!e) continue;
      this.remove(id);
      this.events.push({ tick: this.tick, kind: 'destroyed', particle: spec(e.particle), isPlayer: id === PLAYER_ID });
    }
  }

  private remove(id: number): void {
    if (id === PLAYER_ID) {
      this.playerAlive = false;
      this.player.body.setActive(false);
      return;
    }
    const i = this.spawned.findIndex((s) => s.id === id);
    this.world.destroyBody(this.spawned[i].body);
    this.spawned.splice(i, 1);
  }

  private decayDue(steerVec: Vec): void {
    for (const e of this.entities()) {
      if (!e.live || !this.entity(e.id)) continue;
      for (const o of decay(this.participant(e), e.decayTicks * FIXED_DT, this.switches())) this.apply(o, steerVec);
    }
  }

  // ── time ──────────────────────────────────────────────────────────────────

  /** Move sizes, masses and velocity changes along their tweens. Runs before the step's forces. */
  private advanceTweens(e: Entity): void {
    if (e.radius && e.mass) {
      const done = this.tick - e.radius.start >= e.radius.ticks;
      const r = tweenAt(e.radius, this.tick, easeInCubic);
      const m = tweenAt(e.mass, this.tick, easeInCubic);
      if (done) {
        e.radius = null;
        e.mass = null;
        this.shape(e, r);
      } else if (r !== this.radiusNow(e)) {
        this.shape(e, r, m);
      } else {
        e.body.setMassData({ mass: m, center: Vec2.zero(), I: 0 });
      }
    }
    if (e.dv) {
      const u = Math.min(1, (this.tick - e.dv.start) / TWEEN_TICKS);
      const now = { x: e.dv.change.x * easeOutQuint(u), y: e.dv.change.y * easeOutQuint(u) };
      const v = e.body.getLinearVelocity();
      e.body.setLinearVelocity(new Vec2(v.x + now.x - e.dv.applied.x, v.y + now.y - e.dv.applied.y));
      e.dv = u >= 1 ? null : { ...e.dv, applied: now };
    }
  }

  /** A W turns toward the nearest particle of the opposite charge, at a limited rate. */
  private turnBoson(w: Entity): void {
    const at = w.body.getPosition();
    const charge = CHARGE_BY_TYPE.W * w.particle.parity;
    let nearest: Vec | null = null;
    let best = Infinity;
    for (const e of this.entities()) {
      if (e === w || e.particle.type === 'W' || !e.live || CHARGE_BY_TYPE[e.particle.type] * e.particle.parity * charge >= 0) continue;
      const p = e.body.getPosition();
      const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
      if (d < best) {
        best = d;
        nearest = { x: p.x - at.x, y: p.y - at.y };
      }
    }
    if (nearest) w.heading = rotateToward(w.heading, nearest, ((W_TURN_DEGREES_PER_SECOND * Math.PI) / 180) * FIXED_DT);
  }

  /** Advance exactly one fixed step under the given steer vector; `buttons` are page buttons pressed since the last. */
  step(steerVec: Vec, intents: Intent[] = [], buttons: string[] = []): void {
    const due = dueSpawns(this.scenario, this.tick * FIXED_DT, this.schedule, buttons);
    this.schedule = due.state;
    for (const s of due.spawns) this.spawn(s);
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
      for (const o of change(this.participant(this.player), this.switches())) this.apply(o, steerVec);
    }
    for (const e of this.entities()) {
      e.lastVelocity = { ...e.body.getLinearVelocity() };
      this.advanceTweens(e);
    }
    const snap = this.snapshot();
    // The player is a particle like any other: it feels every force the rest do.
    const bodies = this.entities();
    const forced: ForcedParticle[] = bodies.map((e, i) => {
      const p = this.playerAlive ? (i === 0 ? { id: PLAYER_ID, ...snap.player, live: true } : snap.particles[i - 1]) : snap.particles[i];
      return { ...p, lifeTime: e.lifeTicks * FIXED_DT, immune: e.immune };
    });
    const felt = forces({ particles: forced, blackHoles: snap.blackHoles }, snap.forces);
    bodies.forEach((e, i) => {
      if (e.live) e.body.applyForceToCenter(new Vec2(felt[i].x, felt[i].y), true);
    });
    if (this.playerAlive) {
      const t = playerThrust(steerVec, this.player.body.getLinearVelocity(), PLAYER_FORCE_COEFFICIENT_BY_TYPE[this.player.particle.type]);
      this.player.body.applyForceToCenter(new Vec2(t.x, t.y), true);
    }
    this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.tick++;
    for (const e of this.entities()) {
      if (!e.live) continue;
      e.lifeTicks++;
      if (e.particle.type in DECAY_TIME_BY_TYPE) e.decayTicks++;
      if (e.particle.type === 'W') this.turnBoson(e);
    }
    this.resolveDestroyed();
    this.resolveTouches(steerVec);
    this.expireNeutrinos();
    this.decayDue(steerVec);
  }

  /** A neutrino lives until half a second after it should have hit the bounds. */
  private expireNeutrinos(): void {
    for (const e of [...this.spawned]) {
      if (e.live && isNeutrino(e.particle) && e.lifeTicks * FIXED_DT > e.neutrinoFlight + NEUTRINO_EXTRA_LIFE_SECONDS) this.remove(e.id);
    }
  }

  /** The events since the last call, oldest first. */
  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(): Snapshot {
    const p = this.player.body.getPosition();
    return {
      tick: this.tick,
      walls: { ...this.walls },
      player: { x: p.x, y: p.y, radius: this.radiusNow(this.player), ...this.player.particle, alive: this.playerAlive },
      forces: resolveSwitches(this.scenario.forces),
      blackHoles: (this.scenario.blackHoles ?? []).map((h) => ({
        ...h,
        radius: blackHoleRadius(h.mass, BLACK_HOLE_DENSITY),
      })),
      barriers: (this.scenario.barriers ?? []).map((b) => ({ ...b })),
      particles: this.spawned.map((s) => {
        const pos = s.body.getPosition();
        return { id: s.id, ...s.particle, x: pos.x, y: pos.y, radius: this.radiusNow(s), live: s.live };
      }),
    };
  }
}

const negate = (v: Vec): Vec => ({ x: -v.x, y: -v.y });
function unitOr(v: Vec, fallback: Vec): Vec {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-9 ? fallback : { x: v.x / len, y: v.y / len };
}
