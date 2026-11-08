import { describe, it, expect } from 'vitest';
import { needsFetch, releaseAssetName } from './release.ts';

describe('needsFetch', () => {
  it('fetches when nothing is installed', () => {
    expect(needsFetch(undefined, 'v1.0.0')).toBe(true);
  });
  it('skips when the installed version is the pinned one', () => {
    expect(needsFetch('v1.0.0', 'v1.0.0')).toBe(false);
  });
  it('tolerates whitespace in the marker file', () => {
    expect(needsFetch('v1.0.0\n', 'v1.0.0')).toBe(false);
  });
  it('fetches when the pin has moved', () => {
    expect(needsFetch('v1.0.0', 'v1.1.0')).toBe(true);
  });
});

describe('releaseAssetName', () => {
  it('drops the v from the tag', () => {
    expect(releaseAssetName('v1.0.0')).toBe('flatland-web-1.0.0.zip');
  });
});
