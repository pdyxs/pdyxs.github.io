import { describe, it, expect } from 'vitest';
import { computeStatusVisibility } from './status-visibility';

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
});
