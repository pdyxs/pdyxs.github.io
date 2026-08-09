import { describe, it, expect } from 'vitest';
import {
  parseDifficultyLevel,
  formatDifficultyStars,
  difficultyTagValue,
  difficultyLevelFromTag,
  difficultyAriaLabel,
  MAX_DIFFICULTY,
} from './difficulty';

describe('parseDifficultyLevel', () => {
  it('reads the level out of LMD wording', () => {
    expect(parseDifficultyLevel('Level 3 (Medium)')).toBe(3);
    expect(parseDifficultyLevel('Level 2 (Easy)')).toBe(2);
    expect(parseDifficultyLevel('Level 4 (Hard)')).toBe(4);
  });

  it('accepts a bare level or a bare number', () => {
    expect(parseDifficultyLevel('Level 5')).toBe(5);
    expect(parseDifficultyLevel('level 1')).toBe(1);
    expect(parseDifficultyLevel('3')).toBe(3);
    expect(parseDifficultyLevel('  Level 3  ')).toBe(3);
  });

  it('returns undefined for anything it cannot read', () => {
    expect(parseDifficultyLevel(undefined)).toBeUndefined();
    expect(parseDifficultyLevel('')).toBeUndefined();
    expect(parseDifficultyLevel('Fiendish')).toBeUndefined();
  });

  it('returns undefined for a level off the 1-5 scale', () => {
    expect(parseDifficultyLevel('Level 6 (Impossible)')).toBeUndefined();
    expect(parseDifficultyLevel('Level 0')).toBeUndefined();
  });

  it('does not read a level out of a longer number', () => {
    expect(parseDifficultyLevel('Level 42')).toBeUndefined();
  });
});

describe('formatDifficultyStars', () => {
  it('fills the rating and empties the rest', () => {
    expect(formatDifficultyStars(3)).toBe('★★★☆☆');
    expect(formatDifficultyStars(1)).toBe('★☆☆☆☆');
    expect(formatDifficultyStars(5)).toBe('★★★★★');
  });

  it('always renders exactly MAX_DIFFICULTY stars', () => {
    for (let level = 1; level <= MAX_DIFFICULTY; level++) {
      expect([...formatDifficultyStars(level)]).toHaveLength(MAX_DIFFICULTY);
    }
  });

  it('clamps a level outside the scale rather than emitting a ragged row', () => {
    expect(formatDifficultyStars(9)).toBe('★★★★★');
    expect(formatDifficultyStars(-1)).toBe('☆☆☆☆☆');
  });
});

describe('difficulty filter values', () => {
  it('round-trips a level through its tag value', () => {
    for (let level = 1; level <= MAX_DIFFICULTY; level++) {
      expect(difficultyLevelFromTag(difficultyTagValue(level))).toBe(level);
    }
  });

  it('is a child of what:puzzles, so it drills in under Puzzles', () => {
    expect(difficultyTagValue(3)).toBe('what:puzzles/level-3');
  });

  it('reads no level out of another value', () => {
    expect(difficultyLevelFromTag('what:puzzles/timeline')).toBeUndefined();
    expect(difficultyLevelFromTag('what:puzzles')).toBeUndefined();
    expect(difficultyLevelFromTag('what:puzzles/level-9')).toBeUndefined();
  });
});

describe('difficultyAriaLabel', () => {
  it('spells the rating out for a screen reader', () => {
    expect(difficultyAriaLabel(3)).toBe('Difficulty 3 out of 5');
  });
});
