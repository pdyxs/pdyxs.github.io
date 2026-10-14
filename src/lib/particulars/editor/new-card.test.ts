import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { newCardFiles } from './new-card.ts';
import { validate } from '../scenario/validate';

describe('newCardFiles', () => {
  const files = newCardFiles('A "quoted": title', '2026-10-14');

  it('writes the minimal frontmatter that makes the card render the toy', () => {
    const { data, content } = matter(files.indexMd);
    expect(data).toEqual({
      title: 'A "quoted": title',
      date: new Date('2026-10-14'),
      tags: [],
      inspected: false,
      headerMedia: 'particulars',
    });
    expect(content.trim()).toBe('');
  });

  it('starts from a scenario that passes validation', () => {
    expect(validate(JSON.parse(files.indexJson)).ok).toBe(true);
  });
});
