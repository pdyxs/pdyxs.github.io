import { describe, it, expect, beforeEach } from 'vitest';
import {
  getViewState,
  getReadAt,
  hasBeenRead,
  compareReadAt,
  markRead,
  clearViewState,
  readToRecord,
  hasAnyViewState,
} from './card-view-state';

// Clear localStorage before each test so tests are isolated
beforeEach(() => {
  clearViewState();
});

// ---------------------------------------------------------------------------
// getViewState — default
// ---------------------------------------------------------------------------

describe('getViewState', () => {
  it('returns unseen for an unknown uid', () => {
    expect(getViewState('posts/foo', 'hash123')).toBe('unseen');
  });

  it('returns unseen when content hash does not match stored hash', () => {
    markRead('posts/foo', 'hash-v1');
    expect(getViewState('posts/foo', 'hash-v2')).toBe('unseen');
  });
});

// ---------------------------------------------------------------------------
// markRead
// ---------------------------------------------------------------------------

describe('markRead', () => {
  it('transitions state from unseen to read', () => {
    markRead('posts/baz', 'h2');
    expect(getViewState('posts/baz', 'h2')).toBe('read');
  });

  it('different uids are tracked independently', () => {
    markRead('posts/b', 'h');
    expect(getViewState('posts/b', 'h')).toBe('read');
    expect(getViewState('posts/c', 'h')).toBe('unseen');
  });

  it('records readAt, defaulting to now', () => {
    const before = new Date().toISOString();
    markRead('posts/now', 'h');
    const readAt = getReadAt('posts/now');
    expect(readAt).not.toBeNull();
    expect(readAt! >= before).toBe(true);
  });

  it('re-reading updates readAt to the later time', () => {
    markRead('posts/again', 'h', '2024-01-01T00:00:00.000Z');
    markRead('posts/again', 'h', '2024-06-01T00:00:00.000Z');
    expect(getReadAt('posts/again')).toBe('2024-06-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Split keying: unseen-ness follows the hash, readAt does not
// ---------------------------------------------------------------------------

describe('split keying (issue #83)', () => {
  it('returns unseen after the card content changes (different hash)', () => {
    markRead('posts/edited', 'original-hash');
    expect(getViewState('posts/edited', 'original-hash')).toBe('read');
    // Card content changes → new hash
    expect(getViewState('posts/edited', 'new-hash')).toBe('unseen');
  });

  it('keeps readAt across a content change — the read still happened', () => {
    markRead('posts/edited', 'original-hash', '2024-03-15T10:00:00.000Z');
    expect(getViewState('posts/edited', 'new-hash')).toBe('unseen');
    expect(getReadAt('posts/edited')).toBe('2024-03-15T10:00:00.000Z');
    expect(hasBeenRead('posts/edited')).toBe(true);
  });

  it('hasBeenRead is false for a card never opened', () => {
    expect(hasBeenRead('posts/never')).toBe(false);
    expect(getReadAt('posts/never')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Migration from pre-#83 entries
// ---------------------------------------------------------------------------

describe('legacy entries', () => {
  const write = (uid: string, value: unknown) =>
    localStorage.setItem(`pdyxs:view-state:${uid}`, JSON.stringify(value));

  it('honours a legacy read entry that has no readAt', () => {
    write('posts/legacy-read', { hash: 'h', state: 'read' });
    expect(getViewState('posts/legacy-read', 'h')).toBe('read');
    expect(hasBeenRead('posts/legacy-read')).toBe(true);
    expect(getReadAt('posts/legacy-read')).toBeNull();
  });

  it('treats a legacy displayed entry as unseen', () => {
    write('posts/legacy-displayed', { hash: 'h', state: 'displayed', displayedDate: '2024-03-15' });
    expect(getViewState('posts/legacy-displayed', 'h')).toBe('unseen');
    expect(hasBeenRead('posts/legacy-displayed')).toBe(false);
  });

  it('treats unparseable storage as unseen', () => {
    localStorage.setItem('pdyxs:view-state:posts/junk', 'not json');
    expect(getViewState('posts/junk', 'h')).toBe('unseen');
    expect(hasBeenRead('posts/junk')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compareReadAt
// ---------------------------------------------------------------------------

describe('compareReadAt', () => {
  it('orders most recent first', () => {
    const sorted = ['2024-01-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z'].sort(compareReadAt);
    expect(sorted[0]).toBe('2024-06-01T00:00:00.000Z');
  });

  it('sorts a missing timestamp last, not first', () => {
    const sorted = [null, '2024-01-01T00:00:00.000Z', null, '2024-06-01T00:00:00.000Z'].sort(compareReadAt);
    expect(sorted).toEqual(['2024-06-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', null, null]);
  });

  it('is zero for two missing timestamps', () => {
    expect(compareReadAt(null, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clearViewState
// ---------------------------------------------------------------------------

describe('clearViewState', () => {
  it('resets all tracked state', () => {
    markRead('posts/p1', 'h');
    markRead('posts/p2', 'h');
    clearViewState();
    expect(getViewState('posts/p1', 'h')).toBe('unseen');
    expect(getViewState('posts/p2', 'h')).toBe('unseen');
    expect(getReadAt('posts/p1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readToRecord — the one decision behind every markRead call site
// ---------------------------------------------------------------------------

/** The `.stack-card` fragment a card's own page renders (CardStackCard.astro). */
function cardFragment(uid: string, hash?: string): string {
  const hashAttr = hash === undefined ? '' : ` data-content-hash="${hash}"`;
  return `<div class="stack-card" data-uid="${uid}"${hashAttr}>` +
    `<div class="card-header"><span class="card-header-title"><b>A Card</b></span></div>` +
    `<div class="body-wrapper"><div class="stack-card-body">` +
    `<div class="stack-card-body-inner">body</div>` +
    `</div></div></div>`;
}

describe('readToRecord', () => {
  it('records a card location against the hash its fragment declares', () => {
    // This is the cold-load case (#92): the fragment is the one the server
    // rendered into StackNav's slot, with no navigation involved.
    expect(readToRecord('what/posts/foo', cardFragment('what/posts/foo', 'h-abc')))
      .toEqual({ uid: 'what/posts/foo', hash: 'h-abc' });
  });

  it('feeds markRead so an arrival reads back as read', () => {
    const record = readToRecord('what/posts/foo', cardFragment('what/posts/foo', 'h-abc'))!;
    markRead(record.uid, record.hash);
    expect(getViewState('what/posts/foo', 'h-abc')).toBe('read');
    expect(getReadAt('what/posts/foo')).not.toBeNull();
  });

  it('records nothing for a lens: a listing has no single card identity', () => {
    expect(readToRecord('lens/interesting', cardFragment('lens/interesting', 'h-abc'))).toBeNull();
  });

  it('records nothing for a fragment with no content hash', () => {
    // A collection view (`posts`) renders one, and has nothing to key on.
    expect(readToRecord('posts', cardFragment('posts'))).toBeNull();
  });

  it('records nothing with no uid or no cached html', () => {
    expect(readToRecord(undefined, cardFragment('what/posts/foo', 'h'))).toBeNull();
    expect(readToRecord('what/posts/foo', undefined)).toBeNull();
    expect(readToRecord(null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasAnyViewState — "is rung 3 live at all", for the transition guard (#125)
// ---------------------------------------------------------------------------

describe('hasAnyViewState', () => {
  it('is false for a first-time visitor, who pays no loading state for an inert re-rank', () => {
    expect(hasAnyViewState()).toBe(false);
  });

  it('is true once anything has been read', () => {
    markRead('what/puzzles/fog', 'hash-1');
    expect(hasAnyViewState()).toBe(true);
  });

  it('ignores unrelated localStorage keys', () => {
    localStorage.setItem('theme', 'dark');
    expect(hasAnyViewState()).toBe(false);
    localStorage.removeItem('theme');
  });
});
