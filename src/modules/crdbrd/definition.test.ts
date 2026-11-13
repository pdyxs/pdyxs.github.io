import { describe, it, expect } from 'vitest';
import { crdbrdEditor } from './definition.ts';
import { blank } from './model/game.ts';

describe('crdbrdEditor', () => {
  it('declares no card frontmatter, so opening a card writes only index.json', () => {
    expect(crdbrdEditor.id).toBe('crdbrd');
    expect(crdbrdEditor.frontmatter).toEqual({});
  });

  it('starts from a blank game and validates through the model', () => {
    expect(crdbrdEditor.blank()).toEqual(blank());
    expect(crdbrdEditor.validate(crdbrdEditor.blank())).toEqual([]);
    expect(crdbrdEditor.validate(null as any)).toEqual(['game must be an object']);
  });

  it('points at its Svelte island', () => {
    expect(crdbrdEditor.component).toBe('/src/modules/crdbrd/editor/CrdbrdEditor.svelte');
  });
});
