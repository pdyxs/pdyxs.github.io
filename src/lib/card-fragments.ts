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
//   - the string cache, keyed by `LocationEntry.slot` (== uid for cards; see
//     stack-layout.ts for why a filtered lens needs a handle distinct from
//     both its uid and its identity key)
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
 * the spine, the header (so the view transition has something to morph into)
 * and an empty body (so `replaceBody` has somewhere to write). Structurally
 * identical to a real fragment as far as the stable selector contract is
 * concerned.
 *
 * The spine is not optional, and this is the one fragment easy to build
 * without it. `replaceBody` swaps only the BODY — the shell a placeholder
 * mounts with is the shell that location keeps for the rest of the session —
 * and the spine is what occludes the card behind it once this one is collapsed
 * (issue #109). Left out, every card pushed through a view transition would be
 * a permanently transparent hole in the stack.
 */
export function buildPlaceholderHtml(slot: string, title: string): string {
  return `<div class="stack-card" data-uid="${escapeHtml(slot)}">` +
    `<div class="stack-card-spine"><div class="stack-card-spine-inner">` +
    `<span class="stack-card-spine-title">${escapeHtml(title)}</span>` +
    `</div></div>` +
    `<div class="card-header-sentinel"></div>` +
    `<div class="card-header">` +
    `<span class="card-header-title"><b>${escapeHtml(title)}</b></span>` +
    `<button class="stack-card-close" aria-label="Close">×</button>` +
    `</div>` +
    `<div class="body-wrapper"><div class="stack-card-body"><div class="stack-card-body-inner"></div></div></div>` +
    `</div>`;
}

/**
 * The fragment as it must be cached under `slot`: its root `.stack-card`
 * carries `data-uid="<slot>"`.
 *
 * A fragment is fetched by uid, but two differently-filtered views of one lens
 * are fetched from the same URL and mount side by side (issue #100). Left with
 * the server's uid, both would answer `[data-uid="lens/interesting"]` and every
 * querySelector in CardStack would find whichever came first. The cache is the
 * one place this can be enforced once. For a card, slot === uid and this is a
 * no-op.
 *
 * The island is server-rendered too, and the SSR seed is a cache write, so
 * this has to survive having no `document`: there, the fragment is the SSR
 * active location's own markup and its uid is already its slot.
 */
export function withSlotUid(html: string, slot: string): string {
  if (typeof document === 'undefined') return html;
  const card = parseStackCard(html);
  if (!card) return html;
  if (card.getAttribute('data-uid') === slot) return html;
  card.setAttribute('data-uid', slot);
  return card.outerHTML;
}

/**
 * Copies the real fragment's titles onto a card mounted from a placeholder —
 * the header's and the spine's — so the placeholder is genuinely transient.
 *
 * Needed because `replaceBody` swaps only the BODY. Everything else a
 * placeholder mounts with is what that location keeps for the session, so
 * without this the header and spine keep whatever `placeholderTitle` guessed:
 * right in the ordinary case (the manifest agrees with what lands), stale for
 * a card retitled since the last manifest generation, and merely the clicked
 * link's label wherever the manifest knew nothing. A pile band names its card
 * from the same cached markup (issue #111), so it inherits whichever it is.
 *
 * Text is copied INTO the existing nodes rather than the nodes being replaced.
 * The sticky-header observer (issue #110) captures `.card-header` by reference
 * and toggles `card-header--stuck` on it; swap that node out and the observer
 * spends the rest of the session toggling a class on a detached element, and
 * the header un-compacts mid-scroll.
 *
 * The header title is copied as HTML because it is not plain text: it renders
 * `<b>{title}</b>{titleSuffix}` (see CardHeader.astro), and the suffix is part
 * of what the card is called. The source is our own server-rendered fragment,
 * already in the cache.
 */
export function syncTitles(html: string, cardEl: Element | null | undefined): void {
  if (!cardEl || typeof document === 'undefined') return;
  const incoming = parseStackCard(html);
  if (!incoming) return;

  const from = incoming.querySelector('.card-header-title');
  const to = cardEl.querySelector('.card-header-title');
  if (from && to) to.innerHTML = from.innerHTML;

  const spineFrom = incoming.querySelector('.stack-card-spine-title');
  const spineTo = cardEl.querySelector('.stack-card-spine-title');
  if (spineFrom && spineTo) spineTo.textContent = spineFrom.textContent;
}

/** The title a link (or any element) offers for the card it points at. */
export function titleOfElement(el: Element | null | undefined): string | null {
  return el?.querySelector('.card-header-title')?.textContent?.trim() ?? null;
}

// --- The store ----------------------------------------------------------

export interface CardFragments {
  /** The cached fragment for a location slot, or undefined. */
  get(slot: string): string | undefined;
  has(slot: string): boolean;
  /** Store a fragment we already hold (the SSR-rendered active location). */
  seed(slot: string, html: string): void;
  /**
   * Adopt the server-rendered DOM for `slot` into the cache (issue #121).
   *
   * The active location no longer reaches the island as an HTML *string* — it
   * arrives as Astro slot content, i.e. as real DOM that Svelte hydration
   * adopts rather than re-creates. That is the whole point (the markup used to
   * ship twice, once as DOM and once JSON-escaped inside the island's `props`),
   * but the cache still needs the string: a location closed and later re-pushed
   * is mounted from it, and `factsFor` reads the declared width and the content
   * hash out of it.
   *
   * So the string is recovered from the DOM we were handed. This is the one
   * fragment that is read out of the page rather than fetched, and it belongs
   * here for the same reason every other read does — CardStack.svelte holds no
   * HTML handling of its own.
   *
   * Timing matters and is safe: `astro-island` defers a nested island's
   * hydration until its ancestor island fires `astro:hydrate`, so at the
   * stack's own `onMount` the nested islands inside the card still carry their
   * `ssr` attribute and their props. Snapshot later and they would be adopted
   * as inert markup.
   *
   * Returns false when there was nothing to adopt.
   */
  adopt(slot: string, cardEl: Element | null | undefined): boolean;
  /** Store a placeholder to render while the real fragment is in flight. */
  seedPlaceholder(slot: string, title: string): void;
  /**
   * Ensure a fragment is cached under `slot`, fetching `uid` if needed (they
   * differ only for a second, differently-filtered view of one lens). False
   * means the fetch failed and nothing was cached — callers must not stack
   * the location.
   */
  ensure(slot: string, uid?: string): Promise<boolean>;
  /**
   * Fetch a fragment *without* caching it, for a caller that needs the request
   * in flight before it decides what to do with the result (the view-transition
   * push starts one before it seeds a placeholder).
   */
  load(uid: string): Promise<string | null>;
  /**
   * Adopt a real fragment for a location currently rendered from a placeholder:
   * caches it, writes its body into the live card so the already-mounted
   * header — and with it the running view transition — is kept, and copies the
   * real titles onto that kept header and its spine (see `syncTitles`).
   */
  replaceBody(slot: string, html: string, cardEl: Element | null): void;
  /** Every fact the stack reads out of a location's fragment. */
  factsFor(slot: string): FragmentFacts;
}

export function createCardFragments(options: CardFragmentsOptions = {}): CardFragments {
  const cache = new Map<string, string>();
  const onChange = options.onChange;
  const loader: FragmentLoader = options.load ?? (async (uid) => {
    const res = await fetch(uidToFetchUrl(uid));
    if (!res.ok) return null;
    return extractStackCard(await res.text());
  });

  function write(slot: string, html: string) {
    cache.set(slot, withSlotUid(html, slot));
    onChange?.(slot);
  }

  return {
    get: (key) => cache.get(key),
    has: (key) => cache.has(key),
    seed: write,
    adopt(slot, cardEl) {
      if (!cardEl) return false;
      write(slot, cardEl.outerHTML);
      return true;
    },
    seedPlaceholder: (slot, title) => write(slot, buildPlaceholderHtml(slot, title)),
    load: (uid) => loader(uid),
    async ensure(slot, uid = slot) {
      if (cache.has(slot)) return true;
      const html = await loader(uid);
      if (!html) return false;
      write(slot, html);
      return true;
    },
    replaceBody(slot, html, cardEl) {
      write(slot, html);
      const inner = extractBodyInner(html);
      const existing = cardEl?.querySelector('.stack-card-body-inner');
      if (inner !== null && existing) existing.innerHTML = inner;
      syncTitles(html, cardEl);
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
