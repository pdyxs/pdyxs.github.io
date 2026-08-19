// Wiring guards for the fragment layer (issue #97).
//
// The behaviour these describe is tested for real in src/lib/card-fragments.
// test.ts, against a fake fragment source. What is left is that CardStack.svelte
// actually routes through it — that no flow re-grows its own throwaway-div
// parse, and that the cache's non-reactivity is handled by the module rather
// than by a call site remembering to reapply the width.
//
// Asserted against the component source rather than by mounting the island,
// because mounting is not available in this project: vitest.config.ts wraps
// Astro's vite config, which resolves everything through the "ssr" environment,
// where Svelte's server build throws lifecycle_function_unavailable from
// mount(). See CLAUDE.md and CardStack.cold-load.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'CardStack.svelte'), 'utf8');

/** The body of a top-level `function`/`async function` declaration, roughly. */
function functionBody(name: string): string {
  const start = source.search(new RegExp(`\\n  (?:async )?function ${name}\\(`));
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }\n', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('CardStack holds no HTML parsing of its own', () => {
  it('never builds a throwaway div', () => {
    // The five hand-rolled parses this replaced (fetch, title, content hash,
    // width, placeholder body swap) all started here.
    expect(source).not.toMatch(/createElement\(/);
  });

  it('never assigns innerHTML or reads outerHTML', () => {
    expect(source).not.toMatch(/\.innerHTML/);
    expect(source).not.toMatch(/\.outerHTML/);
  });

  it('does not fetch fragments itself — the network seam lives in the module', () => {
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).toMatch(/createCardFragments\(/);
  });

  it('renders every card from the fragment store', () => {
    const htmlBlocks = source.match(/\{@html [^}]+\}/g) ?? [];
    expect(htmlBlocks.length).toBeGreaterThan(0);
    for (const block of htmlBlocks) {
      expect(block).toMatch(/fragments\.get\(/);
    }
  });
});

describe('the cache is no longer the caller\'s problem', () => {
  it('reapplies the active width from the store\'s onChange hook', () => {
    // Previously pushCard had to call applyMaxWidth by hand after the
    // placeholder→real swap, because a bare Map .set() triggers no reactivity.
    expect(source).toMatch(/createCardFragments\(\{[\s\S]*?onChange:[\s\S]*?applyMaxWidth\(slot\)/);
  });

  it('pushCard does not reach for applyMaxWidth', () => {
    expect(functionBody('pushCard')).not.toMatch(/applyMaxWidth/);
  });

  it('the layout effect is still the other applier', () => {
    expect(source).toMatch(/applyMaxWidth\(slotForKey\(\$stackStore, \$stackStore\.activeKey\)\)/);
  });
});

describe('every flow goes through the fragment store', () => {
  it('push ensures or loads the fragment before stacking it', () => {
    const body = functionBody('pushCard');
    expect(body).toMatch(/fragments\.has\(slot\)/);
    expect(body).toMatch(/fragments\.load\(uid\)/);
    expect(body).toMatch(/fragments\.seedPlaceholder\(/);
    expect(body).toMatch(/fragments\.replaceBody\(/);
  });

  it('the placeholder swap patches the mounted card, not the whole stack', () => {
    // Replacing the card wholesale would pull the header out from under the
    // running view transition.
    expect(functionBody('pushCard')).toMatch(/fragments\.replaceBody\(slot, html, elFor\(slot\)\)/);
  });

  it('close-to-empty ensures home before seeding it', () => {
    const body = functionBody('closeCard');
    expect(body).toMatch(/await fragments\.ensure\(HOME_UID\)/);
    // A failed ensure must fall back to a real navigation rather than seeding
    // an empty home.
    expect(body).toMatch(/if \(!ok\).*window\.location\.href = '\/'/s);
  });

  it('popstate ensures the location named by the URL', () => {
    const start = source.indexOf('async function onPopstate()');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('window.addEventListener(\'popstate\'', start));
    expect(body).toMatch(/await fragments\.ensure\(entry\.slot, entry\.uid\)/);
    expect(body).toMatch(/seedHomeActive\(false\)/);
  });

  it('re-activating a stacked location reads the cache and fetches nothing', () => {
    const body = functionBody('pushCard');
    const alreadyStacked = body.slice(0, body.indexOf('const wasHomePageMode'));
    // Identity, not uid: a differently-filtered lens link must NOT match here
    // (issue #100) — it is a different location and has to push.
    expect(alreadyStacked).toMatch(/entries\.find\(e => e\.key === target\.key\)/);
    expect(alreadyStacked).not.toMatch(/fragments\.(ensure|load)\(/);
    // The overflow panel's titles and read tracking are cache reads, keyed by
    // the DOM/cache handle rather than by identity.
    expect(source).toMatch(/fragments\.factsFor\(slot\)\.title/);
    expect(source).toMatch(/readToRecord\(slot, fragments\.get\(slot\)\)/);
  });

  it('restoring a short-coded stack ensures each location', () => {
    const start = source.indexOf('async function initFromUrl()');
    const body = source.slice(start, source.indexOf('\n  onMount(', start));
    expect(body.match(/await fragments\.ensure\(location\.slot, location\.uid\)/g)?.length).toBe(2);
  });
});
