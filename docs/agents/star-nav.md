# Star Nav

The mechanic behind `src/components/star-nav/`: a ship flies past planets,
steers with a limited turn, and slingshots round one. This doc is mechanism
only. `StarSystem.svelte` is the island; the pure logic is in `sim/`. The
island imports `sim/`, never the reverse. `snapshots/` is a frozen earlier
prototype and is never edited.

Conventions the maths shares: the viewBox is `-5 -5 10 10`; y points down on
screen; **heading is degrees clockwise from straight up** (nose at heading 0
points to -y), so the direction at heading h is `(sin h, -cos h)`. A `Pose` is
`{x, y, heading}` (`types.ts`). `Planet.positionAt(t)` (`planet.ts`) is the
Kepler position at orbit time `t`.

## Where the numbers live: `Tuning`

Every number is a field of `Tuning` in `sim/tuning.ts`, with `defaultTuning` as
the shipped values. Pure functions take a `Tuning`; none of them import
`defaultTuning`. The island holds one `tuning` (`$state.raw`) and passes it to
every call. To change the feel, change `defaultTuning`.

| to change | field |
|---|---|
| ship speed (viewBox units per second of orbit time) | `shipSpeed` |
| turning circle radius / most a plan may turn (degrees) | `turnRadius` / `turnCap` |
| planet pull: strength / softening | `massScale` (`mu = massScale * planet.mass`) / `gravitySoftening` |
| where the slingshot starts and ends (distance from the planet) | `slingshotRadius` |
| how far before the planet the encounter simulation begins; its step | `encounterStart`, `encounterStep` |
| **the stop length** | `stopRule` (see below) |
| how early the drag may put the choice point | `keepFactor` |
| drag span for the full range / widest pass / starting commitment | `dragRange`, `maxOffset`, `defaultCommit` |
| tap wobble tolerance for touch, px | `touchDeadPx` |
| the control scheme and its `approach` options | `controlScheme`, `fixedCommitment`, `curvatureDirection` |

**Stop length.** `stopRule: StopRule` is `{mode: 'none'}`,
`{mode: 'constant', length}` or `{mode: 'distance', perUnit}`. The default is
`constant`, length `0.5` (orbit-time seconds, since speed is about 2 units per
second the stop covers roughly one viewBox unit). The rule is evaluated in one
place, `stopLength(rule, distance)` in `sim/commitment.ts`, where `distance` is
the ship's distance from the planet when the stop begins. Change the default in
`defaultTuning.stopRule`; nothing else needs to know.

## Steering model (`sim/steering.ts`)

A steering plan (`Steering`) is: turn towards `side` by `turnAmount` degrees on
a circle of radius `turnRadius`, then go straight. `steerPath` draws one;
`steeringTo(pose, target, tuning)` finds the plan that ends exactly on a
target, or `null` (behind the ship, beyond `turnCap`, or inside a turning
circle). When two sides work it picks the shorter.

**Reach shape.** `reachShape(pose, tuning)` is the polygon between the
full-left and full-right plans (turn by `turnCap`, then straight, extended past
the viewBox). It is **not a cone** for two reasons:

1. The ship cannot turn on the spot: each edge starts as an arc of radius
   `turnRadius`, so the edges leave the nose tangentially and the boundary
   curves out before straightening. Targets inside a turning circle are not
   reachable, which is why a cone's apex-near points are missing.
2. When the planet's pull is on (after a slingshot), `gravityReachShape` in
   `sim/gravityReach.ts` integrates the two extreme paths *under the pull*, so
   the straight parts bend toward the planet too. `flightPlan` uses this for the
   shape from the end of the stop; `StarSystem.svelte` falls back to the plain
   `reachShape` from the ship when no plan is being dragged.

## Approach to the planet

`planApproach` (`sim/approach.ts`) finds the **earliest** arrival at a planet:
the time `t` where a steering plan of length `shipSpeed * (t - time)` ends on
`planet.positionAt(t)`. The gap (path needed minus path flown) is not monotonic,
so it scans for the first positive-to-non-positive crossing and bisects. It
returns `null` when the planet is not visitable within `maxOrbits` orbits.
The island derives `approaches` (one per planet) from the ship and the time; the
hover preview and the drag frame both use them. `routeUpTo` (`sim/route.ts`)
takes the first fraction of a route by length (reveal animation and `positionAt`
along the route).

## The slingshot (`sim/encounter.ts`, `sim/gravity.ts`)

`simulateEncounter(offset, mu, tuning)` integrates a pass in a **local frame**:
planet at the origin, ship arriving travelling +y, +x on the ship's right,
starting `encounterStart` before the planet at lateral `offset`, speed
`shipSpeed`. It uses velocity-Verlet (`advance`) under the softened
inverse-square `acceleration`. Samples (`Sample`: time, position, velocity,
heading) are bracketed by `entryIndex` / `exitIndex`, the first and last samples
within `slingshotRadius`.

- **Planet fixed in the deflection.** The planet does not move during the
  simulation; only the ship's path bends.
- **Ship carried with the planet.** `flightPlan` places each local sample in the
  world by rotating to the arrival heading and translating to
  `planet.positionAt(arrival + sample.t)`. So the ship moves with the planet
  after the deflection was computed without that motion.
- **Constant ship speed.** Speed on arrival is `shipSpeed`; gravity is
  conservative, so the speed on leaving `slingshotRadius` equals the speed on
  entering it. There is no throttle.

### Commitment

Commitment `c` is a number from 0 to 1: how far through the time spent inside
`slingshotRadius` the ship is at the **choice point**, the moment the stop
begins. `poseAtCommitment(encounter, c)` returns the sample (0 = entry,
1 = exit). A lower commitment means the choice point is earlier in the pass
(less of the slingshot has happened); higher means more of the deflection is
done before the choice.

### The stop

`afterStop(encounter, c, rule, mu, tuning)` (`sim/commitment.ts`) takes the pose
at commitment `c`, then `coast`s for `stopLength` with no steering, gravity still
acting. `AfterStop` holds `choice`, `stopLength`, `stopPath`, and `steerStart`
(where steering resumes, and where the reach shape is drawn from). The stop is
the action window of the planet.

### Lowest allowed commitment

`lowestCommitment(encounter, rule, keepFactor, mu, tuning)` is the smallest `c`
whose choice point is no further before the planet (along local +y) than
`keepFactor * stopLength`; it falls back to 1, and `keepFactor <= 0` turns the
limit off (0). **This is why the drag cannot start earlier than that point:** the
rule bounds how far out the stop may begin, so the stop is spent close to the
planet rather than out on the approach. The bound scales with the stop length, so
a longer stop (or a larger `keepFactor`) lets the floor move earlier. The plan raises any
asked commitment to this floor (`Math.max(lowest, asked)` in `flightPlan`) and
exposes it as `lowestCommit` / `lowestCommitPose`; the island draws a marker at
the latter. The drag frame's own `lowestCommit` is set to 0 at press because the
floor depends on the pass, which the drag is still choosing; `flightPlan` does
the clamping.

## The flight plan (`sim/flightPlan.ts`)

`flightPlan(input)` returns a `FlightPlan`, the **single source of truth** for
everything drawn and flown: `route`, `arrivalTime`, `encounterPath`,
`choicePose`, `stopPath`, `afterPose`, `reachShape`, `lowestCommit`,
`lowestCommitPose`, `choiceTime`, `endTime`, `valid`, and
`positionAt(t)`. It returns `null` when no approach exists.

`positionAt(t)` is the timeline: at or before `time` it is the ship where it is;
before `arrivalTime` it is along `route` (by `routeUpTo`, in proportion to time);
from arrival on it is the encounter and the stop samples, interpolated. The
island flies a plan by driving `ship` and `baseTime` along it frame by frame and
stores nothing else about the flight; `stopped` is derived from `choiceTime` and
`endTime`. Do not keep a second copy of any of this.

The input is `FlightPlanInput`: `ship`, `time`, `system`, `target`, `controls`,
`pinnedArrival`, `tuning`. `controls` is `Controls`, which is `CommitmentControls`
(`offset`, `commit`) or `ApproachControls` (`offset`, `curvature`).

## The two-axis drag (`sim/dragFrame.ts`)

A drag is a pointer movement from a planet. Its axes are fixed at press, in a
`DragFrame`: `heading` (the straight way from the ship to the intercept, built by
`approachFrame`), `boxWidth`, `deadZone`, `minOffset`, `lowestCommit`. Moving the
finger reshapes the route; it never changes the axes. `dragToControls(drag,
frame, tuning)` splits the pixel drag into:

- **across the approach (perpendicular) = the pass**: `offset`, the side the drag
  is on, scaled by `dragRange * boxWidth` to at most `maxOffset`, at least
  `minOffset` (the planet radius, `PLANET_RADIUS` in the island).
- **along the approach = commitment or curvature**, per the control scheme.

`isDrag` decides drag versus tap: moved at all, and at least `deadZone` (0 for a
mouse, `touchDeadPx` for touch). Inside the dead zone both axes read 0.

## Pinned-planet rule

In the `commitment` scheme the planet is **pinned**: the arrival time of the
zero-offset plan (`approach.arrivalTime` from `planApproach`) is captured at
press as `pinnedArrival` and fixed for the whole gesture. Every offset and
commitment then meets the planet at that same moment; the route bends to meet
the entry point of the chosen pass (`pinnedApproach` in `flightPlan.ts`), and
the arrival heading is that of the zero-offset plan. Without pinning, dragging
would move the meeting time and the planet would slide under the finger.

## The two control schemes

`tuning.controlScheme` is `'commitment' | 'approach'`. Across the approach is
always the pass; they differ on what *along* does.

| | `commitment` (production) | `approach` (dev trial) |
|---|---|---|
| along the approach sets | the commitment: `defaultCommit + along / range`, forward is more, clamped to [floor, 1] | the route's curvature, 0 to `1/turnRadius`, neutral at half; `curvatureDirection` says which way is more |
| planet | pinned at press | not pinned: arrival time and heading are re-solved from the route by `solveApproachByCurvature` (`sim/approachCurvature.ts`, using `routeWithCurvature`) |
| commitment | the drag's | fixed by `fixedCommitment` (`'lowest'` or a number) |
| plan built by | `pinnedApproach` | `curvatureApproach` |

In `approach` the arrival is the first time the curved route's length equals
`shipSpeed * (t - time)`, found as in `planApproach`; the entry point and the
arrival heading depend on each other, so `routeToEntry` iterates them to a fixed
point.

**Switching.** Production is always `commitment`: `defaultTuning.controlScheme`
is `'commitment'` and nothing in production reads the URL. In a dev build,
`?scheme=approach` starts in `approach` (`devSchemeFromUrl` in the island), and
a dev build shows the panel, which also edits `curvatureDirection` and
`fixedCommitment`.

## Dev tuning panel (`StarTune.svelte`)

Shown in any dev build. It owns no state: it displays the
island's `tuning` and hands back a whole replacement through `onchange`
(sliders for the numeric fields, the stop rule mode, the `approach` options,
and a reset to `defaultTuning`). It is **compiled out of production**: the
island loads it with a dynamic `import('./StarTune.svelte')` behind an inline
`import.meta.env.DEV` check, which the bundler folds to false, dropping the
import and with it the panel's markup and styles. Keep the gate inline; wrapping
it in a helper defeats the folding. Slider ranges live in `SLIDERS`.

## Known simplifications

- **The planet's own motion is ignored in the deflection.** The encounter is
  simulated with the planet fixed, then the whole result is carried along the
  orbit. The real pull would curve differently on a moving planet.
- **Other planets' gravity is ignored.** Only the target planet pulls, and only
  during the encounter, the stop and `gravityReachShape`.
- **Circular maths against Kepler.** Steering arcs and routes are circles and
  tangents; planets move on Kepler orbits. Arrival times come from scanning and
  bisecting against `positionAt`, and the entry point is recomputed per
  candidate time, but the shapes assume constant turn rate and straight legs.
- The approach scan only finds the first arrival within `maxOrbits` (4) orbits
  and rejects a flip at the edge of the reachable region.
