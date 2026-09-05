// The variant record's agreement with what BrowseCard actually renders
// (issues #130, #133).
//
// Runs in the **island** vitest project, because it mounts a Svelte component.
// No `.astro` import may reach this file — there is no Astro plugin here to
// transform one.
//
// The load-bearing test is the last one. `BROWSE_CARD_VARIANTS[v].minHeight` is
// the floor the home lens's pre-hydration placeholder holds space with, and a
// floor that disagrees with the card it holds space for is precisely the bug
// the placeholder exists to prevent — it would show up as a document-height
// jump on `/` at hydration, which no still image and no other test can see.
//
// happy-dom does no layout, so the agreement is asserted STRUCTURALLY: the
// test walks the rendered card, adds up the vertical parts it actually finds,
// and compares that with the record. Change a padding, a clamp or which
// elements a variant renders, and the sum moves — which is exactly when the
// number needs re-measuring.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import BrowseCard from './BrowseCard.svelte';
import {
  BROWSE_CARD_VARIANTS,
  BROWSE_CARD_VARIANT_NAMES,
  resolveBrowseCardVariant,
} from '../lib/browse-card-variants';
import type { BrowseCardVariantName } from '../lib/browse-card-variants';
import type { BrowseCardData } from '../lib/browse-helpers';
import { DEFAULT_PRIORITY } from '../lib/priority';
import { DEFAULT_FOLDER_SORT } from '../lib/folder-sort';

const CARD: BrowseCardData = {
  uid: 'what/puzzles/fog',
  title: 'Fog',
  description: 'A long enough summary that the clamp has something to clamp.',
  date: '2024-03-15T00:00:00.000Z',
  tags: ['what:puzzles', 'why:playable', 'when:released', 'where:online', 'who:me'],
  renderer: 'card',
  thumb: '/thumb.png',
  priority: DEFAULT_PRIORITY,
  sort: DEFAULT_FOLDER_SORT,
};

let target: HTMLElement;
let app: Record<string, unknown> | null = null;

function render(variant?: BrowseCardVariantName): HTMLElement {
  // `as any`: the .astro client-directive prop shim widens the component type
  // past what mount() accepts — same cast as CardStack.island.test.ts.
  app = mount(BrowseCard as any, { target, props: { card: CARD, variant } }) as Record<string, unknown>;
  return target.querySelector('.browse-card-item') as HTMLElement;
}

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  if (app) unmount(app as any);
  app = null;
  target.remove();
});

// ---------------------------------------------------------------------------
// resolveBrowseCardVariant
// ---------------------------------------------------------------------------

describe('resolveBrowseCardVariant', () => {
  it('returns the named variant', () => {
    expect(resolveBrowseCardVariant('brief')).toBe(BROWSE_CARD_VARIANTS.brief);
  });

  // The runtime half of the closed TS union. Every AUTHORING path validates
  // the name at generation time (parseHomeSlots), so an unknown `variant:` in
  // YAML is a build error rather than reaching this fallback.
  it('falls back to full for an unknown name', () => {
    expect(resolveBrowseCardVariant('tiny')).toBe(BROWSE_CARD_VARIANTS.full);
  });

  it('falls back to full for an absent name', () => {
    expect(resolveBrowseCardVariant(undefined)).toBe(BROWSE_CARD_VARIANTS.full);
  });
});

// ---------------------------------------------------------------------------
// The record drives which elements render
// ---------------------------------------------------------------------------

describe('BrowseCard variants', () => {
  // The regression signal for "full is the default, the diff is additive":
  // the four existing call sites pass no variant and must render as before.
  it('renders as `full` when no variant is passed', () => {
    const item = render(undefined);
    expect(item.querySelector('.browse-card-thumb')).not.toBeNull();
    expect(item.querySelector('.browse-card-date')).not.toBeNull();
    expect(item.querySelector('.browse-card-tags')).not.toBeNull();
    expect(item.classList.contains('browse-card-item--brief')).toBe(false);
  });

  it('drops the thumb, date and tags for `brief`', () => {
    const item = render('brief');
    expect(item.querySelector('.browse-card-thumb')).toBeNull();
    expect(item.querySelector('.browse-card-date')).toBeNull();
    expect(item.querySelector('.browse-card-tags')).toBeNull();
    expect(item.classList.contains('browse-card-item--brief')).toBe(true);
  });

  it('keeps the title and description in every variant', () => {
    for (const name of BROWSE_CARD_VARIANT_NAMES) {
      const item = render(name);
      expect(item.querySelector('.browse-card-title')?.textContent).toContain('Fog');
      expect(item.querySelector('.browse-card-desc')).not.toBeNull();
      if (app) unmount(app as any);
      app = null;
      target.innerHTML = '';
    }
  });

  it("honours the variant's tagLimit", () => {
    const item = render(undefined);
    // 5 tags, tagLimit 4 -> 4 chips plus a "+1" overflow pill.
    const chips = item.querySelectorAll('.browse-card-tag');
    expect(chips.length).toBe(BROWSE_CARD_VARIANTS.full.tagLimit + 1);
    expect(item.querySelector('.browse-card-tag-overflow')?.textContent?.trim()).toBe('+1');
  });

  it('writes the two per-card custom properties from the record', () => {
    for (const name of BROWSE_CARD_VARIANT_NAMES) {
      const item = render(name);
      const v = BROWSE_CARD_VARIANTS[name];
      expect(item.style.getPropertyValue('--browse-card-desc-lines')).toBe(String(v.descriptionLines));
      expect(item.style.getPropertyValue('--browse-card-min-height')).toBe(v.minHeight);
      if (app) unmount(app as any);
      app = null;
      target.innerHTML = '';
    }
  });
});

// ---------------------------------------------------------------------------
// minHeight agrees with what the card renders
// ---------------------------------------------------------------------------

/**
 * The vertical parts of `.browse-card-content`, in rem, read off the two style
 * sheets that own them: global.css's `:root` spacing scale and BrowseCard's own
 * scoped block. Each term names its source so a change on either side is
 * traceable from here.
 *
 * The 16/9 banner is deliberately NOT a term. Its height is a function of the
 * card's width, so no absolute floor can express it — which is why the floor is
 * the card's INTERIOR and the placeholder draws its own 16/9 band above it.
 */
const REM = 18; // --font-size-base
const SPACE_XS = 0.375; // global.css :root
const SPACE_MD = 1.25; // global.css :root

const PART = {
  /** .browse-card-content { padding: var(--space-md) }, top and bottom. */
  contentPadding: 2 * SPACE_MD,
  /** .browse-card-header: one 1rem title line at the inherited 1.7 line-height
   *  (the meta group's 0.75rem is shorter and never sets the row's height),
   *  plus its own margin-bottom. */
  header: 1 * 1.7 + SPACE_XS,
  /** .browse-card-desc { font-size: 0.85rem; line-height: 1.4 } per line, plus
   *  the block's margin-bottom. */
  descriptionLine: 0.85 * 1.4,
  descriptionGap: SPACE_XS,
  /** .browse-card-tags { margin-top: var(--space-xs) }, then one chip row:
   *  0.7rem text at the inherited 1.7 line-height, 1px padding and 1px border
   *  top and bottom, and the global `li { margin-bottom: var(--space-xs) }`
   *  that the chip does not reset. */
  tags: SPACE_XS + (0.7 * 1.7 + 4 / REM + SPACE_XS),
};

/** The floor the rendered card actually needs, summed from what it contains. */
function measuredFloor(item: HTMLElement, descriptionLines: number): number {
  let total = PART.contentPadding;
  if (item.querySelector('.browse-card-header')) total += PART.header;
  if (item.querySelector('.browse-card-desc')) {
    total += descriptionLines * PART.descriptionLine + PART.descriptionGap;
  }
  if (item.querySelector('.browse-card-tags')) total += PART.tags;
  return total;
}

describe('BROWSE_CARD_VARIANTS minHeight', () => {
  for (const name of BROWSE_CARD_VARIANT_NAMES) {
    it(`\`${name}\`'s floor agrees with the card it holds space for`, () => {
      const v = BROWSE_CARD_VARIANTS[name];
      const item = render(name);

      expect(v.minHeight).toMatch(/rem$/);
      expect(parseFloat(v.minHeight)).toBeCloseTo(measuredFloor(item, v.descriptionLines), 2);
    });
  }

  // Not a tautology: it is the shape of the two variants stated independently
  // of the arithmetic, so a copy-paste that gave `brief` `full`'s number would
  // fail here even if the parts table were wrong in the same way.
  it('gives `brief` a lower floor than `full`', () => {
    expect(parseFloat(BROWSE_CARD_VARIANTS.brief.minHeight)).toBeLessThan(
      parseFloat(BROWSE_CARD_VARIANTS.full.minHeight),
    );
  });
});
