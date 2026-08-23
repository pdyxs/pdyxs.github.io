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
    // Via StackFragment, which captures the HTML once: `{@html}` re-renders
    // when its expression changes, and the cache's value for a slot changes
    // the moment a placeholder is replaced — destroying the node (issue #109).
    expect(source).not.toMatch(/\{@html /);
    const mounts = source.match(/<StackFragment [^>]*\/>/g) ?? [];
    expect(mounts.length).toBeGreaterThan(0);
    for (const mount of mounts) expect(mount).toMatch(/html=\{fragments\.get\(/);
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
    expect(functionBody('performPush')).not.toMatch(/applyMaxWidth/);
  });

  it('the layout effect is still the other applier', () => {
    expect(source).toMatch(/applyMaxWidth\(\$stackStore\.activeSlot\)/);
  });
});

describe('every flow goes through the fragment store', () => {
  it('push ensures or loads the fragment before stacking it', () => {
    // The fetch/placeholder half of a push lives in `performPush`; `pushCard`
    // above it is now only the decision (`planPush`) and the reservation that
    // keeps two concurrent pushes off one slot (#112).
    const body = functionBody('performPush');
    expect(body).toMatch(/fragments\.has\(slot\)/);
    expect(body).toMatch(/fragments\.load\(uid\)/);
    expect(body).toMatch(/fragments\.seedPlaceholder\(/);
    expect(body).toMatch(/fragments\.replaceBody\(/);
  });

  it('the placeholder swap patches the mounted card, not the whole stack', () => {
    // Replacing the card wholesale would pull the header out from under the
    // running view transition.
    expect(functionBody('performPush')).toMatch(/fragments\.replaceBody\(slot, html, elFor\(slot\)\)/);
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
    // The whole of `pushCard` is now the re-activate/ignore/push decision plus
    // the reservation — the fetching moved down into `performPush` — so the
    // "touches no network" claim is asserted over the function entire.
    const body = functionBody('pushCard');
    // Identity, not uid: a differently-filtered lens link must NOT match here
    // (issue #100) — it is a different location and has to push. The rule is
    // `planPush`'s now, and tested as behaviour in stack-layout.test.ts.
    expect(body).toMatch(/planPush\(state, pendingPushes, target\)/);
    expect(body).not.toMatch(/fragments\.(ensure|load)\(/);
    // The declared width and read tracking are cache reads, keyed by the
    // DOM/cache handle rather than by identity. Read state itself is keyed by
    // uid, though — a suffixed handle (`lens/x#2`) must never reach it.
    expect(source).toMatch(/fragments\.factsFor\(activeSlot\)\.width/);
    expect(source).toMatch(/readToRecord\(uid, fragments\.get\(slot\)\)/);
  });

  it('restoring a short-coded stack fills placeholders through replaceBody', () => {
    // The one thing that cannot be observed as behaviour: an ASSERTION OF
    // ABSENCE. `StackFragment` reads its html prop once, so a bare `seed` here
    // would cache the real fragment while leaving the mounted card showing its
    // skeleton forever — and the test would still see the right HTML in the
    // cache. Only the source can say which call was made.
    const start = source.indexOf('async function initFromUrl()');
    const body = source.slice(start, source.indexOf('\n  onMount(', start));
    expect(body).toMatch(/fragments\.seedPlaceholder\(location\.slot/);
    expect(body).toMatch(/fragments\.replaceBody\(location\.slot, html, elFor\(location\.slot\)\)/);
    expect(body).not.toMatch(/fragments\.seed\(/);
  });
});
