import { describe, it, expect } from 'vitest';
import {
  compareSortValues,
  DEFAULT_FOLDER_SORT,
  parseFolderSort,
  resolveSortValue,
} from './folder-sort';

describe('parseFolderSort', () => {
  it('parses a key and a direction', () => {
    expect(parseFolderSort('difficulty asc')).toEqual({ key: 'difficulty', direction: 'asc' });
    expect(parseFolderSort('title desc')).toEqual({ key: 'title', direction: 'desc' });
  });

  it('gives a bare key its natural direction', () => {
    // Dates read newest-first; everything else reads smallest-first.
    expect(parseFolderSort('date')).toEqual({ key: 'date', direction: 'desc' });
    expect(parseFolderSort('difficulty')).toEqual({ key: 'difficulty', direction: 'asc' });
    expect(parseFolderSort('order')).toEqual({ key: 'order', direction: 'asc' });
    expect(parseFolderSort('title')).toEqual({ key: 'title', direction: 'asc' });
  });

  it('tolerates surrounding whitespace and casing', () => {
    expect(parseFolderSort('  Difficulty   ASC ')).toEqual({ key: 'difficulty', direction: 'asc' });
  });

  it('returns undefined for anything it does not recognise', () => {
    expect(parseFolderSort('rating asc')).toBeUndefined();   // not a key
    expect(parseFolderSort('date sideways')).toBeUndefined(); // not a direction
    expect(parseFolderSort('date asc extra')).toBeUndefined();
    expect(parseFolderSort('')).toBeUndefined();
    expect(parseFolderSort(3)).toBeUndefined();
    expect(parseFolderSort(undefined)).toBeUndefined();
  });

  it('defaults to newest-first', () => {
    expect(DEFAULT_FOLDER_SORT).toEqual({ key: 'date', direction: 'desc' });
  });
});

describe('resolveSortValue', () => {
  it('reads each key off the card', () => {
    const date = new Date('2024-03-04');
    expect(resolveSortValue('date', { date })).toBe(date.getTime());
    // Reuses parseDifficultyLevel — LMD's own wording, not a fresh parse.
    expect(resolveSortValue('difficulty', { difficulty: 'Level 3 (Medium)' })).toBe(3);
    expect(resolveSortValue('order', { order: 2 })).toBe(2);
    expect(resolveSortValue('title', { title: 'Arctic' })).toBe('Arctic');
  });

  it('is undefined when the card has no value for the key', () => {
    expect(resolveSortValue('date', {})).toBeUndefined();
    expect(resolveSortValue('difficulty', {})).toBeUndefined();
    expect(resolveSortValue('order', {})).toBeUndefined();
    expect(resolveSortValue('title', { title: '' })).toBeUndefined();
  });

  it('is undefined for a difficulty string it cannot read, rather than inventing a rating', () => {
    expect(resolveSortValue('difficulty', { difficulty: 'Fiendish' })).toBeUndefined();
  });
});

describe('compareSortValues', () => {
  it('orders numbers by direction', () => {
    expect(compareSortValues(1, 3, 'asc')).toBeLessThan(0);
    expect(compareSortValues(1, 3, 'desc')).toBeGreaterThan(0);
  });

  it('orders strings by locale', () => {
    expect(compareSortValues('apple', 'banana', 'asc')).toBeLessThan(0);
    expect(compareSortValues('apple', 'banana', 'desc')).toBeGreaterThan(0);
  });

  it('sorts missing values last in BOTH directions', () => {
    expect(compareSortValues(undefined, 3, 'asc')).toBeGreaterThan(0);
    expect(compareSortValues(undefined, 3, 'desc')).toBeGreaterThan(0);
    expect(compareSortValues(3, undefined, 'asc')).toBeLessThan(0);
    expect(compareSortValues(3, undefined, 'desc')).toBeLessThan(0);
    expect(compareSortValues(undefined, undefined, 'asc')).toBe(0);
  });
});
