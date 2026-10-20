import type { Planet } from "./planet";
import type { Star } from "./types";

export type StarSystem = {
  star: Star;
  planets: Planet[];
}
