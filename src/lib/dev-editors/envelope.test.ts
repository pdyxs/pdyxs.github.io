import { describe, it, expect } from 'vitest';
import { parseEnvelope, validateEnvelope, newEnvelope, STARTING_VERSION } from './envelope.ts';
import type { EditorDefinition } from './types.ts';

const editor: EditorDefinition<{ n: number }> = {
  id: 'e',
  name: 'E',
  frontmatter: {},
  component: '',
  blank: () => ({ n: 0 }),
  validate: (d) => (typeof d?.n === 'number' ? [] : ['n must be a number']),
};

describe('envelope', () => {
  it('a new file starts at 1.0.0 with the editor blank', () => {
    expect(STARTING_VERSION).toBe('1.0.0');
    expect(newEnvelope(editor)).toEqual({ editor: 'e', version: '1.0.0', data: { n: 0 } });
  });

  it('parseEnvelope reads JSON text, reporting bad JSON', () => {
    expect(parseEnvelope('{"editor":"e","version":"1.0.0","data":{"n":1}}')).toEqual({ ok: true, envelope: { editor: 'e', version: '1.0.0', data: { n: 1 } } });
    expect(parseEnvelope('{nope').ok).toBe(false);
  });

  it('accepts a matching editor, semver version and valid data', () => {
    expect(validateEnvelope(editor, { editor: 'e', version: '2.10.3', data: { n: 1 } })).toEqual([]);
    expect(validateEnvelope(editor, { editor: 'e', version: '1.0.0-beta.1', data: { n: 1 } })).toEqual([]);
  });

  it('reports a wrong editor, a non-semver version and the editor\'s data errors', () => {
    expect(validateEnvelope(editor, { editor: 'x', version: '1.0.0', data: { n: 1 } })).toEqual(['editor must be "e"']);
    expect(validateEnvelope(editor, { editor: 'e', version: '1.0', data: { n: 1 } })).toEqual(['version must be semver (x.y.z)']);
    expect(validateEnvelope(editor, { editor: 'e', version: '1.0.0', data: { n: 'a' } })).toEqual(['n must be a number']);
  });

  it('refuses a non-object envelope and a missing data member without calling validate', () => {
    expect(validateEnvelope(editor, null)).toEqual(['envelope must be an object']);
    expect(validateEnvelope(editor, { editor: 'e', version: '1.0.0' })).toEqual(['data is required']);
  });
});
