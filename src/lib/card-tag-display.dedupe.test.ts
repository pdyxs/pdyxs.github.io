import { describe, it, expect } from 'vitest';
import { computeCardTagDisplay } from './card-tag-display';

// Affiliation chips (affiliations.ts) are named after the organisation, which
// collides with the card-backed tag for that organisation's own card.
const LABELS: Record<string, string> = {
  'where:work/seethrough': 'SeeThrough Studios',
  'who:seethrough': 'SeeThrough Studios',
  'what:games/digital/particulars': 'Particulars',
  'what:writing': 'Writing',
};
const labelOf = (tag: string) => LABELS[tag] ?? tag;

describe('computeCardTagDisplay same-label deduping', () => {
  it('drops the affiliation chip when the card already names the organisation', () => {
    const { tags } = computeCardTagDisplay(
      ['what:writing', 'where:work/seethrough', 'who:seethrough'],
      {},
      Infinity,
      labelOf,
    );
    expect(tags.map(t => t.value)).toEqual(['what:writing', 'where:work/seethrough']);
  });

  it('keeps the affiliation chip when nothing else on the card says it', () => {
    const { tags } = computeCardTagDisplay(
      ['what:writing', 'what:games/digital/particulars', 'who:seethrough'],
      {},
      Infinity,
      labelOf,
    );
    expect(tags.map(t => t.value)).toEqual([
      'what:writing',
      'what:games/digital/particulars',
      'who:seethrough',
    ]);
  });

  it('counts a deduped chip out of overflow, not into it', () => {
    const { tags, overflow } = computeCardTagDisplay(
      ['what:writing', 'where:work/seethrough', 'who:seethrough'],
      {},
      2,
      labelOf,
    );
    expect(tags).toHaveLength(2);
    expect(overflow).toBe(0);
  });

  it('is a no-op without a label resolver', () => {
    const { tags } = computeCardTagDisplay(
      ['where:work/seethrough', 'who:seethrough'],
      {},
      Infinity,
    );
    expect(tags).toHaveLength(2);
  });
});
