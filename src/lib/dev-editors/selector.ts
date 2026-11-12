// The selector's pure parts: what the card list shows, and what a new card
// contains. Plain data in, plain data out.

import { frontmatterLine, type FrontmatterValues } from './frontmatter-plan.ts';

export interface SelectorCard {
  dir: string;
  /** `index.json` is a valid envelope for this editor. */
  valid: boolean;
}

export function selectorEntries(cards: readonly SelectorCard[], { showAll }: { showAll: boolean }): SelectorCard[] {
  return cards
    .filter((c) => showAll || c.valid)
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function newCardFiles(input: {
  title: string;
  isoDate: string;
  frontmatter: FrontmatterValues;
  envelope: unknown;
}): { indexMd: string; indexJson: string } {
  const lines = [
    `title: ${JSON.stringify(input.title)}`,
    `date: ${input.isoDate}`,
    'inspected: false',
    ...Object.entries(input.frontmatter).map(([k, v]) => frontmatterLine(k, v)),
  ];
  return { indexMd: `---\n${lines.join('\n')}\n---\n`, indexJson: JSON.stringify(input.envelope, null, 2) + '\n' };
}
