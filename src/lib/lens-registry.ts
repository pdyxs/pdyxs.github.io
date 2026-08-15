// Lens registry: the single source of truth for which lenses exist.
//
// A lens is a first-class stack location (like a card) driven entirely by
// data — adding a lens is authoring a `content/<dimension>/<id>.lens.yaml`
// file, never a new route file. Those files are read at build time by
// scripts/generate-lens-registry.mjs, which emits the LENS_DECLARATIONS array
// this module imports below. Entries are plain data: no component reference
// lives here. The `component` field is a string key resolved against the
// lazy-import map in lens-components.ts — that map (not this file) is the only
// place a lens's actual Astro component gets imported, and only a dynamic
// import() at that. This module can be imported anywhere (manifest generation,
// the resolver, tests) without pulling in a single lens's rendering code.

import { LENS_DECLARATIONS } from '../data/lenses.generated.ts';

export type LensPresentation = 'card' | 'fullbleed';

export interface LensDefinition {
  /** Stable id, also the URL segment: /lens/<id>. */
  id: string;
  /** Which 5W dimension this lens browses under. */
  dimension: string;
  /** Human-readable label — used both for nav chips and, combined with any
   * active filters, the chrome title once the lens is active. */
  label: string;
  /** Icon *key* resolved to monochrome SVG markup by lens-icons.ts — kept a
   * plain string here so the registry stays pure data (no markup, no import). */
  icon?: string;
  /** Lookup key into the lazy component-loader map (lens-components.ts) — not an import itself. */
  component: string;
  /** Free-form per-lens config, e.g. { sortKey: 'date', sortDirection: 'desc' }. */
  config?: Record<string, unknown>;
  width?: string;
  /** Whether `filter.<dimension>` query params narrow this lens. Defaults to true. */
  acceptsFilters: boolean;
  presentation: LensPresentation;
  /** Present only on the dev/preview server: absent (or false) means the
   * lens is invisible in a production build — excluded from static-path
   * enumeration (its route 404s), the manifest, and nav chips. Defaults to
   * false so an ordinary lens is unaffected. See isLensVisible(). */
  devOnly?: boolean;
}

// Raw declaration shape (what a `.lens.yaml` file compiles to) — `acceptsFilters`
// and `presentation` default via normaliseLens() below so entries can omit them.
// Exported so the generated declarations module can type its array against it.
export type LensDeclaration = Omit<LensDefinition, 'acceptsFilters' | 'presentation'> & {
  acceptsFilters?: boolean;
  presentation?: LensPresentation;
};

function normaliseLens(decl: LensDeclaration): LensDefinition {
  return {
    ...decl,
    acceptsFilters: decl.acceptsFilters ?? true,
    presentation: decl.presentation ?? 'card',
  };
}

/**
 * The full lens registry — the single source of truth for which lenses exist.
 * Sourced from the `content/<dimension>/<id>.lens.yaml` files via the generated
 * LENS_DECLARATIONS array (see scripts/generate-lens-registry.mjs).
 */
export const LENS_REGISTRY: LensDefinition[] = LENS_DECLARATIONS.map(normaliseLens);

/**
 * The fallback browse lens: where a filter lands when it's added somewhere
 * that can't accept it (e.g. the home lens, acceptsFilters: false) — it
 * "falls through" here carrying the accumulated FilterState rather than
 * leaving the visitor stuck. Also the default member of the browse lens
 * family (concrete sort lenses under a shared grid) until more are added.
 */
export const DEFAULT_BROWSE_LENS_ID = 'newest';

/**
 * The uncapped archive lens — where a capped lens's terminal tile sends a
 * reader who wants the whole set (see strip-lens.ts).
 *
 * Named rather than derived: a capped lens can only honestly hand off to a lens
 * that shows everything, and "everything, ranked" is exactly one lens (Most*
 * Interesting, issue #81). Falling back to DEFAULT_BROWSE_LENS_ID would be a
 * lie the moment that default is itself capped — which, since it is `newest`,
 * it now is.
 */
export const ARCHIVE_LENS_ID = 'interesting';

/**
 * The archive lens's id, or null when it isn't declared yet.
 *
 * Null is a real answer, not a defect: until #81 lands there is nowhere honest
 * to send a reader past the cap, so the terminal tile is simply omitted rather
 * than pointing at another capped lens. Authoring
 * `src/content/what/interesting.lens.yaml` is the whole of the hookup.
 */
export function archiveLensId(): string | null {
  return getLensDefinition(ARCHIVE_LENS_ID) ? ARCHIVE_LENS_ID : null;
}

/** Builds a lens location uid ("lens/<id>"), matching the "collection/id" uid shape. */
export function lensUid(id: string): string {
  return `lens/${id}`;
}

/** Looks up a lens definition by id. Returns undefined for an unknown id. */
export function getLensDefinition(id: string): LensDefinition | undefined {
  return LENS_REGISTRY.find(l => l.id === id);
}

/**
 * Pure visibility decision for a `devOnly` lens: visible when `isDev` is true,
 * or when the lens isn't `devOnly` at all. Callers pass `import.meta.env.DEV`
 * as `isDev` — kept as a plain boolean parameter (not read internally) so
 * this stays testable without any Vite/Astro environment. Used to filter
 * static-path enumeration (so a devOnly lens's route 404s in production) and
 * nav-chip rendering (so it never appears as a chip outside dev).
 */
export function isLensVisible(lens: Pick<LensDefinition, 'devOnly'>, isDev: boolean): boolean {
  return isDev || !lens.devOnly;
}

/** Inverse of lensUid(): extracts the id from a "lens/<id>" uid, or null for
 * a card uid (or a missing uid) — used to find the currently active lens. */
export function lensIdFromUid(uid: string | null | undefined): string | null {
  if (!uid || !uid.startsWith('lens/')) return null;
  return uid.slice('lens/'.length);
}

/** Every non-devOnly lens uid ("lens/<id>") in the registry — used to drive
 * manifest enumeration. devOnly lenses are excluded unconditionally (not just
 * in a production run): the manifest is append-only forever (see
 * stack-manifest.ts), so a code assigned during a dev run would never be
 * removable again once a build shipped it — a devOnly lens must simply never
 * receive one. */
export function allLensUids(): string[] {
  return LENS_REGISTRY.filter(l => !l.devOnly).map(l => lensUid(l.id));
}

/**
 * Lenses filed under a given dimension (e.g. one of the 5W dimensions) — the
 * set a DimensionPanel lists above its filter listbox. Plain data lookup only;
 * never touches lens-components.ts, so the lazy-load boundary holds.
 */
export function lensesForDimension(dimension: string): LensDefinition[] {
  return LENS_REGISTRY.filter(l => l.dimension === dimension);
}

/** Fallback icon key for a lens that declares no icon — always visible when
 * active. Resolved to a generic dot glyph by lens-icons.ts. */
const DEFAULT_LENS_ICON = 'dot';

/**
 * If `activeLensId` names one of the given lenses, returns the icon to show
 * above its dimension button (falling back to a generic marker when the lens
 * declares none); otherwise undefined. Lens selection is single-select
 * globally (one active stack location), so calling this once per dimension
 * with that dimension's own lens list naturally yields at most one dimension
 * showing an icon at a time.
 */
export function activeLensIcon(lenses: LensDefinition[], activeLensId: string | null): string | undefined {
  const active = lenses.find(l => l.id === activeLensId);
  return active ? (active.icon ?? DEFAULT_LENS_ICON) : undefined;
}
