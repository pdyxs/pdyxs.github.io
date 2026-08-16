import { describe, it, expect } from 'vitest';
import { withUninspectedTag, UNINSPECTED_TAG } from './uninspected-facet';

describe('withUninspectedTag', () => {
  it('adds the tag in dev when inspected is false', () => {
    expect(withUninspectedTag(['what:puzzles'], false, true)).toEqual([
      'what:puzzles',
      UNINSPECTED_TAG,
    ]);
  });

  it('adds the tag in dev when inspected is absent', () => {
    expect(withUninspectedTag(['what:puzzles'], undefined, true)).toEqual([
      'what:puzzles',
      UNINSPECTED_TAG,
    ]);
  });

  it('does not add the tag when inspected is true', () => {
    expect(withUninspectedTag(['what:puzzles'], true, true)).toEqual(['what:puzzles']);
  });

  it('never adds the tag outside dev, regardless of inspected', () => {
    expect(withUninspectedTag(['what:puzzles'], false, false)).toEqual(['what:puzzles']);
    expect(withUninspectedTag(['what:puzzles'], undefined, false)).toEqual(['what:puzzles']);
  });

  it('does not mutate the input array', () => {
    const input = ['what:puzzles'];
    withUninspectedTag(input, false, true);
    expect(input).toEqual(['what:puzzles']);
  });
});
