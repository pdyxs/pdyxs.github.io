import { describe, it, expect } from 'vitest';
import { deriveLensChrome, SITE_TITLE } from './lens-chrome';
import { getLensDefinition } from './lens-registry';
import type { FilterState } from '../dimensions';

const home = getLensDefinition('home')!;
const newest = getLensDefinition('newest')!;
const empty: FilterState = { };

describe('deriveLensChrome', () => {
  it('home: card title is the site title, page subtitle is the lens label', () => {
    const chrome = deriveLensChrome(home, empty);
    expect(chrome.cardTitle).toBe(SITE_TITLE);
    expect(chrome.pageTitle).toBe(SITE_TITLE);
    expect(chrome.pageSubtitle).toBe('A bit of everything');
  });

  it('a filter lens with no active filters: card title is the lens label', () => {
    const chrome = deriveLensChrome(newest, empty);
    expect(chrome.cardTitle).toBe('Newest');
    expect(chrome.pageSubtitle).toBe('Newest');
    // Page mode always shows the site title as the H1.
    expect(chrome.pageTitle).toBe(SITE_TITLE);
  });

  it('a filter lens with an active filter: label · Filter, feeding both card title and subtitle', () => {
    const fs: FilterState = { what: ['what:puzzles'] };
    const chrome = deriveLensChrome(newest, fs);
    expect(chrome.cardTitle).toBe('Newest · Puzzles');
    expect(chrome.pageSubtitle).toBe('Newest · Puzzles');
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
