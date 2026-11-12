import { describe, it, expect } from 'vitest';
import { demoEditor } from './definition.ts';

describe('demoEditor', () => {
  it('declares the headerMedia its renderer needs and a blank', () => {
    expect(demoEditor.id).toBe('demo');
    expect(demoEditor.frontmatter).toEqual({ headerMedia: 'dev-editor-demo' });
    expect(demoEditor.blank()).toEqual({ text: '', count: 0 });
  });

  it('validates { text: string, count: number }', () => {
    expect(demoEditor.validate({ text: 'hi', count: 2 })).toEqual([]);
    expect(demoEditor.validate({ text: 1, count: 2 } as any)).toEqual(['text must be a string']);
    expect(demoEditor.validate({ text: 'a', count: 'x' } as any)).toEqual(['count must be a finite number']);
    expect(demoEditor.validate(null as any)).toEqual(['data must be an object']);
  });
});
