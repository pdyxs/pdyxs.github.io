import { describe, it, expect } from 'vitest';
import { placeholderTitle } from './card-title';

// `resolveCardTitle` is covered in cards.test.ts, which is where it was tested
// before #101 split it into its own leaf module.

describe('placeholderTitle', () => {
  it('never falls back to the uid (#105)', () => {
    // The bug the ticket names: a push from a link with no `.card-header-title`
    // titled the placeholder `what/games/digital/numbeanies`. A visible uid
    // reads as a bug to a visitor; an empty header reads as loading.
    expect(placeholderTitle(undefined, null)).toBe('');
    expect(placeholderTitle(undefined)).toBe('');
  });

  it('prefers the manifest over the clicked link', () => {
    // Not a tie-break for its own sake: `replaceBody` swaps only the body, so
    // whatever lands here is what the header, the spine and any pile band show
    // for the rest of the session. The manifest is the copy guaranteed to
    // agree with the fragment when it arrives.
    expect(placeholderTitle('Numbeanies', 'Numbeanies, a game')).toBe('Numbeanies');
  });

  it('takes the clicked link when the manifest knows nothing', () => {
    expect(placeholderTitle(undefined, 'Numbeanies')).toBe('Numbeanies');
  });

  it('treats an empty manifest title as no title, not as a chosen blank', () => {
    // The manifest omits untitled locations rather than storing '', but a
    // hand-built or stale entry must not beat a perfectly good clicked label.
    expect(placeholderTitle('', 'Numbeanies')).toBe('Numbeanies');
  });
});
