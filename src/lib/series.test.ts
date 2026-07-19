import { describe, it, expect } from 'vitest';
import { getSeriesSiblings } from './series';
import type { StatusValue } from './status-visibility';

const NOW = new Date('2026-07-19T00:00:00Z');

type StoryEntry = { id: string; data: { series: string; order: number; status?: StatusValue; date?: Date; title?: string } };

function fakeStory(overrides: Partial<StoryEntry['data']> & { id?: string }): StoryEntry {
  const { id = 'arctic/ch-0', ...data } = overrides;
  return { id, data: { series: 'arctic', order: 0, ...data } };
}

describe('getSeriesSiblings', () => {
  it('getSeriesSiblings_first_chapter: order=0 entry → prev undefined, next is order=1, current=1', () => {
    const ch0 = fakeStory({ id: 'arctic/ch-0', order: 0 });
    const ch1 = fakeStory({ id: 'arctic/ch-1', order: 1 });
    const ch2 = fakeStory({ id: 'arctic/ch-2', order: 2 });
    const result = getSeriesSiblings(ch0, [ch0, ch1, ch2], { isDev: false, now: NOW });
    expect(result.prev).toBeUndefined();
    expect(result.next).toBe(ch1);
    expect(result.current).toBe(1);
    expect(result.total).toBe(3);
  });

  it('getSeriesSiblings_last_chapter: last entry → prev is penultimate, next undefined', () => {
    const ch0 = fakeStory({ id: 'arctic/ch-0', order: 0 });
    const ch1 = fakeStory({ id: 'arctic/ch-1', order: 1 });
    const ch2 = fakeStory({ id: 'arctic/ch-2', order: 2 });
    const result = getSeriesSiblings(ch2, [ch0, ch1, ch2], { isDev: false, now: NOW });
    expect(result.prev).toBe(ch1);
    expect(result.next).toBeUndefined();
    expect(result.current).toBe(3);
    expect(result.total).toBe(3);
  });

  it('getSeriesSiblings_mid_chapter: middle entry → both prev and next defined, current and total correct', () => {
    const ch0 = fakeStory({ id: 'arctic/ch-0', order: 0 });
    const ch1 = fakeStory({ id: 'arctic/ch-1', order: 1 });
    const ch2 = fakeStory({ id: 'arctic/ch-2', order: 2 });
    const result = getSeriesSiblings(ch1, [ch0, ch1, ch2], { isDev: false, now: NOW });
    expect(result.prev).toBe(ch0);
    expect(result.next).toBe(ch2);
    expect(result.current).toBe(2);
    expect(result.total).toBe(3);
  });

  it('getSeriesSiblings_prod_excludes_draft: status:draft with isDev=false → excluded from siblings and count', () => {
    const ch0 = fakeStory({ id: 'arctic/ch-0', order: 0 });
    const ch1 = fakeStory({ id: 'arctic/ch-1', order: 1, status: 'draft' });
    const ch2 = fakeStory({ id: 'arctic/ch-2', order: 2 });
    const result = getSeriesSiblings(ch0, [ch0, ch1, ch2], { isDev: false, now: NOW });
    expect(result.total).toBe(2);
    expect(result.next).toBe(ch2);
    expect(result.siblings.some(s => s.id === 'arctic/ch-1')).toBe(false);
  });

  it('getSeriesSiblings_dev_includes_draft: status:draft with isDev=true → included normally', () => {
    const ch0 = fakeStory({ id: 'arctic/ch-0', order: 0 });
    const ch1 = fakeStory({ id: 'arctic/ch-1', order: 1, status: 'draft' });
    const ch2 = fakeStory({ id: 'arctic/ch-2', order: 2 });
    const result = getSeriesSiblings(ch0, [ch0, ch1, ch2], { isDev: true, now: NOW });
    expect(result.total).toBe(3);
    expect(result.next).toBe(ch1);
    expect(result.siblings.some(s => s.id === 'arctic/ch-1')).toBe(true);
  });
});
