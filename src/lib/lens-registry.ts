// Lens registry: the single source of truth for which lenses exist.
//
// A lens is a first-class stack location (like a card) driven entirely by
// data here — adding a lens is adding an entry to LENS_REGISTRY, never a new
// route file. Entries are plain data: no component reference lives here.
// The `component` field is a string key resolved against the lazy-import
// map in lens-components.ts — that map (not this file) is the only place a
// lens's actual Astro component gets imported, and only a dynamic import()
// at that. This module can be imported anywhere (manifest generation, the
// resolver, tests) without pulling in a single lens's rendering code.

import { FRONTPAGE_CONFIG } from '../content/frontpage.ts';

export type LensPresentation = 'card' | 'fullbleed';

export interface LensDefinition {
  /** Stable id, also the URL segment: /lens/<id>. */
  id: string;
  /** Which 5W dimension this lens browses under (or 'root' for the home lens). */
  dimension: string;
  /** Human-readable label, e.g. for nav chips. */
  label: string;
  icon?: string;
  /** Lookup key into the lazy component-loader map (lens-components.ts) — not an import itself. */
  component: string;
  /** Free-form per-lens config, e.g. { sortKey: 'date', sortDirection: 'desc' }. */
  config?: Record<string, unknown>;
  width?: string;
  /** Whether `filter.<dimension>` query params narrow this lens. Defaults to true. */
  acceptsFilters: boolean;
  presentation: LensPresentation;
}

// Raw declarations — `acceptsFilters` defaults to true unless stated, applied
// via normaliseLens() below so entries can omit it.
type LensDeclaration = Omit<LensDefinition, 'acceptsFilters' | 'presentation'> & {
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

const DECLARATIONS: LensDeclaration[] = [
  {
    id: 'home',
    dimension: 'root',
    label: 'Home',
    icon: '🏠',
    component: 'home',
    config: FRONTPAGE_CONFIG,
    acceptsFilters: false,
  },
  {
    id: 'newest',
    dimension: 'when',
    label: 'Newest',
    icon: '🕒',
    component: 'newest',
    config: { sortKey: 'date', sortDirection: 'desc' },
    // Wider than the default column — this lens browses a dense list of
    // cards and benefits from the extra breathing room on desktop. Still
    // responsive: on narrow viewports the existing active-card-col / #card-stack
    // min()-with-viewport logic shrinks it down regardless of this value.
    width: '960px',
  },
];

/** The full lens registry — the single source of truth for which lenses exist. */
export const LENS_REGISTRY: LensDefinition[] = DECLARATIONS.map(normaliseLens);

/**
 * The fallback browse lens: where a filter lands when it's added somewhere
 * that can't accept it (e.g. the home lens, acceptsFilters: false) — it
 * "falls through" here carrying the accumulated FilterState rather than
 * leaving the visitor stuck. Also the default member of the browse lens
 * family (concrete sort lenses under a shared grid) until more are added.
 */
export const DEFAULT_BROWSE_LENS_ID = 'newest';

/** Builds a lens location uid ("lens/<id>"), matching the "collection/id" uid shape. */
export function lensUid(id: string): string {
  return `lens/${id}`;
}

/** Looks up a lens definition by id. Returns undefined for an unknown id. */
export function getLensDefinition(id: string): LensDefinition | undefined {
  return LENS_REGISTRY.find(l => l.id === id);
}

/** Inverse of lensUid(): extracts the id from a "lens/<id>" uid, or null for
 * a card uid (or a missing uid) — used to find the currently active lens. */
export function lensIdFromUid(uid: string | null | undefined): string | null {
  if (!uid || !uid.startsWith('lens/')) return null;
  return uid.slice('lens/'.length);
}

/** Every lens uid ("lens/<id>") in the registry — used to drive manifest enumeration. */
export function allLensUids(): string[] {
  return LENS_REGISTRY.map(l => lensUid(l.id));
}

/**
 * Lenses filed under a given dimension (e.g. one of the 5W dimensions) — the
 * set a DimensionPanel lists above its filter listbox. Plain data lookup only;
 * never touches lens-components.ts, so the lazy-load boundary holds.
 */
export function lensesForDimension(dimension: string): LensDefinition[] {
  return LENS_REGISTRY.filter(l => l.dimension === dimension);
}

/** Fallback marker for a lens that declares no icon — always visible when active. */
const DEFAULT_LENS_ICON = '●';

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
