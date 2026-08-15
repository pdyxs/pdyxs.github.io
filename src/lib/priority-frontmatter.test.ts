// The observable failure for a typo'd `priority:` (issue #80).
//
// Zod strips unknown frontmatter keys silently, so `priorty: 100` is not an
// error anywhere — the card just never gets its boost, and the only symptom is
// a ranking that looks slightly wrong. This scans the real content tree, ahead
// of the schema, so the typo fails a gate instead of failing quietly.
//
// Scans raw markdown (like project-status-vacate.test.ts) rather than going
// through the content collection, precisely because the collection is where
// the evidence is destroyed.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suspectedPriorityTypos } from './priority';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** Every markdown file under src/content, excluding `_`-prefixed infrastructure. */
function markdownFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(path));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

/** Top-level frontmatter keys of a markdown file (shallow — nested keys are indented). */
function frontmatterKeys(source: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return [];
  return [...match[1].matchAll(/^([A-Za-z_][\w-]*)\s*:/gm)].map(m => m[1]);
}

describe('suspectedPriorityTypos', () => {
  it('catches the near misses', () => {
    expect(suspectedPriorityTypos(['priorty', 'prioirty', 'Priority', 'pirority'])).toEqual([
      'priorty',
      'prioirty',
      'Priority',
      'pirority',
    ]);
  });

  it('passes the correct spelling and unrelated keys', () => {
    expect(suspectedPriorityTypos(['priority', 'title', 'order', 'imagePad'])).toEqual([]);
  });
});

describe('content frontmatter', () => {
  it('carries no misspelling of `priority:`, which zod would strip in silence', () => {
    const offenders = markdownFiles(CONTENT_DIR).flatMap(path => {
      const typos = suspectedPriorityTypos(frontmatterKeys(readFileSync(path, 'utf-8')));
      return typos.map(key => `${relative(CONTENT_DIR, path)}: ${key}`);
    });
    expect(offenders).toEqual([]);
  });
});
