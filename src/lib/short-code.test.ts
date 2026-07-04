import { describe, it, expect } from 'vitest';
import { encodeBase62, decodeBase62 } from './short-code';

describe('encodeBase62', () => {
  it('encodeBase62_zero: encodes 0 as "0"', () => {
    expect(encodeBase62(0)).toBe('0');
  });

  it('encodeBase62_single_digit: 61 is the last single-character code', () => {
    expect(encodeBase62(61)).toBe('Z');
  });

  it('encodeBase62_rolls_over_to_two_digits: 62 is the first two-character code', () => {
    expect(encodeBase62(62)).toBe('10');
  });

  it('encodeBase62_rejects_negative_input', () => {
    expect(() => encodeBase62(-1)).toThrow();
  });
});

describe('decodeBase62', () => {
  it('decodeBase62_round_trips_with_encodeBase62', () => {
    for (const n of [0, 1, 61, 62, 100, 3843, 3844, 999999]) {
      expect(decodeBase62(encodeBase62(n))).toBe(n);
    }
  });

  it('decodeBase62_rejects_invalid_characters', () => {
    expect(() => decodeBase62('a3~b')).toThrow();
  });
});

describe('shortest-free-code ordering', () => {
  it('codes_grow_in_length_as_index_increases: sequential indices never skip to a longer code early', () => {
    const codes = Array.from({ length: 200 }, (_, i) => encodeBase62(i));
    // Lengths must be non-decreasing across the sequence.
    for (let i = 1; i < codes.length; i++) {
      expect(codes[i].length).toBeGreaterThanOrEqual(codes[i - 1].length);
    }
  });
});
