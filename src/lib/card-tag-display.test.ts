import { describe, it, expect } from 'vitest';
import { computeCardTagDisplay } from './card-tag-display';
import type { FilterState } from '../dimensions';

const noFilter: FilterState = { };

describe('computeCardTagDisplay', () => {
  it('keeps all tags as normal chips when no filter is active', () => {
    const { tags, overflow } = computeCardTagDisplay(['what:projects', 'where:europe'], noFilter);
    expect(overflow).toBe(0);
    expect(tags).toEqual([
      { value: 'what:projects', active: false },
      { value: 'where:europe', active: false },
    ]);
  });

  it('hides the exact tag when a dimension has a single selection', () => {
    const filter: FilterState = { where: ['where:europe'] };
    const { tags } = computeCardTagDisplay(['where:europe', 'what:projects'], filter);
    expect(tags.map(t => t.value)).toEqual(['what:projects']);
  });

  it('keeps a more-specific descendant under a single selection (not redundant)', () => {
    const filter: FilterState = { where: ['where:europe'] };
    const { tags } = computeCardTagDisplay(['where:europe/uk'], filter);
    expect(tags).toEqual([{ value: 'where:europe/uk', active: false }]);
  });

  it('flags OR-matched tags active when a dimension has multiple selections', () => {
    const filter: FilterState = { where: ['where:europe', 'where:asia'] };
    const { tags } = computeCardTagDisplay(['where:europe/uk', 'what:projects'], filter);
    expect(tags).toContainEqual({ value: 'where:europe/uk', active: true });
    expect(tags).toContainEqual({ value: 'what:projects', active: false });
  });

  it('does not flag a non-matching tag under multiple selections', () => {
    const filter: FilterState = { where: ['where:europe', 'where:asia'] };
    const { tags } = computeCardTagDisplay(['where:africa'], filter);
    expect(tags).toEqual([{ value: 'where:africa', active: false }]);
  });

  it('applies the same rules to dimensionless tags via the tags bucket', () => {
    const single: FilterState = { '': ['science'] };
    expect(computeCardTagDisplay(['science', 'art'], single).tags.map(t => t.value)).toEqual(['art']);

    const multi: FilterState = { '': ['science', 'art'] };
    expect(computeCardTagDisplay(['science'], multi).tags).toEqual([{ value: 'science', active: true }]);
  });

  it('caps the visible tags and reports overflow', () => {
    const tags = ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6'];
    const { tags: shown, overflow } = computeCardTagDisplay(tags, noFilter, 4);
    expect(shown).toHaveLength(4);
    expect(overflow).toBe(2);
  });

  it('prioritises active chips so they survive the cap', () => {
    const filter: FilterState = { what: ['what:a', 'what:b'] };
    const cardTags = ['what:x', 'what:y', 'what:z', 'what:w', 'what:b'];
    const { tags: shown } = computeCardTagDisplay(cardTags, filter, 2);
    expect(shown[0]).toEqual({ value: 'what:b', active: true });
    expect(shown).toHaveLength(2);
  });
});
