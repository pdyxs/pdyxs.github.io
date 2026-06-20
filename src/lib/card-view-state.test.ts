import { describe, it, expect, beforeEach } from 'vitest';
import {
  getViewState,
  markDisplayed,
  markRead,
  clearViewState,
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
    markDisplayed('posts/foo', 'hash-v1');
    expect(getViewState('posts/foo', 'hash-v2')).toBe('unseen');
  });
});

// ---------------------------------------------------------------------------
// markDisplayed
// ---------------------------------------------------------------------------

describe('markDisplayed', () => {
  it('transitions state from unseen to displayed', () => {
    markDisplayed('posts/bar', 'h1');
    expect(getViewState('posts/bar', 'h1')).toBe('displayed');
  });

  it('does not downgrade read to displayed', () => {
    markRead('posts/bar', 'h1');
    markDisplayed('posts/bar', 'h1');
    expect(getViewState('posts/bar', 'h1')).toBe('read');
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

  it('upgrades displayed to read', () => {
    markDisplayed('posts/baz', 'h2');
    markRead('posts/baz', 'h2');
    expect(getViewState('posts/baz', 'h2')).toBe('read');
  });
});

// ---------------------------------------------------------------------------
// content hash keying — editing a card resets its state
// ---------------------------------------------------------------------------

describe('content hash keying', () => {
  it('returns unseen after the card content changes (different hash)', () => {
    markRead('posts/edited', 'original-hash');
    expect(getViewState('posts/edited', 'original-hash')).toBe('read');
    // Card content changes → new hash
    expect(getViewState('posts/edited', 'new-hash')).toBe('unseen');
  });

  it('different uids are tracked independently', () => {
    markDisplayed('posts/a', 'h');
    markRead('posts/b', 'h');
    expect(getViewState('posts/a', 'h')).toBe('displayed');
    expect(getViewState('posts/b', 'h')).toBe('read');
    expect(getViewState('posts/c', 'h')).toBe('unseen');
  });
});

// ---------------------------------------------------------------------------
// clearViewState
// ---------------------------------------------------------------------------

describe('clearViewState', () => {
  it('resets all tracked state', () => {
    markDisplayed('posts/p1', 'h');
    markRead('posts/p2', 'h');
    clearViewState();
    expect(getViewState('posts/p1', 'h')).toBe('unseen');
    expect(getViewState('posts/p2', 'h')).toBe('unseen');
  });
});
