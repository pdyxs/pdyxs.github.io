import { describe, expect, it } from 'vitest';
import { parseMetaItem, resolveMetaRows } from './card-meta';

describe('parseMetaItem', () => {
  it('unwraps a value that is exactly one markdown link', () => {
    expect(parseMetaItem('[Libby Heaney](http://libbyheaney.co.uk/)')).toEqual({
      text: 'Libby Heaney',
      url: 'http://libbyheaney.co.uk/',
    });
  });

  it('leaves a value that merely contains a link as literal text', () => {
    // Unwrapping would silently drop the surrounding words.
    const value = 'Made at [Qiskit Camp](https://q.example) in Zurich';
    expect(parseMetaItem(value)).toEqual({ text: value });
  });

  it('leaves plain text alone, trimmed', () => {
    expect(parseMetaItem('  Video Game  ')).toEqual({ text: 'Video Game' });
  });

  it('does not mistake bracketed prose for a link', () => {
    expect(parseMetaItem('Standalone (PC, Mac, Linux)')).toEqual({
      text: 'Standalone (PC, Mac, Linux)',
    });
  });
});

describe('resolveMetaRows', () => {
  it('returns nothing for a card with no meta at all', () => {
    expect(resolveMetaRows(undefined)).toEqual([]);
    expect(resolveMetaRows({})).toEqual([]);
  });

  it('folds the legacy shorthand fields in, ahead of authored rows', () => {
    const rows = resolveMetaRows({
      medium: 'Escape Room/Interactive Theatre',
      meta: [{ label: 'Season', values: ['May-August 2017'] }],
    });
    expect(rows).toEqual([
      { label: 'Medium', items: [{ text: 'Escape Room/Interactive Theatre' }] },
      { label: 'Season', items: [{ text: 'May-August 2017' }] },
    ]);
  });

  it('orders the work-history shorthands When, Medium, Roles', () => {
    const rows = resolveMetaRows({ roles: 'Tech Lead', when: '2019-2021', medium: 'Consulting' });
    expect(rows.map((r) => r.label)).toEqual(['When', 'Medium', 'Roles']);
  });

  it('keeps every value in a multi-value row, in order', () => {
    const rows = resolveMetaRows({
      meta: [{ label: 'Accolades', values: ['Winner, Best Narrative', 'Winner, Best Audio'] }],
    });
    expect(rows[0].items).toEqual([
      { text: 'Winner, Best Narrative' },
      { text: 'Winner, Best Audio' },
    ]);
  });

  it('parses links out of a multi-value row', () => {
    const rows = resolveMetaRows({
      meta: [
        {
          label: 'Made with',
          values: ['[Libby Heaney](http://libbyheaney.co.uk/)', 'Jessii Mai'],
        },
      ],
    });
    expect(rows[0].items).toEqual([
      { text: 'Libby Heaney', url: 'http://libbyheaney.co.uk/' },
      { text: 'Jessii Mai' },
    ]);
  });

  it('drops rows with no label or no usable value — a blank <dd> reads as a missing fact', () => {
    const rows = resolveMetaRows({
      meta: [
        { label: '', values: ['orphan'] },
        { label: 'Empty', values: ['   '] },
        { label: 'AlsoEmpty', values: [] },
        { label: 'NoValues' },
        { label: 'Kept', values: ['yes'] },
      ],
    });
    expect(rows.map((r) => r.label)).toEqual(['Kept']);
  });

  it('ignores blank shorthand fields rather than emitting an empty row', () => {
    expect(resolveMetaRows({ medium: '   ', when: '' })).toEqual([]);
  });

  it('trims surrounding whitespace on labels', () => {
    const rows = resolveMetaRows({ meta: [{ label: '  Client  ', values: ['ABC'] }] });
    expect(rows[0]).toEqual({ label: 'Client', items: [{ text: 'ABC' }] });
  });
});
