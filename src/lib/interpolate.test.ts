import { describe, it, expect } from 'vitest';
import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('substitutes a single placeholder', () => {
    expect(interpolate('{{difficulty}}', { difficulty: 'Hard' })).toBe('Hard');
  });

  it('substitutes with surrounding literal text', () => {
    expect(interpolate('Difficulty: {{difficulty}}', { difficulty: 'Hard' })).toBe('Difficulty: Hard');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{ difficulty }}', { difficulty: 'Hard' })).toBe('Hard');
  });

  it('returns a literal template unchanged', () => {
    expect(interpolate('static', {})).toBe('static');
  });

  it('returns undefined when a referenced field is missing', () => {
    expect(interpolate('{{puzzle_type}}', { difficulty: 'Hard' })).toBeUndefined();
  });

  it('returns undefined when a referenced field is an empty/whitespace string', () => {
    expect(interpolate('{{x}}', { x: '   ' })).toBeUndefined();
  });

  it('drops the whole part when any of several fields is missing', () => {
    expect(interpolate('{{a}} {{b}}', { a: 'x' })).toBeUndefined();
  });

  it('renders finite numbers, including zero', () => {
    expect(interpolate('{{n}}', { n: 0 })).toBe('0');
  });

  it('treats non-scalar values as missing', () => {
    expect(interpolate('{{tags}}', { tags: ['a', 'b'] })).toBeUndefined();
  });
});
