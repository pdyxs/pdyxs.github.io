import { describe, it, expect } from 'vitest';
import { deriveLensChrome, lensChromeForKey, siteSubtitle, SITE_TITLE } from './lens-chrome';
import { getLensDefinition } from './lens-registry';
import type { FilterState } from '../dimensions';

const home = getLensDefinition('home')!;
const newest = getLensDefinition('newest')!;
const interesting = getLensDefinition('interesting')!;
const empty: FilterState = { };

describe('deriveLensChrome', () => {
  it('home: card title is the site title', () => {
    const chrome = deriveLensChrome(home, empty);
    expect(chrome.cardTitle).toBe(SITE_TITLE);
    expect(chrome.pageTitle).toBe(SITE_TITLE);
  });

  it('the page subtitle is the SITE\'s, not the lens\'s — the same on every lens', () => {
    // It used to be the lens's own label, which made the site header say what
    // you were browsing rather than what the site is. The lens names itself in
    // its card header instead.
    const subtitle = siteSubtitle();
    expect(subtitle).toBe(home.subtitle);
    expect(subtitle).not.toBe(home.label);
    for (const lens of [home, newest, interesting]) {
      expect(deriveLensChrome(lens, empty).pageSubtitle).toBe(subtitle);
    }
    expect(deriveLensChrome(newest, { what: ['what:puzzles'] }).pageSubtitle).toBe(subtitle);
  });

  it('carries a lens note alongside the title, never folded into it', () => {
    // The footnote is a separate string on purpose: CardStack reads
    // .card-header-title's textContent as a placeholder card's name, and would
    // otherwise name the card after its own disclaimer.
    const chrome = deriveLensChrome(interesting, empty);
    expect(chrome.cardTitle).toBe('Most* Interesting');
    expect(chrome.note).toBe('*an attempt at that, anyway');
  });

  it('leaves note undefined for a lens that declares none', () => {
    expect(deriveLensChrome(newest, empty).note).toBeUndefined();
  });

  it('a filter lens with no active filters: card title is the lens label', () => {
    const chrome = deriveLensChrome(newest, empty);
    expect(chrome.cardTitle).toBe('Newest');
    // Page mode always shows the site title as the H1.
    expect(chrome.pageTitle).toBe(SITE_TITLE);
  });

  it('a filter lens with an active filter: label · Filter', () => {
    const fs: FilterState = { what: ['what:puzzles'] };
    expect(deriveLensChrome(newest, fs).cardTitle).toBe('Newest · Puzzles');
  });

  it('uses the last hierarchical segment of a filter, title-cased', () => {
    const fs: FilterState = { what: ['what:projects/software-engineering'] };
    const chrome = deriveLensChrome(newest, fs);
    expect(chrome.cardTitle).toBe('Newest · Software Engineering');
  });

  it('includes a dimensionless filter label, humanised', () => {
    const fs: FilterState = { '': ['game-engine-podcast'] };
    const chrome = deriveLensChrome(newest, fs);
    expect(chrome.cardTitle).toBe('Newest · Game Engine Podcast');
  });

  it('appends dimensionless labels after dimension labels', () => {
    const fs: FilterState = { what: ['what:puzzles'], '': ['science'] };
    const chrome = deriveLensChrome(newest, fs);
    expect(chrome.cardTitle).toBe('Newest · Puzzles · Science');
  });

  it('joins multiple active filters in dimension order', () => {
    const fs: FilterState = {
      what: ['what:puzzles'], who: ['who:accenture'],
    };
    const chrome = deriveLensChrome(newest, fs);
    // FIVE_W_DIMENSIONS order is who, what, when, where, why → Accenture before Puzzles.
    expect(chrome.cardTitle).toBe('Newest · Accenture · Puzzles');
  });
});

describe('lensChromeForKey', () => {
  // A fragment is fetched by uid and so always renders its lens unfiltered;
  // the location it mounts as carries the filters in its key. This is the only
  // place that pairing is turned back into a title.
  it('reads the filters out of a lens location key', () => {
    expect(lensChromeForKey('lens/newest?filter.what=what%3Apuzzles')?.cardTitle)
      .toBe('Newest · Puzzles');
  });

  it('an unfiltered lens key is just the label', () => {
    expect(lensChromeForKey('lens/newest')?.cardTitle).toBe('Newest');
  });

  it('a suffixed handle still resolves — a second filtered view is still that lens', () => {
    expect(lensChromeForKey('lens/newest?filter.what=what%3Apuzzles')?.note).toBeUndefined();
    expect(lensChromeForKey('lens/interesting')?.note).toBe('*an attempt at that, anyway');
  });

  it('null for a card key and for an undeclared lens', () => {
    expect(lensChromeForKey('what/puzzles/foo')).toBeNull();
    expect(lensChromeForKey('lens/no-such-lens')).toBeNull();
  });
});
