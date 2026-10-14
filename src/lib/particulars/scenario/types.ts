/** Plain-data scenario, as authored in a card's index.json. World units, y down. */
export interface Scenario {
  /** The walled box, centred on the origin. */
  walls: { width: number; height: number };
  player: { x: number; y: number; radius: number };
}

export type ValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: string[] };
