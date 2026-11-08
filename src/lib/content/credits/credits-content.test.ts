import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { findCreditNameDrift, normaliseCredits, KNOWN_DISTINCT, type RawCredit } from '@content/credits/credits';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content');

async function* cardFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* cardFiles(full);
    else if (entry.name === 'index.md') yield full;
  }
}

async function creditedCards() {
  const cards: { uid: string; credits: NonNullable<ReturnType<typeof normaliseCredits>> }[] = [];
  for await (const file of cardFiles(join(CONTENT_DIR, 'what'))) {
    const match = /^---\n([\s\S]*?)\n---/.exec(await readFile(file, 'utf-8'));
    if (!match) continue;
    const data = parseYaml(match[1]) as { credits?: RawCredit[] } | null;
    const credits = normaliseCredits(data?.credits);
    if (credits) cards.push({ uid: relative(CONTENT_DIR, dirname(file)), credits });
  }
  return cards;
}

describe('credits across the real cards', () => {
  it('finds the credited cards', async () => {
    expect((await creditedCards()).length).toBeGreaterThanOrEqual(11);
  });

  it('has no name drift: no one split in two, no two people merged', async () => {
    expect(findCreditNameDrift(await creditedCards(), KNOWN_DISTINCT)).toEqual([]);
  });
});
