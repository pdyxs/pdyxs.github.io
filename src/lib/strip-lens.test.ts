import { describe, it, expect } from 'vitest';
import { isStripLens, stripTerminal } from './strip-lens';
import { archiveLensId, ARCHIVE_LENS_ID, getLensDefinition } from './lens-registry';

describe('isStripLens', () => {
  it('is true only for display: strip', () => {
    expect(isStripLens({ display: 'strip' })).toBe(true);
    expect(isStripLens({ display: 'grid' })).toBe(false);
    expect(isStripLens({ sortKey: 'date' })).toBe(false);
    expect(isStripLens(undefined)).toBe(false);
  });
});

describe('stripTerminal', () => {
  it('states the true match count, not the rendered run', () => {
    expect(stripTerminal(154, 30, '', 'interesting')).toEqual({
      label: 'See all 154 →',
      uid: 'lens/interesting',
      params: '',
    });
  });

  it('carries the active filter params across the lens swap', () => {
    const terminal = stripTerminal(154, 30, 'filter.what=projects', 'interesting');
    expect(terminal?.params).toBe('filter.what=projects');
  });

  it('is absent when the run is the whole match', () => {
    expect(stripTerminal(5, 5, '', 'interesting')).toBeNull();
    expect(stripTerminal(0, 0, '', 'interesting')).toBeNull();
    // Never claims there is more when there isn't, even off by one.
    expect(stripTerminal(30, 30, '', 'interesting')).toBeNull();
    expect(stripTerminal(31, 30, '', 'interesting')).not.toBeNull();
  });

  it('is absent when there is no archive lens to hand off to', () => {
    expect(stripTerminal(154, 30, '', null)).toBeNull();
  });
});

describe('archiveLensId', () => {
  it('resolves to the declared archive lens, or null until it exists', () => {
    // Both branches are correct answers depending on whether #81 has landed;
    // what must never happen is a capped lens pointing at another capped one.
    const id = archiveLensId();
    if (id === null) {
      expect(getLensDefinition(ARCHIVE_LENS_ID)).toBeUndefined();
    } else {
      expect(id).toBe(ARCHIVE_LENS_ID);
      expect(getLensDefinition(id)?.config?.display).not.toBe('strip');
      expect(getLensDefinition(id)?.config?.limit).toBeUndefined();
    }
  });
});
