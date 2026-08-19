// Wiring guards for "a lens location's identity includes its filter set"
// (issue #100).
//
// The decisions themselves are pure and tested elsewhere — lens-key.test.ts
// (the key format and its canonical order), stack-layout.test.ts (the
// key/uid/slot split and slot allocation), stack-codec.test.ts (the URL
// round-trip, short codes and the pre-#100 link). What is left is that the two
// islands actually route through them, and mounting an island is not available
// in this project (vitest resolves Svelte to its server build — see CLAUDE.md).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cardStack = readFileSync(resolve(here, 'CardStack.svelte'), 'utf8');
const filterShell = readFileSync(resolve(here, 'LensFilterShell.svelte'), 'utf8');

describe('a differently-filtered lens link pushes rather than re-activating', () => {
  it('the already-in-stack test is on identity, not on uid', () => {
    // The bug: `entries.some(e => e.key === uid)` matched the bare lens uid, so
    // opening /lens/interesting?filter.what=puzzles while the unfiltered lens
    // sat anywhere in the stack jumped the user backwards to it.
    expect(cardStack).toMatch(/entries\.find\(e => e\.key === target\.key\)/);
    expect(cardStack).not.toMatch(/entries\.some\(e => e\.key === uid\)/);
  });

  it('the pushed entry is built from the url AND its params', () => {
    expect(cardStack).toMatch(/locationEntryFor\(urlToUid\(url\), params\)/);
  });

  it('a pushed location gets a free handle, so a second filtered view can mount', () => {
    expect(cardStack).toMatch(/withFreeSlot\(state\.entries, target\)/);
  });
});

describe('lens filters live in the key, not in the side map', () => {
  it('pushFilteredLens hands the query to pushCard instead of writing cardParams', () => {
    const start = cardStack.indexOf('function pushFilteredLens(');
    expect(start).toBeGreaterThan(-1);
    const body = cardStack.slice(start, cardStack.indexOf('\n  }\n', start));
    expect(body).toMatch(/pushCard\(path, null, .*paramsFromSearch/s);
    expect(body).not.toMatch(/cardParams\.set/);
  });

  it('a filter report re-keys the active entry rather than storing its filters', () => {
    const start = cardStack.indexOf('function onCardParam(');
    expect(start).toBeGreaterThan(-1);
    const body = cardStack.slice(start, cardStack.indexOf('\n    }\n', start));
    expect(body).toMatch(/rekeyEntry\(st, active\.slot, nextKey\)/);
    // Which params are identity is one decision, not re-derived here.
    expect(body).toMatch(/splitLocationParams\(uid, params\)/);
  });

  it('the store is still the only thing CardStack mutates the stack through', () => {
    expect(cardStack).toMatch(/stackStore\.update\(st => rekeyEntry\(/);
  });
});

describe('the DOM handle survives an identity change', () => {
  it('the each block is keyed by slot, not by identity key', () => {
    // Keying on the identity key would destroy and re-create the fragment from
    // its server markup on every filter toggle, resetting the filter panel's
    // own open/drill state.
    expect(cardStack).toMatch(/\{#each layout\.renderItems as item \(item\.kind === 'card' \? 'card-' \+ item\.slot/);
  });

  it('every fragment read in the template is by slot', () => {
    const htmlBlocks = cardStack.match(/\{@html [^}]+\}/g) ?? [];
    expect(htmlBlocks.length).toBeGreaterThan(0);
    for (const block of htmlBlocks) expect(block).toMatch(/fragments\.get\(item\.slot\)/);
  });

  it('DOM lookups go through one slot-keyed helper', () => {
    expect(cardStack).toMatch(/function elFor\(slot: string \| null\)/);
    // No hand-rolled data-uid query left to drift from it.
    const strays = cardStack.match(/document\.querySelector<HTMLElement>\(`\[data-uid=/g) ?? [];
    expect(strays.length).toBe(1); // the one inside elFor
  });
});

describe('the active location owns the filter selection', () => {
  it('CardStack mirrors the active key\'s filters into the shared store', () => {
    expect(cardStack).toMatch(/function syncLensFilters\(activeKey: string \| null\)/);
    expect(cardStack).toMatch(/filtersForKey\(activeKey\)/);
    expect(cardStack).toMatch(/syncLensFilters\(\$stackStore\.activeKey\)/);
  });

  it('LensFilterShell no longer seeds itself from the URL on mount', () => {
    // This is symptom 2: the shell mounted once, read window.location.search
    // then, and afterwards disagreed with the stack's own params for good.
    expect(filterShell).not.toMatch(/filterStateFromParams/);
    expect(filterShell).not.toMatch(/lensFilterStore\.set\(filterStateFromParams/);
  });

  it('LensFilterShell still reports its selection, and still never writes the stack URL itself', () => {
    expect(filterShell).toMatch(/new CustomEvent\('cardparam'/);
    expect(filterShell).toMatch(/detail: \{ uid: lensUid\(lens\.id\), params \}/);
    // The one history write it keeps is the acceptsFilters:false strip.
    const writes = filterShell.match(/history\.replaceState/g) ?? [];
    expect(writes.length).toBe(1);
  });
});
