// Which dev-server work a changed source file implies.
//
// Most of src/content hot-reloads for free: markdown bodies go through Astro's
// glob loader, which reloads the entry and (as a side effect) drops the dev
// server's cached getStaticPaths() data, so the next request re-resolves every
// card. The YAML half of the content tree does not. `_config.yaml`,
// `<name>.tag.yaml` and `<id>.lens.yaml` are read with node's fs (or consumed
// by a `pre*` generator script), so they are in no module graph, nothing
// invalidates on a write, and the route data stays as it was at boot — which is
// why a YAML edit only showed up after a server restart.
//
// This is the pure decision half of the dev-only Vite plugin in
// scripts/dev-reload-plugin.mjs: given a changed path it says which generators
// to re-run and whether the route cache has to be dropped. The plugin does the
// spawning and the signalling and nothing else.

import { isVaultInfrastructurePath } from './content-glob.ts';

/** A `pre*` generator script this plugin knows how to re-run, keyed by npm-script-ish name. */
export type GeneratorId = 'lenses' | 'lens-icons' | 'manifest';

/** Fixed run order — the manifest enumerates lens uids, so lenses must regenerate first. */
export const GENERATOR_ORDER: GeneratorId[] = ['lenses', 'lens-icons', 'manifest'];

/** Generator id → the script that produces its output. */
export const GENERATOR_SCRIPTS: Record<GeneratorId, string> = {
  lenses: 'scripts/generate-lens-registry.mjs',
  'lens-icons': 'scripts/generate-lens-icons.mjs',
  manifest: 'scripts/generate-stack-manifest.mjs',
};

export type WatchEvent = 'add' | 'change' | 'unlink';

export type ReloadPlan = {
  /** Generators to re-run, in GENERATOR_ORDER. */
  generators: GeneratorId[];
  /**
   * Whether Astro's cached route data must be dropped afterwards.
   * Regenerating a `src/data/*` file invalidates it in the module graph, but the
   * cached getStaticPaths props — where resolveCard() runs — survive that, so
   * they have to be cleared explicitly (see the plugin).
   */
  refreshRoutes: boolean;
};

const CONTENT_PREFIX = 'src/content/';
const LENS_ICON_PREFIX = 'src/icons/lenses/';
// Hand-edited, not generated — but where-tags.ts derives where:* values from
// it, and generate-stack-manifest.mjs enumerates those values for short
// codes, so a new location needs the same manifest-then-refresh treatment as
// a `.tag.yaml` edit.
const TRAVEL_LOG_PATH = 'src/data/travel-log.ts';

function dirOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}

/**
 * The work a single watcher event implies, or null if the file is none of this
 * plugin's business (markdown *edits* included — those already hot-reload).
 *
 * `relPath` is repo-relative with forward slashes.
 */
export function planDevReload(relPath: string, event: WatchEvent): ReloadPlan | null {
  if (relPath.startsWith(LENS_ICON_PREFIX) && relPath.endsWith('.svg')) {
    return { generators: ['lens-icons'], refreshRoutes: true };
  }

  if (relPath === TRAVEL_LOG_PATH) {
    return { generators: ['manifest'], refreshRoutes: true };
  }

  if (!relPath.startsWith(CONTENT_PREFIX)) return null;

  const inContent = relPath.slice(CONTENT_PREFIX.length);
  // Vault infrastructure is judged on the *directory* only: `.obsidian/` is
  // rewritten on every pane change and `_templates/` holds Templater scaffolds,
  // but `_config.yaml` is an underscore *file* in a real content folder and is
  // the single most important thing here to react to.
  if (isVaultInfrastructurePath(dirOf(inContent))) return null;

  if (/\.lens\.ya?ml$/i.test(inContent)) {
    return { generators: ['lenses', 'manifest'], refreshRoutes: true };
  }
  if (/\.ya?ml$/i.test(inContent)) {
    // `_config.yaml` and `<name>.tag.yaml`: both feed the tag manifest (status
    // cascade, tag identities) and both are read by fs at request time.
    return { generators: ['manifest'], refreshRoutes: true };
  }
  if (/\.mdx?$/i.test(inContent) && event !== 'change') {
    // A new or deleted card needs a short code assigned (or its tags dropped)
    // in the manifest. Edits to an existing card need nothing — the glob loader
    // has them covered.
    return { generators: ['manifest'], refreshRoutes: true };
  }
  return null;
}

/** Unions a debounce window's worth of plans into one, in GENERATOR_ORDER. */
export function mergePlans(plans: ReloadPlan[]): ReloadPlan {
  const wanted = new Set(plans.flatMap(p => p.generators));
  return {
    generators: GENERATOR_ORDER.filter(g => wanted.has(g)),
    refreshRoutes: plans.some(p => p.refreshRoutes),
  };
}
