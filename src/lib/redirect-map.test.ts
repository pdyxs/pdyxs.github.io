import { describe, it, expect } from 'vitest';
import {
  slugKey,
  applyPermalink,
  enumerateOldUrls,
  resolveOldUrl,
  buildRedirectMap,
  BROWSE_LENS_FALLBACK,
  HOME_LENS_FALLBACK,
  type OldUrl,
  type JekyllCollectionRule,
} from './redirect-map';
import { REDIRECTS, UNRESOLVED_OLD_URLS } from '../data/redirects.generated';

// ---------------------------------------------------------------------------
// Fixture: a miniature stand-in for the real content tree. Every case in here
// is a real shape taken from the migration (date-prefixed writing slugs,
// renumbered story items, punctuation-collapsed project slugs).
// ---------------------------------------------------------------------------

const UIDS = [
  'who/about-me',
  'what/writing/2008-07-27-why-portal',
  'what/writing/2011-07-14-playtesting-101',
  'what/posts/2020-06-09-gotta-get-outta-this-space-is',
  'what/games/analog/gotta-get-outta-this-space',
  'what/games/digital/numbeanies',
  'what/art/art-heist',
  'what/posts/stories/arctic/00-introduction',
  'what/posts/stories/arctic/02-glacier',
  'what/posts/stories/arctic/14-glacier-sound',
  'what/posts/stories/galapagos/00-introduction',
  'where/work/seethrough',
];

describe('slugKey', () => {
  it('strips a Jekyll date prefix', () => {
    expect(slugKey('2008-07-27-why-portal')).toBe('whyportal');
  });

  it('strips a story ordinal prefix in either the old or new numbering', () => {
    expect(slugKey('1-1-glacier')).toBe('glacier');
    expect(slugKey('02-glacier')).toBe('glacier');
  });

  it('collapses punctuation so run-together old slugs still match', () => {
    expect(slugKey('gottagetouttathisspace')).toBe('gottagetouttathisspace');
    expect(slugKey('gotta-get-outta-this-space')).toBe('gottagetouttathisspace');
  });

  it('does not confuse a story item with a longer sibling', () => {
    expect(slugKey('2-4-glacier-sound')).not.toBe(slugKey('1-1-glacier'));
  });
});

describe('applyPermalink', () => {
  it('substitutes :title', () => {
    expect(applyPermalink('/what/blog/:title', { collection: 'posts', path: 'x', title: 'why-portal' })).toBe(
      '/what/blog/why-portal',
    );
  });

  it('substitutes :collection and :path for the Jekyll collection default', () => {
    expect(applyPermalink('/:collection/:path', { collection: 'arctic', path: '1-1-glacier', title: 'index' })).toBe(
      '/arctic/1-1-glacier',
    );
  });

  it('never emits a trailing slash', () => {
    expect(applyPermalink('/where/:title/', { collection: 'places', path: 'arctic/arctic', title: 'arctic' })).toBe(
      '/where/arctic',
    );
  });
});

describe('enumerateOldUrls', () => {
  const rules: JekyllCollectionRule[] = [
    { collection: 'posts', permalink: '/what/blog/:title', strategy: 'slug', datedFilenames: true },
    { collection: 'pastprojects', permalink: '/what/projects/:title', strategy: 'slug' },
    { collection: 'places', permalink: '/where/:title', strategy: 'story-index' },
    { collection: 'arctic', permalink: '/:collection/:path', strategy: 'story-item' },
  ];

  const paths = [
    'collections/_posts/2008-07-27-why-portal.md',
    'collections/_pastprojects/art-heist/art-heist.md',
    'collections/_places/arctic/arctic.md',
    'collections/_arctic/1-1-glacier/index.md',
    'collections/_arctic/1-1-glacier/image.png', // non-markdown: ignored
    'collections/_services/interactive-art.md', // no rule: ignored
  ];

  it('drops the date from a post :title but keeps it for resolution', () => {
    const post = enumerateOldUrls(paths, rules).find(u => u.label === 'posts')!;
    expect(post.from).toBe('/what/blog/why-portal');
    expect(post.slug).toBe('2008-07-27-why-portal');
  });

  it('uses the file basename as :title for a collection document', () => {
    const project = enumerateOldUrls(paths, rules).find(u => u.label === 'pastprojects')!;
    expect(project.from).toBe('/what/projects/art-heist');
  });

  it('names the story from its own slug for a story-index page', () => {
    const place = enumerateOldUrls(paths, rules).find(u => u.label === 'places')!;
    expect(place.from).toBe('/where/arctic');
    expect(place.group).toBe('arctic');
  });

  it('strips the /index suffix from a story item :path', () => {
    const story = enumerateOldUrls(paths, rules).find(u => u.label === 'arctic')!;
    expect(story.from).toBe('/arctic/1-1-glacier');
    expect(story.slug).toBe('1-1-glacier');
    expect(story.group).toBe('arctic');
  });

  it('ignores non-markdown files and collections with no rule', () => {
    expect(enumerateOldUrls(paths, rules)).toHaveLength(4);
  });

  it('produces no duplicate old URLs', () => {
    const froms = enumerateOldUrls(paths, rules).map(u => u.from);
    expect(new Set(froms).size).toBe(froms.length);
  });
});

describe('resolveOldUrl', () => {
  const resolve = (old: OldUrl) => resolveOldUrl(old, UIDS);

  it('resolves a blog slug to the dated writing uid', () => {
    expect(resolve({ from: '/what/blog/why-portal', label: 'posts', strategy: 'slug', slug: 'why-portal' })).toMatchObject({
      to: '/card/what/writing/2008-07-27-why-portal',
      via: 'slug',
    });
  });

  it('resolves a run-together project slug across the punctuation change', () => {
    expect(
      resolve({
        from: '/what/projects/gottagetouttathisspace',
        label: 'pastprojects',
        strategy: 'slug',
        slug: 'gottagetouttathisspace',
      }),
    ).toMatchObject({ to: '/card/what/games/analog/gotta-get-outta-this-space', via: 'slug' });
  });

  it('resolves a renumbered story item within its own story only', () => {
    expect(
      resolve({ from: '/arctic/1-1-glacier', label: 'arctic', strategy: 'story-item', slug: '1-1-glacier', group: 'arctic' }),
    ).toMatchObject({ to: '/card/what/posts/stories/arctic/02-glacier', via: 'story-item' });
  });

  it('resolves a story index page to the first item of that story', () => {
    expect(resolve({ from: '/where/arctic', label: 'places', strategy: 'story-index', slug: 'arctic', group: 'arctic' })).toMatchObject(
      { to: '/card/what/posts/stories/arctic/00-introduction', via: 'story-index' },
    );
  });

  it('resolves an explicit static target that exists', () => {
    expect(
      resolve({ from: '/who', label: 'static', strategy: 'explicit', slug: '', target: '/card/who/about-me' }),
    ).toMatchObject({ to: '/card/who/about-me', via: 'explicit' });
  });

  it('passes an external explicit target straight through', () => {
    expect(
      resolve({ from: '/obs', label: 'static', strategy: 'explicit', slug: '', target: 'https://example.com/x' }),
    ).toMatchObject({ to: 'https://example.com/x', via: 'explicit' });
  });

  it('falls back (and reports) when an explicit card target no longer exists', () => {
    const r = resolve({
      from: '/cv',
      label: 'static',
      strategy: 'explicit',
      slug: '',
      target: '/card/who/curriculum-vitae',
      fallback: HOME_LENS_FALLBACK,
    });
    expect(r.via).toBe('fallback');
    expect(r.to).toBe(HOME_LENS_FALLBACK);
    expect(r.reason).toMatch(/no such card/i);
  });

  it('falls back to the browse lens when no uid matches', () => {
    const r = resolve({ from: '/what/blog/long-gone', label: 'posts', strategy: 'slug', slug: 'long-gone' });
    expect(r.via).toBe('fallback');
    expect(r.to).toBe(BROWSE_LENS_FALLBACK);
    expect(r.reason).toMatch(/no match/i);
  });

  it('falls back rather than guessing when several uids match', () => {
    const r = resolveOldUrl({ from: '/what/blog/dupe', label: 'posts', strategy: 'slug', slug: 'dupe' }, [
      'what/writing/2020-01-01-dupe',
      'what/posts/2021-01-01-dupe',
    ]);
    expect(r.via).toBe('fallback');
    expect(r.reason).toMatch(/ambiguous/i);
    expect(r.candidates).toHaveLength(2);
  });

  it('sends a vanished story item to the start of its story, and still reports it', () => {
    const r = resolve({
      from: '/arctic/9-9-cut-chapter',
      label: 'arctic',
      strategy: 'story-item',
      slug: '9-9-cut-chapter',
      group: 'arctic',
    });
    expect(r.via).toBe('fallback');
    expect(r.to).toBe('/card/what/posts/stories/arctic/00-introduction');
    expect(r.reason).toMatch(/start of the "arctic" story/);
  });

  it('falls back when a story has no items in the new tree', () => {
    const r = resolve({ from: '/where/antarctic', label: 'places', strategy: 'story-index', slug: 'antarctic', group: 'antarctic' });
    expect(r.via).toBe('fallback');
    expect(r.to).toBe(BROWSE_LENS_FALLBACK);
  });
});

describe('buildRedirectMap', () => {
  const OLD: OldUrl[] = [
    { from: '/what/blog/why-portal', label: 'posts', strategy: 'slug', slug: 'why-portal' },
    { from: '/what/blog/long-gone', label: 'posts', strategy: 'slug', slug: 'long-gone' },
    { from: '/what/projects/numbeanies', label: 'pastprojects', strategy: 'slug', slug: 'numbeanies' },
    { from: '/arctic/1-1-glacier', label: 'arctic', strategy: 'story-item', slug: '1-1-glacier', group: 'arctic' },
    { from: '/who', label: 'static', strategy: 'explicit', slug: '', target: '/card/who/about-me', fallback: HOME_LENS_FALLBACK },
  ];

  const report = buildRedirectMap(OLD, UIDS);

  it('emits one redirect per old URL — nothing is silently dropped', () => {
    expect(Object.keys(report.redirects)).toHaveLength(OLD.length);
    for (const old of OLD) expect(report.redirects[old.from]).toBeTruthy();
  });

  it('reports the unresolved entries rather than dropping them', () => {
    expect(report.unresolved.map(u => u.from)).toEqual(['/what/blog/long-gone']);
    expect(report.unresolved[0].to).toBe(BROWSE_LENS_FALLBACK);
  });

  it('still redirects an unresolved URL, so it never 404s', () => {
    expect(report.redirects['/what/blog/long-gone']).toBe(BROWSE_LENS_FALLBACK);
  });

  it('counts resolutions per label', () => {
    expect(report.stats.total).toBe(5);
    expect(report.stats.resolved).toBe(4);
    expect(report.stats.unresolved).toBe(1);
    expect(report.stats.byLabel.posts).toEqual({ total: 2, resolved: 1, unresolved: 1 });
  });

  it('sorts the redirect keys so the generated file has a stable diff', () => {
    const keys = Object.keys(report.redirects);
    expect(keys).toEqual([...keys].sort());
  });

  it('never redirects a URL to itself', () => {
    for (const [from, to] of Object.entries(report.redirects)) expect(to).not.toBe(from);
  });
});

// ---------------------------------------------------------------------------
// Regression guard over the real generated map. These are the spot-checks from
// the issue: a blog post, a project whose slug lost its punctuation, a
// renumbered story item, a story landing page, and the static pages.
// Regenerate with `node scripts/generate-redirects.mjs` if content moves.
// ---------------------------------------------------------------------------

describe('the generated redirect map', () => {
  it('resolves the spot-checked old URLs to their new cards', () => {
    expect(REDIRECTS['/what/blog/why-portal']).toBe('/card/what/writing/2008-07-27-why-portal');
    expect(REDIRECTS['/what/blog/playtesting-101']).toBe('/card/what/writing/2011-07-14-playtesting-101');
    expect(REDIRECTS['/what/projects/numbeanies']).toBe('/card/what/games/digital/numbeanies');
    expect(REDIRECTS['/what/projects/gottagetouttathisspace']).toBe(
      '/card/what/games/analog/gotta-get-outta-this-space',
    );
    expect(REDIRECTS['/what/projects/art-heist']).toBe('/card/what/art/art-heist');
    expect(REDIRECTS['/arctic/1-1-glacier']).toBe('/card/what/posts/stories/arctic/02-glacier');
    expect(REDIRECTS['/galapagos/00-introduction']).toBe('/card/what/posts/stories/galapagos/00-introduction');
    expect(REDIRECTS['/where/arctic']).toBe('/card/what/posts/stories/arctic/00-introduction');
    expect(REDIRECTS['/workhistory/seethrough']).toBe('/card/where/work/seethrough');
  });

  it('covers every old static page', () => {
    for (const page of ['/who', '/what', '/when', '/where', '/why', '/cv', '/podcast', '/obs', '/ice', '/help']) {
      expect(REDIRECTS[page], page).toBeTruthy();
    }
  });

  it('covers the whole old content inventory', () => {
    const count = (prefix: string) => Object.keys(REDIRECTS).filter(k => k.startsWith(prefix)).length;
    expect(count('/what/blog/')).toBe(52);
    expect(count('/what/projects/')).toBe(19);
    expect(count('/where/')).toBe(2);
    // The 34 "stories" of the issue's table are the arctic/galapagos/fatecardgame
    // collections, which used Jekyll's default `/:collection/:path` permalink
    // rather than a `/stories/` one.
    expect(count('/arctic/') + count('/galapagos/') + count('/fatecardgame/')).toBe(34);
  });

  it('reports every unresolved old URL, and still redirects each of them', () => {
    for (const entry of UNRESOLVED_OLD_URLS) {
      expect(entry.reason, entry.from).toBeTruthy();
      expect(REDIRECTS[entry.from], entry.from).toBe(entry.to);
    }
    // The known misses are the three cards still marked `status: draft`, which
    // have no reachable page in a production build.
    expect(UNRESOLVED_OLD_URLS.map(u => u.from).sort()).toEqual(['/arctic/0-1-map', '/cv', '/who']);
  });

  it('only ever targets a lens, a card, or an external URL', () => {
    for (const [from, to] of Object.entries(REDIRECTS)) {
      expect(
        to.startsWith('/card/') || to.startsWith('/lens/') || to === '/' || to.startsWith('https://'),
        `${from} → ${to}`,
      ).toBe(true);
      expect(to, from).not.toBe(from);
    }
  });
});
