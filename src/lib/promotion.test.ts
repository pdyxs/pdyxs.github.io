import { describe, it, expect } from 'vitest';
import {
  classifyCard,
  parseNameStatus,
  ownerCardDir,
  planPromotion,
  nestedCardDirs,
  type CardPromotion,
  type DiffEntry,
} from './promotion';

const CARD = 'src/content/what/posts/a';
const CARD2 = 'src/content/what/posts/b';

function diff(...entries: [DiffEntry['status'], string][]): DiffEntry[] {
  return entries.map(([status, path]) => ({ status, path }));
}

function plan(opts: {
  diff: DiffEntry[];
  dev?: Record<string, CardPromotion>;
  main?: string[];
  promoteCode?: boolean;
}) {
  return planPromotion({
    diff: opts.diff,
    cardsOnDev: new Map(Object.entries(opts.dev ?? {})),
    cardDirsOnMain: new Set(opts.main ?? []),
    promoteCode: opts.promoteCode ?? false,
  });
}

describe('classifyCard', () => {
  it('gates on inspected, and absent counts as not inspected', () => {
    expect(classifyCard(undefined)).toBe('withheld');
    expect(classifyCard({})).toBe('withheld');
    expect(classifyCard({ inspected: false })).toBe('withheld');
    expect(classifyCard({ inspected: true })).toBe('content');
  });

  it('routes an inspected card with awaitsCode to the code trigger', () => {
    expect(classifyCard({ inspected: true, awaitsCode: true })).toBe('code');
    expect(classifyCard({ inspected: true, awaitsCode: false })).toBe('content');
  });

  // awaitsCode selects a trigger; it is not a way to publish something nobody
  // has read, so the gate is checked first.
  it('withholds an uninspected card even when it awaits code', () => {
    expect(classifyCard({ inspected: false, awaitsCode: true })).toBe('withheld');
  });
});

describe('parseNameStatus', () => {
  it('parses NUL-delimited status/path pairs', () => {
    expect(parseNameStatus('M\0a.ts\0A\0b.ts\0D\0c.ts\0')).toEqual(
      diff(['M', 'a.ts'], ['A', 'b.ts'], ['D', 'c.ts']),
    );
  });

  it('keeps a path containing a space intact', () => {
    expect(parseNameStatus('M\0src/content/a b/index.md\0')).toEqual(
      diff(['M', 'src/content/a b/index.md']),
    );
  });

  it('rejects a rename status rather than misparsing it', () => {
    expect(() => parseNameStatus('R100\0old.ts\0new.ts\0')).toThrow(/unexpected diff status/);
  });

  it('rejects truncated output', () => {
    expect(() => parseNameStatus('M\0a.ts\0D\0')).toThrow(/no path/);
  });
});

describe('ownerCardDir', () => {
  const dirs = new Set([CARD, 'src/content/what/posts/a-longer']);

  it('finds the card that owns a colocated asset', () => {
    expect(ownerCardDir(`${CARD}/image.png`, dirs)).toBe(CARD);
    expect(ownerCardDir(`${CARD}/_original/image.png`, dirs)).toBe(CARD);
    expect(ownerCardDir(`${CARD}/index.md`, dirs)).toBe(CARD);
  });

  it('returns undefined for a path no card owns', () => {
    expect(ownerCardDir('src/content/what/_config.yaml', dirs)).toBeUndefined();
    expect(ownerCardDir('src/lib/cards.ts', dirs)).toBeUndefined();
  });

  // A prefix match on the string rather than on path segments would make
  // `.../a-longer/index.md` a file of card `.../a`.
  it('matches on a segment boundary, not a string prefix', () => {
    expect(ownerCardDir('src/content/what/posts/a-longer/index.md', dirs)).toBe(
      'src/content/what/posts/a-longer',
    );
  });
});

describe('planPromotion — the content gate', () => {
  it('crosses an inspected card, index and colocated assets alike', () => {
    const p = plan({
      diff: diff(['M', `${CARD}/index.md`], ['A', `${CARD}/header.png`]),
      dev: { [CARD]: 'content' },
    });
    expect(p.checkout).toEqual([`${CARD}/header.png`, `${CARD}/index.md`]);
    expect(p.remove).toEqual([]);
  });

  it('withholds an uninspected card', () => {
    const p = plan({
      diff: diff(['M', `${CARD}/index.md`], ['A', `${CARD}/header.png`]),
      dev: { [CARD]: 'withheld' },
    });
    expect(p.checkout).toEqual([]);
  });

  // The awkward pair a checkout-only form gets wrong: a brand-new uninspected
  // card has no `main` version to restore, so withholding is simply not
  // taking it — never a delete of something that was never there.
  it('does not stage a new uninspected card at all', () => {
    const p = plan({
      diff: diff(['A', `${CARD}/index.md`]),
      dev: { [CARD]: 'withheld' },
    });
    expect(p).toMatchObject({ checkout: [], remove: [] });
  });
});

describe('planPromotion — deletions', () => {
  it('removes a card deleted on dev, ungated', () => {
    const p = plan({
      diff: diff(['D', `${CARD}/index.md`], ['D', `${CARD}/header.png`]),
      dev: {},
      main: [CARD],
    });
    expect(p.remove).toEqual([`${CARD}/header.png`, `${CARD}/index.md`]);
    expect(p.checkout).toEqual([]);
  });

  // The card still exists and is withheld; one of its images was deleted.
  // Removing it would half-apply an edit production has not accepted.
  it('does not remove an asset of a withheld card', () => {
    const p = plan({
      diff: diff(['D', `${CARD}/header.png`]),
      dev: { [CARD]: 'withheld' },
      main: [CARD],
    });
    expect(p.remove).toEqual([]);
  });
});

describe('planPromotion — code', () => {
  const codeDiff = diff(
    ['M', 'src/lib/cards.ts'],
    ['M', 'src/content/what/_config.yaml'],
    ['A', 'src/content/what/newlens.lens.yaml'],
    ['M', 'src/content/_templates/what-posts.md'],
  );

  it('leaves code and content structure alone on a content run', () => {
    expect(plan({ diff: codeDiff, promoteCode: false }).checkout).toEqual([]);
  });

  // Issue #165's hole: src/content's YAML and _templates are in neither the
  // ':!src/content' code pathspec nor the inspected-card list, so as written
  // they would never cross at all — a new lens's YAML stranded behind the code
  // that reads it, silently.
  it('crosses src/content YAML and _templates as code', () => {
    expect(plan({ diff: codeDiff, promoteCode: true }).checkout).toEqual([
      'src/content/_templates/what-posts.md',
      'src/content/what/_config.yaml',
      'src/content/what/newlens.lens.yaml',
      'src/lib/cards.ts',
    ]);
  });
});

describe('planPromotion — awaitsCode', () => {
  const d = diff(['M', `${CARD}/index.md`], ['M', `${CARD}/header.png`], ['M', `${CARD2}/index.md`]);
  const dev = { [CARD]: 'code' as CardPromotion, [CARD2]: 'content' as CardPromotion };

  it('holds an awaitsCode card back on a content run', () => {
    const p = plan({ diff: d, dev, promoteCode: false });
    expect(p.checkout).toEqual([`${CARD2}/index.md`]);
    expect(p.awaitsCodeConsumed).toEqual([]);
  });

  it('crosses it on a code run and reports the flag as consumed once', () => {
    const p = plan({ diff: d, dev, promoteCode: true });
    expect(p.checkout).toEqual([
      `${CARD}/header.png`,
      `${CARD}/index.md`,
      `${CARD2}/index.md`,
    ]);
    // Once per CARD, not once per changed file in it.
    expect(p.awaitsCodeConsumed).toEqual([CARD]);
  });
});

describe('planPromotion — nothing is inherited', () => {
  // The merge-base trap, stated as a property: the plan is a function of the
  // CURRENT flags alone, so a card withheld on one run crosses on the next the
  // moment it is ticked, with no memory of having been withheld.
  it('crosses a card the moment it is ticked, however often it was withheld', () => {
    const d = diff(['M', `${CARD}/index.md`]);
    expect(plan({ diff: d, dev: { [CARD]: 'withheld' } }).checkout).toEqual([]);
    expect(plan({ diff: d, dev: { [CARD]: 'content' } }).checkout).toEqual([
      `${CARD}/index.md`,
    ]);
  });
});

describe('planPromotion — never-promoted paths', () => {
  it('ignores Obsidian trash and config even on a code run', () => {
    const p = plan({
      diff: diff(
        ['A', 'src/content/.trash/old/index.md'],
        ['M', 'src/content/.obsidian/workspace.json'],
      ),
      promoteCode: true,
    });
    expect(p).toMatchObject({ checkout: [], remove: [] });
  });
});

describe('nestedCardDirs', () => {
  it('is empty for a flat set', () => {
    expect(nestedCardDirs([CARD, CARD2])).toEqual([]);
  });

  it('reports a card inside a card', () => {
    expect(nestedCardDirs([CARD, `${CARD}/ch-01`])).toEqual([`${CARD}/ch-01`]);
  });

  it('does not confuse a sibling sharing a name prefix', () => {
    expect(nestedCardDirs([CARD, `${CARD}-longer`])).toEqual([]);
  });
});
