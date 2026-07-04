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
    acceptsFilters: false,
  },
  {
    id: 'newest',
    dimension: 'when',
    label: 'Newest',
    icon: '🕒',
    component: 'newest',
    config: { sortKey: 'date', sortDirection: 'desc' },
  },
];

/** The full lens registry — the single source of truth for which lenses exist. */
export const LENS_REGISTRY: LensDefinition[] = DECLARATIONS.map(normaliseLens);

/** Builds a lens location uid ("lens/<id>"), matching the "collection/id" uid shape. */
export function lensUid(id: string): string {
  return `lens/${id}`;
}

/** Looks up a lens definition by id. Returns undefined for an unknown id. */
export function getLensDefinition(id: string): LensDefinition | undefined {
  return LENS_REGISTRY.find(l => l.id === id);
}

/** Every lens uid ("lens/<id>") in the registry — used to drive manifest enumeration. */
export function allLensUids(): string[] {
  return LENS_REGISTRY.map(l => lensUid(l.id));
}
