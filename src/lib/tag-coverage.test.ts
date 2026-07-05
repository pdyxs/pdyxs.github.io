// Guards the migration's core acceptance criterion (issue #35, DEC-004): every
// filter value actually used on content is either declared (a container
// `_config.yaml` identity or a `<name>.tag.yaml`) or card-backed (it's a real
// card-folder's own path — its index.md title supplies the display name). A
// value that is neither falls back to a bare humanised segment with no real
// declaration, which is the exact defect this migration closes (e.g. the
// pre-migration who:nocv/who:noshortcv gap).
//
// Walks the filesystem directly (frontmatter via gray-matter, not
// astro:content) so this test doesn't depend on the content collection store
// being freshly built — see project note on vitest content-store staleness.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { uidFromContentPath } from './content-uid';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import { discoverTagSources, makeContentTreeReader } from './tag-registry';
import { lookupLocationForDate, injectWhereTags } from './where-tags';
import { isValidFilterValue } from './filters';
import { TRAVEL_LOG } from '../data/travel-log';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

// `what/cards/` (the who.md/what.md/... panel-entry cards) is explicitly out
// of scope for this migration (DEC-004: "already slated for retirement or
// relocation separately, so it doesn't need to fit this model"). `what/posts/`
// is excluded here too, but for a different reason — it's mid-relocation in
// an unrelated, currently-uncommitted edit outside this issue's scope; its
// `_config.yaml` identity is a follow-up once that move settles.
const OUT_OF_SCOPE_PREFIXES = ['what/cards/', 'what/posts/', 'what/projects/posts/'];

function allContentMarkdownFiles(): string[] {
  return walk(CONTENT_DIR)
    .map(f => relative(CONTENT_DIR, f).split('\\').join('/'))
    .filter(rel => /\.(md|mdx)$/i.test(rel))
    .filter(rel => !OUT_OF_SCOPE_PREFIXES.some(prefix => rel.startsWith(prefix)));
}

/** The filter value a card's own folder represents — dimension + full remaining path. */
function ownValueForUid(uid: string): string | undefined {
  const slashIdx = uid.indexOf('/');
  if (slashIdx === -1) return undefined;
  const rest = uid.slice(slashIdx + 1);
  return rest ? `${uid.slice(0, slashIdx)}:${rest}` : undefined;
}

describe('tag coverage — every used value is declared or card-backed', () => {
  it('has no value that falls back to an undeclared humanised segment', async () => {
    const files = allContentMarkdownFiles();
    const reader = makeFileReader();

    const usages = new Map<string, string[]>(); // value -> uids that use it
    const cardOwnValues = new Set<string>();

    for (const rel of files) {
      const uid = uidFromContentPath(rel);
      const raw = readFileSync(join(CONTENT_DIR, rel), 'utf-8');
      const { data } = matter(raw);

      const frontmatterTags: string[] = data.tags ?? [];
      const cascade = await resolveFolderCascade(uid, reader);
      const baseTags = mergeEffectiveTags(derivePathTags(uid), cascade.cascadeTags, frontmatterTags);

      let tags = baseTags;
      if (data.date) {
        const date = data.date instanceof Date ? data.date : new Date(data.date);
        tags = injectWhereTags(baseTags, lookupLocationForDate(date, TRAVEL_LOG));
      }

      for (const tag of tags) {
        if (!isValidFilterValue(tag)) continue;
        const uids = usages.get(tag) ?? [];
        uids.push(uid);
        usages.set(tag, uids);
      }

      const ownValue = ownValueForUid(uid);
      if (ownValue) cardOwnValues.add(ownValue);
    }

    const { containerIdentities, tagDeclarations } = await discoverTagSources(makeContentTreeReader());
    const declaredValues = new Set([...containerIdentities, ...tagDeclarations].map(v => v.value));

    const undeclared: string[] = [];
    for (const [value, uids] of usages) {
      if (declaredValues.has(value) || cardOwnValues.has(value)) continue;
      undeclared.push(`${value} (used on ${uids.join(', ')})`);
    }

    expect(undeclared.sort()).toEqual([]);
  });
});
