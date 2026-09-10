import { describe, it, expect } from 'vitest';
import { crossedInWindow } from '../../../scripts/pending-publish.mjs';

const since = new Date('2026-09-09T18:00:00Z');
const now = new Date('2026-09-10T18:00:00Z');

function entry(status: string | undefined, date: string | undefined) {
  return { path: 'src/content/x/index.md', status, date: date ? new Date(date) : undefined };
}

describe('crossedInWindow', () => {
  it('reports a scheduled card whose date fell inside the window', () => {
    expect(crossedInWindow([entry('scheduled', '2026-09-10T06:00:00Z')], since, now)).toHaveLength(1);
  });

  // The failure the unconditional cron already had: `date <= now` alone stays
  // true forever, so one crossed card would rebuild the site every day for the
  // rest of time.
  it('ignores a scheduled card that crossed before the last deploy', () => {
    expect(crossedInWindow([entry('scheduled', '2026-01-01T00:00:00Z')], since, now)).toEqual([]);
  });

  it('ignores a scheduled card whose date is still ahead', () => {
    expect(crossedInWindow([entry('scheduled', '2027-01-01T00:00:00Z')], since, now)).toEqual([]);
  });

  it('ignores every other status, and a scheduled card with no date', () => {
    expect(crossedInWindow([entry('published', '2026-09-10T06:00:00Z')], since, now)).toEqual([]);
    expect(crossedInWindow([entry(undefined, '2026-09-10T06:00:00Z')], since, now)).toEqual([]);
    expect(crossedInWindow([entry('draft', '2026-09-10T06:00:00Z')], since, now)).toEqual([]);
    expect(crossedInWindow([entry('scheduled', undefined)], since, now)).toEqual([]);
  });
});
