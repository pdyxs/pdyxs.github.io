import { describe, it, expect } from 'vitest';
import { particularsDefinition } from './definition.ts';

const GOOD = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0 } };

describe('particularsDefinition', () => {
  it('names itself and the Particulars editor island', () => {
    expect(particularsDefinition.id).toBe('particulars');
    expect(particularsDefinition.component).toBe('/src/components/header-media/particulars/editor/Editor.svelte');
  });

  it('declares the headerMedia that makes a card render the toy', () => {
    expect(particularsDefinition.frontmatter).toEqual({ headerMedia: 'particulars' });
  });

  it('blank() is a scenario that validates', () => {
    expect(particularsDefinition.validate(particularsDefinition.blank())).toEqual([]);
  });

  it('accepts a valid scenario', () => {
    expect(particularsDefinition.validate(GOOD)).toEqual([]);
  });

  it('returns every validation problem', () => {
    expect(particularsDefinition.validate({ walls: { width: 0, height: 5 }, player: { x: 0, y: 0 } })).toEqual([
      'walls.width must be a positive number',
    ]);
    expect(particularsDefinition.validate(null)).not.toEqual([]);
  });
});
