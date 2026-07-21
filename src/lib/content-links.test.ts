// Guards the internal-link contract for card body content.
//
// The site is pdyxs.wtf, so an absolute https://pdyxs.wtf/... href in content
// is always a self-link that escapes the card stack (full page load, stack
// discarded) — and after the dimension-rooted relocation most of those legacy
// paths (/what/projects/..., /where/arctic/) no longer resolve at all. Content
// must use the in-stack protocols instead:
//
//   card:<uid>                -> pushes that single card
//   collection:<dim>:<value>  -> pushes the browse lens pre-filtered to a tag
//
// Both are handled by onDocumentClick in CardStack.svelte.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uidFromContentPath } from './content-uid';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function markdownFiles(): Array<{ rel: string; text: string }> {
  return walk(CONTENT_DIR)
    .map(f => ({ rel: relative(CONTENT_DIR, f).split('\\').join('/'), full: f }))
    .filter(({ rel }) => /\.(md|mdx)$/i.test(rel))
    .map(({ rel, full }) => ({ rel, text: readFileSync(full, 'utf8') }));
}

describe('content internal links', () => {
  it('no content links to an absolute pdyxs.wtf URL', () => {
    // Bare `@pdyxs.wtf` email addresses are fine — only hrefs are self-links.
    const offenders = markdownFiles()
      .filter(({ text }) => /https?:\/\/(www\.)?pdyxs\.wtf/i.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('every card: href resolves to a real content uid', () => {
    const files = markdownFiles();
    const uids = new Set(files.map(({ rel }) => uidFromContentPath(rel)));

    const dangling: string[] = [];
    for (const { rel, text } of files) {
      for (const m of text.matchAll(/card:([A-Za-z0-9/_-]+)/g)) {
        if (!uids.has(m[1])) dangling.push(`${rel} -> card:${m[1]}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
