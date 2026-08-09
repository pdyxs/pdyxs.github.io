// Tests for the pure audit core (issue #72). Every assertion is against the
// DATA auditCards returns — never against rendered markup, which lives in
// AuditLensBody.astro and is deliberately not part of the contract.
import { describe, it, expect } from 'vitest';
import {
  auditCards,
  auditedCardCount,
  localImageRefs,
  normaliseLocalRef,
  remoteImageRefs,
  type AuditCard,
  type AuditFinding,
  type AuditFindingType,
} from './audit';

/** A card that triggers nothing — every finding's negative case in one object. */
function cleanCard(overrides: Partial<AuditCard> = {}): AuditCard {
  return {
    uid: 'what/writing/a-clean-card',
    title: 'A Clean Card',
    description: 'A hand-written one-line summary.',
    date: new Date('2024-03-01'),
    authoredTags: ['what/writing'],
    image: 'hero.png',
    body: 'Some ordinary prose with a [card link](card:what/games/digital/numbeanies).',
    localAssets: ['hero.png'],
    inspected: true,
    ...overrides,
  };
}

function finding(findings: AuditFinding[], type: AuditFindingType): AuditFinding {
  const match = findings.find(f => f.type === type);
  if (!match) throw new Error(`no finding group for "${type}"`);
  return match;
}

function uidsFor(cards: AuditCard[], type: AuditFindingType): string[] {
  return finding(auditCards(cards), type).cards.map(c => c.uid);
}

describe('auditCards — shape', () => {
  it('always returns every finding type, in a fixed order, even with no cards', () => {
    expect(auditCards([]).map(f => f.type)).toEqual([
      'dead-image-host',
      'unresolved-local-image',
      'legacy-markup',
      'missing-title',
      'missing-date',
      'no-description',
      'not-inspected',
      'no-authored-tags',
    ]);
  });

  it('reports zero counts for an empty pool, so "done" is observable as 0', () => {
    for (const f of auditCards([])) {
      expect(f.cardCount).toBe(0);
      expect(f.refCount).toBe(0);
      expect(f.cards).toEqual([]);
    }
  });

  it('a clean card produces no findings at all', () => {
    const findings = auditCards([cleanCard()]);
    expect(findings.filter(f => f.cardCount > 0)).toEqual([]);
    expect(auditedCardCount(findings)).toBe(0);
  });
});

describe('dead-image-host', () => {
  it('flags an alluremedia image in the body and counts every reference', () => {
    const card = cleanCard({
      uid: 'what/writing/diaries',
      body: '[![](https://edge.alluremedia.com.au/m/k/2012/02/diary-2-1.jpg)](https://edge.alluremedia.com.au/m/k/2012/02/diary-2-1.jpg)',
    });
    const group = finding(auditCards([card]), 'dead-image-host');
    expect(group.cardCount).toBe(1);
    expect(group.refCount).toBe(2);
    expect(group.cards[0].uid).toBe('what/writing/diaries');
  });

  it('flags a seethroughstudios image served through the i*.wp.com proxy', () => {
    const card = cleanCard({
      image: 'https://i2.wp.com/www.seethroughstudios.com/wp-content/uploads/2013/04/shot.png?resize=300%2C221',
    });
    expect(finding(auditCards([card]), 'dead-image-host').refCount).toBe(1);
  });

  it('counts frontmatter images alongside body references', () => {
    const card = cleanCard({
      images: ['https://i0.wp.com/www.seethroughstudios.com/u/stairs.png?w=360'],
      body: '![stairs](https://i0.wp.com/www.seethroughstudios.com/u/stairs.png)',
    });
    expect(finding(auditCards([card]), 'dead-image-host').refCount).toBe(2);
  });

  it('does not flag Medium or logic-masters images — those hosts are live', () => {
    const card = cleanCard({
      body: '![](https://cdn-images-1.medium.com/max/800/x.png) ![](https://logic-masters.de/img/y.jpg)',
    });
    expect(finding(auditCards([card]), 'dead-image-host').cardCount).toBe(0);
  });

  it('does not flag a dead-host link that is not an image', () => {
    const card = cleanCard({ body: 'See [the studio](http://www.seethroughstudios.com/games/#flatland).' });
    expect(finding(auditCards([card]), 'dead-image-host').cardCount).toBe(0);
  });

  it('does not flag a bare word that merely mentions a dead host', () => {
    const card = cleanCard({ description: 'Originally published on seethroughstudios.' });
    expect(finding(auditCards([card]), 'dead-image-host').cardCount).toBe(0);
  });
});

describe('unresolved-local-image', () => {
  it('flags a frontmatter image with no colocated file', () => {
    const card = cleanCard({ image: 'missing.png', localAssets: [] });
    const group = finding(auditCards([card]), 'unresolved-local-image');
    expect(group.cardCount).toBe(1);
    expect(group.cards[0].refs).toEqual(['missing.png']);
  });

  it('flags an extension-less frontmatter stem, which resolves to nothing', () => {
    // The Jekyll import left refs like `comic-d` for a colocated `comic-d.jpg`.
    // These render broken, and used to be filtered out of this check for not
    // "looking like an image" — precisely because they lack the extension.
    const card = cleanCard({ images: ['comic-d'], localAssets: ['hero.png', 'comic-d.jpg'] });
    const group = finding(auditCards([card]), 'unresolved-local-image');
    expect(group.cardCount).toBe(1);
    expect(group.cards[0].refs).toEqual(['comic-d']);
  });

  it('does not flag the same stem once the extension is written out', () => {
    const card = cleanCard({ images: ['comic-d.jpg'], localAssets: ['hero.png', 'comic-d.jpg'] });
    expect(finding(auditCards([card]), 'unresolved-local-image').cardCount).toBe(0);
  });

  it('resolves a "./"-prefixed body reference against the colocated assets', () => {
    const resolves = cleanCard({ body: '![](./game-jam-1.jpg)', localAssets: ['hero.png', 'game-jam-1.jpg'] });
    const broken = cleanCard({ uid: 'what/writing/b', body: '![](./gone.jpg)', localAssets: ['hero.png'] });
    expect(uidsFor([resolves, broken], 'unresolved-local-image')).toEqual(['what/writing/b']);
  });

  it('ignores remote and site-absolute references', () => {
    const card = cleanCard({
      body: '![](https://cdn-images-1.medium.com/x.png) ![](/assets/site-wide.png)',
    });
    expect(finding(auditCards([card]), 'unresolved-local-image').cardCount).toBe(0);
  });
});

describe('legacy-markup', () => {
  it('flags a Liquid tag', () => {
    const card = cleanCard({ body: 'before\n{% raw %}\ncode\n{% endraw %}\nafter' });
    const group = finding(auditCards([card]), 'legacy-markup');
    expect(group.cardCount).toBe(1);
    expect(group.refCount).toBe(2);
  });

  it('flags a Jekyll grid wrapper and a raw iframe', () => {
    const card = cleanCard({ body: '<div class="col-xs-12"><iframe src="https://youtube.com/embed/x"></iframe></div>' });
    expect(finding(auditCards([card]), 'legacy-markup').cardCount).toBe(1);
  });

  it('does not flag a hand-authored inline card: link written as HTML', () => {
    const card = cleanCard({ body: 'Projects include <a href="card:what/games/digital/particulars">Particulars</a>.' });
    expect(finding(auditCards([card]), 'legacy-markup').cardCount).toBe(0);
  });
});

describe('missing-title', () => {
  it('flags a card with no title and falls back to the uid as its label', () => {
    const card = cleanCard({ uid: 'what/posts/stories/arctic/01-map', title: '' });
    const group = finding(auditCards([card]), 'missing-title');
    expect(group.cardCount).toBe(1);
    expect(group.cards[0]).toEqual({
      uid: 'what/posts/stories/arctic/01-map',
      title: 'what/posts/stories/arctic/01-map',
      refs: [],
    });
  });

  it('flags a whitespace-only title', () => {
    expect(uidsFor([cleanCard({ title: '   ' })], 'missing-title')).toHaveLength(1);
  });
});

describe('missing-date', () => {
  it('flags a card with no date', () => {
    expect(uidsFor([cleanCard({ uid: 'where/work/3p', date: undefined })], 'missing-date'))
      .toEqual(['where/work/3p']);
  });
});

describe('no-description', () => {
  it('flags a card with neither a description nor prose to excerpt', () => {
    const card = cleanCard({ uid: 'what/gallery/shot', description: undefined, body: '![](hero.png)' });
    expect(uidsFor([card], 'no-description')).toEqual(['what/gallery/shot']);
  });

  it('does not flag a card whose body yields an excerpt via resolveDescription', () => {
    const card = cleanCard({ description: undefined, body: 'A body with real prose in it.' });
    expect(finding(auditCards([card]), 'no-description').cardCount).toBe(0);
  });

  it('does not flag a card with a hand-written description and an empty body', () => {
    const card = cleanCard({ description: 'Hand-written.', body: '' });
    expect(finding(auditCards([card]), 'no-description').cardCount).toBe(0);
  });
});

describe('no-authored-tags', () => {
  it('flags a card whose only tags are derived (none authored)', () => {
    expect(uidsFor([cleanCard({ uid: 'what/lonely', authoredTags: [] })], 'no-authored-tags'))
      .toEqual(['what/lonely']);
  });

  it('flags a card with no tags field at all', () => {
    expect(uidsFor([cleanCard({ authoredTags: undefined })], 'no-authored-tags')).toHaveLength(1);
  });
});

describe('not-inspected', () => {
  it('flags a card that has not been ticked', () => {
    expect(uidsFor([cleanCard({ uid: 'what/unread', inspected: false })], 'not-inspected'))
      .toEqual(['what/unread']);
  });

  it('flags a card with no `inspected` field at all — absent is not inspected', () => {
    expect(uidsFor([cleanCard({ inspected: undefined })], 'not-inspected')).toHaveLength(1);
  });

  it('clears once the card is ticked', () => {
    expect(uidsFor([cleanCard({ inspected: true })], 'not-inspected')).toEqual([]);
  });

  it('is independent of every other finding — a scruffy card can still be inspected', () => {
    const card: AuditCard = { uid: 'what/scruffy-but-read', inspected: true };
    const findings = auditCards([card]);
    expect(finding(findings, 'not-inspected').cardCount).toBe(0);
    expect(finding(findings, 'missing-title').cardCount).toBe(1);
  });
});

describe('multiple findings', () => {
  it('lists one card under every finding it triggers and counts it once overall', () => {
    const card: AuditCard = { uid: 'what/writing/legacy' };
    const findings = auditCards([card]);
    expect(findings.filter(f => f.cardCount > 0).map(f => f.type)).toEqual([
      'missing-title',
      'missing-date',
      'no-description',
      'not-inspected',
      'no-authored-tags',
    ]);
    expect(auditedCardCount(findings)).toBe(1);
  });

  it('preserves input order within a finding group', () => {
    const cards = ['c', 'a', 'b'].map(u => cleanCard({ uid: u, date: undefined }));
    expect(uidsFor(cards, 'missing-date')).toEqual(['c', 'a', 'b']);
  });
});

describe('ref extraction helpers', () => {
  it('remoteImageRefs keeps image URLs and drops non-image URLs', () => {
    const card = cleanCard({ body: 'a https://h/x.jpg b https://h/page c https://h/y.PNG?w=1' });
    expect(remoteImageRefs(card)).toEqual(['https://h/x.jpg', 'https://h/y.PNG?w=1']);
  });

  it('localImageRefs collects frontmatter and body references', () => {
    const card = cleanCard({ image: 'hero.png', images: ['b.jpg'], body: '![alt](./c.gif)' });
    expect(localImageRefs(card)).toEqual(['hero.png', 'b.jpg', './c.gif']);
  });

  it('normaliseLocalRef strips "./", query strings and percent-encoding', () => {
    expect(normaliseLocalRef('./a%20b.png?w=2')).toBe('a b.png');
  });
});
