/** The 12 built-in particle types: 6 quarks, 3 charged leptons, 3 neutrinos. */
export const PARTICLE_TYPES = [
  'up', 'down', 'strange', 'charm', 'top', 'bottom',
  'electron', 'muon', 'tau',
  'electronNeutrino', 'muonNeutrino', 'tauNeutrino',
] as const;
export type ParticleType = (typeof PARTICLE_TYPES)[number];

/** Strong-force colour. `white` is colourless. */
export const PARTICLE_COLOURS = ['white', 'red', 'green', 'blue'] as const;
export type ParticleColour = (typeof PARTICLE_COLOURS)[number];

/** +1 is matter, -1 is the antiparticle. */
export type Parity = 1 | -1;

/** A fully resolved particle: what the sim and the view both read. */
export interface ParticleSpec {
  type: ParticleType;
  colour: ParticleColour;
  parity: Parity;
}

/** As authored: colour and parity default to white / +1. */
export type ParticleDef = { type: ParticleType; colour?: ParticleColour; parity?: Parity };

/**
 * What a formation slot or wave entry points at: a formation name, a built-in
 * particle type name ("electron"), or an explicit particle (colour / parity).
 */
export type Ref = string | ParticleDef;

/** Pure shape and contents: no velocity. Angle is degrees, y down, 0 = +x. */
export type Formation =
  | { kind: 'single'; count?: number; angle?: number; contents: Ref[] }
  | { kind: 'line'; count: number; distance: number; angle?: number; contents: Ref[] }
  | { kind: 'circle'; count: number; radius: number; arc?: number; angle?: number; contents: Ref[] };

/** One absolute vector per entry: magnitude/angle (degrees) or x/y. */
export type VelocityDef = { magnitude: number; angle?: number } | { x: number; y: number };

export interface WaveEntry {
  /** Formation name, particle type name, or an explicit particle. */
  spawn: Ref;
  position?: { x: number; y: number };
  /** Degrees; rotates the whole entry about its position. */
  angle?: number;
  velocity?: VelocityDef;
  /** Seconds the particles are visible but not live. */
  telegraph?: number;
}

export interface Wave {
  id: string;
  entries: WaveEntry[];
}

/** Tagged and extensible, like Unity's effects[]: new kinds slot in here. */
export type Action = { kind: 'spawn'; wave: string };

/** Fires at `at` seconds, then every `every` seconds, `repeats` more times (omitted = forever). */
export interface TimeTrigger {
  kind: 'time';
  at: number;
  every?: number;
  repeats?: number;
  actions: Action[];
}
export type Trigger = TimeTrigger;

/** One particle to put in the world. Position and velocity are absolute. */
export interface SpawnSpec {
  particle: ParticleSpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  telegraph: number;
}

/** Plain-data scenario, as authored in a card's index.json. World units, y down. */
export interface Scenario {
  /** The walled box, centred on the origin. */
  walls: { width: number; height: number };
  player: { x: number; y: number; radius: number };
  formations?: Record<string, Formation>;
  waves?: Wave[];
  triggers?: Trigger[];
}

export type ValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: string[] };
