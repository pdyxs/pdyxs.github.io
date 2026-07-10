// Discovers which content folders opt in to collapsing to a single card in
// browse/filter/search surfaces (see collapse.ts for the pure transform, and
// LensStackCard.astro for the composition point).
//
// A folder opts in via a `collapse` key in its `_config.yaml`:
//   collapse: true              → represent the folder with its lowest-`order` card
//   collapse: 00-introduction   → represent it with that named child folder
//
// This is the thin filesystem effect; the decision logic lives in collapse.ts.
// It reuses the TreeReader abstraction from tag-registry.ts so it can be unit
// tested against a fixture tree (see makeContentTreeReader there for the real
// filesystem-backed reader).

import { load as parseYaml } from 'js-yaml';
import type { TreeReader } from './tag-registry';

/** Per-folder collapse config. `target` (a child folder slug) overrides the
 * default lowest-`order` representative when present. */
export type CollapseTarget = { target?: string };

/** Map of folder uid (e.g. "what/posts/stories/arctic") → its collapse config. */
export type CollapseConfig = Map<string, CollapseTarget>;

type ConfigFile = { collapse?: unknown };

async function walk(reader: TreeReader, dir: string, out: CollapseConfig): Promise<void> {
  const entries = await reader.listDir(dir);

  const hasConfig = entries.some(e => !e.isDirectory && e.name === '_config.yaml');
  if (hasConfig && dir) {
    const text = await reader.readFile(`${dir}/_config.yaml`);
    if (text) {
      const parsed = (parseYaml(text) as ConfigFile | null) ?? {};
      const collapse = parsed.collapse;
      if (collapse === true) {
        out.set(dir, {});
      } else if (typeof collapse === 'string' && collapse.length > 0) {
        out.set(dir, { target: collapse });
      }
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory) {
      await walk(reader, dir ? `${dir}/${entry.name}` : entry.name, out);
    }
  }
}

/**
 * Walks the content tree via `reader`, collecting every folder whose
 * `_config.yaml` sets a `collapse` key. Read from the filesystem (not
 * content-collection entries) because `_config.yaml` files aren't part of the
 * markdown-only content glob — same reason tag-registry.ts walks the tree.
 */
export async function discoverCollapseConfig(reader: TreeReader): Promise<CollapseConfig> {
  const out: CollapseConfig = new Map();
  await walk(reader, '', out);
  return out;
}
