// The card-fragment layer: everything CardStack.svelte knows about *HTML*,
// and nothing it knows about the stack.
//
// A location (a card or a lens) is rendered server-side as a single
// `.stack-card` element. The stack splices those fragments into the page as
// HTML strings, so every fact the client needs about a location — its title,
// its declared width, its content hash — travels as markup rather than as a
// live object. Before issue #97 that meant five separate "read a fact out of
// an HTML string" operations in the component, each hand-rolling the same
// throwaway-div dance, plus a cache whose reactivity quirks its callers had to
// know about.
//
// This module is that unnamed module, named. It owns:
//
//   - uid ↔ URL mapping (which URL a location's fragment comes from)
//   - the fetch, behind an **injected seam** (`load`) so tests can supply a
//     fake fragment source
//   - the string cache, keyed by `LocationEntry.key` (== uid for cards)
//   - every read of a fact out of a fragment (`factsFor`)
//   - the placeholder fragment a view transition starts against, and the
//     later swap of real content into it (`seedPlaceholder` / `replaceBody`)
//
// It deliberately owns **no stack state**: it never imports the store, never
// decides what is active, and never reads or writes `--max-width`. That keeps
// the "CardStack.svelte owns all card-stack mutations" invariant intact — the
// component still makes every stack decision, it just no longer parses HTML to
// make them.
//
// Change notification: the cache is a plain `Map`, so writing to it triggers no
// Svelte reactivity — and it never did. `$state(new Map())` is not deep-proxied,
// which is why `applyMaxWidth` used to carry a comment telling one call site to
// re-invoke it by hand after the placeholder→real swap. Rather than leaking
// that back to callers, the store reports every write through the optional
// `onChange` hook, which the component subscribes to once. Rendering is
// unaffected: the template reads `get()` while re-rendering for a *store*
// change, exactly as it did before.

import { extractLocationWidth } from './location-width';

export { extractLocationWidth };

/** The facts the stack reads out of a rendered `.stack-card` fragment. */
export interface FragmentFacts {
  /** `.card-header-title` text, trimmed. Null when the fragment has none. */
  title: string | null;
  /** The location's declared `data-width`, or undefined when it declares none. */
  width: string | undefined;
}

/** The injected network seam: the fragment HTML for a uid, or null on failure. */
export type FragmentLoader = (uid: string) => Promise<string | null>;

export interface CardFragmentsOptions {
  /** Defaults to fetching `uidToFetchUrl(uid)`. Tests pass a fake source. */
  load?: FragmentLoader;
  /** Called after any write to the cache, with the key written. */
  onChange?: (key: string) => void;
}

// --- uid ↔ URL ---------------------------------------------------------

/**
 * Where a location's fragment is fetched from. Lens locations have a lean
 * fragment route; cards use their own `/card/` page. Both respond with a
 * document containing exactly one `.stack-card`.
 */
export function uidToFetchUrl(uid: string): string {
  if (uid.startsWith('lens/')) return `/fragment/lens/${uid.slice('lens/'.length)}`;
  return `/card/${uid}`;
}

/** The inverse, accepting either a fragment URL or a browsable `/lens/` one. */
export function urlToUid(url: string): string {
  if (url.startsWith('/fragment/lens/')) return `lens/${url.slice('/fragment/lens/'.length)}`;
  if (url.startsWith('/lens/')) return `lens/${url.slice('/lens/'.length)}`;
  return url.startsWith('/card/') ? url.slice('/card/'.length) : url;
}

// --- Pure fragment reads ------------------------------------------------

function parseStackCard(html: string): Element | null {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.querySelector('.stack-card');
}

/**
 * The `.stack-card` element of a fetched document, as an HTML string — what
 * the cache stores. Null when the response carried none (a 404 page, say).
 */
export function extractStackCard(html: string): string | null {
  return parseStackCard(html)?.outerHTML ?? null;
}

/**
 * The `.stack-card-body-inner` contents of a fragment. Null when it has none,
 * which is the signal not to patch anything into a live card.
 */
export function extractBodyInner(html: string): string | null {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.querySelector('.stack-card-body-inner')?.innerHTML ?? null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A fragment-shaped stand-in for a location whose real HTML has not arrived:
 * the header (so the view transition has something to morph into) and an empty
 * body (so `replaceBody` has somewhere to write). Structurally identical to a
 * real fragment as far as the stable selector contract is concerned.
 */
export function buildPlaceholderHtml(uid: string, title: string): string {
  return `<div class="stack-card" data-uid="${escapeHtml(uid)}">` +
    `<div class="card-header">` +
    `<span class="card-header-title"><b>${escapeHtml(title)}</b></span>` +
    `<button class="stack-card-close" aria-label="Close">×</button>` +
    `</div>` +
    `<div class="body-wrapper"><div class="stack-card-body"><div class="stack-card-body-inner"></div></div></div>` +
    `</div>`;
}

/** The title a link (or any element) offers for the card it points at. */
export function titleOfElement(el: Element | null | undefined): string | null {
  return el?.querySelector('.card-header-title')?.textContent?.trim() ?? null;
}

// --- The store ----------------------------------------------------------

export interface CardFragments {
  /** The cached fragment for a location key, or undefined. */
  get(key: string): string | undefined;
  has(key: string): boolean;
  /** Store a fragment we already hold (the SSR-rendered active location). */
  seed(key: string, html: string): void;
  /** Store a placeholder to render while the real fragment is in flight. */
  seedPlaceholder(uid: string, title: string): void;
  /**
   * Ensure a fragment is cached, fetching it if needed. False means the fetch
   * failed and nothing was cached — callers must not stack the location.
   */
  ensure(uid: string): Promise<boolean>;
  /**
   * Fetch a fragment *without* caching it, for a caller that needs the request
   * in flight before it decides what to do with the result (the view-transition
   * push starts one before it seeds a placeholder).
   */
  load(uid: string): Promise<string | null>;
  /**
   * Adopt a real fragment for a location currently rendered from a placeholder:
   * caches it, and writes its body into the live card so the already-mounted
   * header — and with it the running view transition — is kept.
   */
  replaceBody(uid: string, html: string, cardEl: Element | null): void;
  /** Every fact the stack reads out of a location's fragment. */
  factsFor(key: string): FragmentFacts;
}

export function createCardFragments(options: CardFragmentsOptions = {}): CardFragments {
  const cache = new Map<string, string>();
  const onChange = options.onChange;
  const loader: FragmentLoader = options.load ?? (async (uid) => {
    const res = await fetch(uidToFetchUrl(uid));
    if (!res.ok) return null;
    return extractStackCard(await res.text());
  });

  function write(key: string, html: string) {
    cache.set(key, html);
    onChange?.(key);
  }

  return {
    get: (key) => cache.get(key),
    has: (key) => cache.has(key),
    seed: write,
    seedPlaceholder: (uid, title) => write(uid, buildPlaceholderHtml(uid, title)),
    load: (uid) => loader(uid),
    async ensure(uid) {
      if (cache.has(uid)) return true;
      const html = await loader(uid);
      if (!html) return false;
      write(uid, html);
      return true;
    },
    replaceBody(uid, html, cardEl) {
      write(uid, html);
      const inner = extractBodyInner(html);
      const existing = cardEl?.querySelector('.stack-card-body-inner');
      if (inner !== null && existing) existing.innerHTML = inner;
    },
    factsFor(key) {
      const html = cache.get(key);
      if (!html) return { title: null, width: undefined };
      return {
        title: parseStackCard(html)?.querySelector('.card-header-title')?.textContent?.trim() ?? null,
        width: extractLocationWidth(html),
      };
    },
  };
}
