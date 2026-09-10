// Cold-load read tracking (#92) — the half that is negative space.
//
// The positive half ("the mount path marks the SSR-seeded card read") is now a
// real behavioural test: see `CardStack.island.test.ts`, which mounts the
// island and reads localStorage. Issue #95 made that possible; this file used
// to carry a source-level stand-in for it, and no longer needs to.
//
// What stays here is the assertion that has no behaviour to observe: that
// `initFromUrl` marks *nothing*. The from/to entries it restores arrive
// collapsed — shown but not opened, the same state a front-page slot is in —
// so the correct outcome is an absence, and the cheapest honest guard against
// a future `markRead` creeping into that function is to look at it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'CardStack.svelte'),
  'utf8',
);

describe('cold load records read state', () => {
  it('does not mark the from/to entries restored from a short code', () => {
    const start = source.indexOf('async function initFromUrl()');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  onMount(() => {', start);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).not.toMatch(/markRead/);
  });
});
