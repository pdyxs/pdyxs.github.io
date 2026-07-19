import { describe, it, expect } from 'vitest';
import { computeStatusVisibility, resolveStatus } from './status-visibility';

const NOW = new Date('2026-07-19T00:00:00Z');

describe('computeStatusVisibility', () => {
  it('a published card is listed and reachable', () => {
    expect(computeStatusVisibility('published', undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('absent status resolves to published (listed and reachable)', () => {
    expect(computeStatusVisibility(undefined, undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('a draft card is neither listed nor reachable in a production build', () => {
    expect(computeStatusVisibility('draft', undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: false });
  });

  it('isDev bypasses the draft gate: listed and reachable on the dev/preview server', () => {
    expect(computeStatusVisibility('draft', undefined, { isDev: true, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('isDev bypass also applies to published (no-op, but exercises the same path)', () => {
    expect(computeStatusVisibility('published', undefined, { isDev: true, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('an unlisted card is reachable but not listed in a production build', () => {
    expect(computeStatusVisibility('unlisted', undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: true });
  });

  it('isDev bypass also applies to unlisted (listed and reachable on dev/preview)', () => {
    expect(computeStatusVisibility('unlisted', undefined, { isDev: true, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('an archived card is neither listed nor reachable in a production build', () => {
    expect(computeStatusVisibility('archived', undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: false });
  });

  it('isDev bypass also applies to archived (listed and reachable on dev/preview)', () => {
    expect(computeStatusVisibility('archived', undefined, { isDev: true, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('a scheduled card with a future date is neither listed nor reachable in a production build', () => {
    const future = new Date('2026-07-20T00:00:00Z');
    expect(computeStatusVisibility('scheduled', future, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: false });
  });

  it('a scheduled card whose date is in the past is listed and reachable, like published', () => {
    const past = new Date('2026-07-18T00:00:00Z');
    expect(computeStatusVisibility('scheduled', past, { isDev: false, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('boundary: a scheduled card whose date is exactly now has been reached (listed and reachable)', () => {
    const exactlyNow = new Date(NOW.getTime());
    expect(computeStatusVisibility('scheduled', exactlyNow, { isDev: false, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });

  it('boundary: a scheduled card whose date is 1ms after now has not been reached (hidden)', () => {
    const justAfter = new Date(NOW.getTime() + 1);
    expect(computeStatusVisibility('scheduled', justAfter, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: false });
  });

  it('a scheduled card with no date has nothing to gate on, so it stays hidden', () => {
    expect(computeStatusVisibility('scheduled', undefined, { isDev: false, now: NOW }))
      .toEqual({ listed: false, reachable: false });
  });

  it('isDev bypasses the scheduled gate: a future-dated scheduled card is visible on the dev/preview server', () => {
    const future = new Date('2026-07-20T00:00:00Z');
    expect(computeStatusVisibility('scheduled', future, { isDev: true, now: NOW }))
      .toEqual({ listed: true, reachable: true });
  });
});

describe('resolveStatus', () => {
  it('a card\'s own frontmatter status wins over the folder cascade', () => {
    expect(resolveStatus('draft', 'published')).toBe('draft');
  });

  it('falls back to the cascaded folder status when frontmatter declares none', () => {
    expect(resolveStatus(undefined, 'draft')).toBe('draft');
  });

  it('defaults to published when neither frontmatter nor cascade declare a status', () => {
    expect(resolveStatus(undefined, undefined)).toBe('published');
  });

  it('ignores a non-status cascade value and defaults to published', () => {
    expect(resolveStatus(undefined, 'not-a-real-status')).toBe('published');
  });
});

describe('resolveStatus', () => {
  it('prefers a recognised frontmatter status over the cascade', () => {
    expect(resolveStatus('draft', 'published')).toBe('draft');
  });

  it('falls back to the cascade status when frontmatter is absent', () => {
    expect(resolveStatus(undefined, 'draft')).toBe('draft');
  });

  it('falls back to published when neither source is a recognised status', () => {
    expect(resolveStatus(undefined, undefined)).toBe('published');
  });

  it('ignores an unrecognised frontmatter value and falls back to the cascade', () => {
    expect(resolveStatus('not-a-status', 'draft')).toBe('draft');
  });
});
