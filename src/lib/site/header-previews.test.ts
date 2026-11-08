import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { needsPreview, missingPreviews, previewTargets, readManifest } from '../../../scripts/lib/header-previews.mjs';

const ROOT = join(import.meta.dirname, '../../..');

describe('needsPreview', () => {
  it('wants a still for a header-media card with no image', () => {
    expect(needsPreview({ headerMedia: 'flash-game' })).toBe(true);
  });

  it('skips a card that has its own image: the still is only a fallback', () => {
    expect(needsPreview({ headerMedia: 'flash-game', image: 'header.png' })).toBe(false);
  });

  it('treats an empty or blank image as absent', () => {
    expect(needsPreview({ headerMedia: 'flash-game', image: '' })).toBe(true);
    expect(needsPreview({ headerMedia: 'flash-game', image: '  ' })).toBe(true);
    expect(needsPreview({ headerMedia: 'flash-game', image: null })).toBe(true);
  });

  it('skips a card with no header media', () => {
    expect(needsPreview({ title: 'x' })).toBe(false);
    expect(needsPreview(undefined)).toBe(false);
  });
});

describe('missingPreviews', () => {
  const targets = [{ uid: 'a' }, { uid: 'b' }];
  const both = () => true;

  it('is empty when every target has an entry and both stills', () => {
    expect(missingPreviews(targets, { a: {}, b: {} }, both)).toEqual([]);
  });

  it('reports a target with no manifest entry', () => {
    expect(missingPreviews(targets, { a: {} }, both)).toEqual(['b']);
  });

  it('reports a target whose still file is gone for either theme', () => {
    expect(missingPreviews(targets, { a: {}, b: {} }, (uid: string, theme: string) => !(uid === 'a' && theme === 'dark'))).toEqual(['a']);
  });
});

describe('the committed stills', () => {
  it('cover every card that needs one (run `npm run generate:header-previews`)', async () => {
    const targets = await previewTargets(join(ROOT, 'src/content'));
    const manifest = await readManifest(join(ROOT, 'src/data/header-previews.generated.ts'));
    const missing = missingPreviews(targets, manifest, (uid: string, theme: string) =>
      existsSync(join(ROOT, 'public/previews', uid, `${theme}.png`)),
    );
    expect(missing).toEqual([]);
  });
});
