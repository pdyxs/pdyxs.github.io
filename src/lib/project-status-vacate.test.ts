// Guards issue #45: project lifecycle moved off frontmatter `status:` and onto
// `when:released` / `when:in-progress` / `when:shelved` tags. Scans real content
// files directly (not through the Astro content collection) so the assertions
// hold regardless of schema changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');
const WHEN_LIFECYCLE_TAGS = ['when:released', 'when:in-progress', 'when:shelved'];

// The cards that carried `status: past|current|future` before this migration
// (captured from the pre-migration content tree). Every one of these must now
// carry an equivalent `when:` lifecycle tag instead.
const PREVIOUSLY_STATUS_BEARING_CARDS = [
  'what/art/lino-printing',
  'what/games/digital/dot-hunt',
  'what/games/digital/cybersecurity',
  'what/art/genetic-sequences',
  'what/games/digital/where-the-heart-is',
  'what/art/the-path',
  'what/art/laser-harp',
  'what/art/qistigram',
  'what/art/the-neighbourhood',
  'what/games/analog/gotta-get-outta-this-space',
  'what/games/analog/houston-we-have-a',
  'what/games/digital/flatland-fallen-angle',
  'what/games/digital/numbeanies',
  'what/art/art-heist',
  'what/games/analog/time-fight',
  'what/games/analog/fatecardgame',
  'what/games/digital/bravehearts',
  'what/games/digital/tiny-world-the-musical-the-game',
  'what/games/digital/particulars',
  'what/games/digital/unstoppabot',
  'what/games/digital/quantum-byte',
  'what/software/budget-haver',
  'what/games/digital/virtual-farm',
  'what/games/digital/played',
];

describe('project status vacate (issue #45)', () => {
  // Note: `status:` frontmatter itself is no longer banned site-wide — issue
  // #46 repurposed it as the publish-lifecycle field (draft/published/...),
  // which legitimately appears in content frontmatter (e.g. stories, #49).
  // This guard narrows to its original intent, so it matches the old
  // past/current/future VALUES rather than the `status:` key: one of these
  // cards being marked `status: draft` is #46's meaning, not a #45 regression.
  const OLD_STATUS_VALUES = /^status:\s*(past|current|future)\b/m;

  it('no previously status-bearing project card regresses to frontmatter status:', () => {
    const withStatus = PREVIOUSLY_STATUS_BEARING_CARDS.filter(uid =>
      OLD_STATUS_VALUES.test(readFileSync(join(CONTENT_DIR, `${uid}/index.md`), 'utf-8'))
    );
    expect(withStatus).toEqual([]);
  });

  it.each(PREVIOUSLY_STATUS_BEARING_CARDS)('%s carries a when: lifecycle tag', (uid) => {
    const raw = readFileSync(join(CONTENT_DIR, `${uid}/index.md`), 'utf-8');
    const hasLifecycleTag = WHEN_LIFECYCLE_TAGS.some(tag => raw.includes(tag));
    expect(hasLifecycleTag).toBe(true);
  });
});
