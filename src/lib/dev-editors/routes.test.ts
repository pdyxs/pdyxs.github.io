import { describe, it, expect } from 'vitest';
import { editorUrl, parseEditorPath } from './routes.ts';

describe('editor routes', () => {
  it('an open card mirrors its site path under the editor', () => {
    expect(editorUrl('demo')).toBe('/dev/editors/demo');
    expect(editorUrl('demo', 'what/toys/x')).toBe('/dev/editors/demo/what/toys/x');
  });

  it('reads the editor and card back out of the path', () => {
    expect(parseEditorPath('/dev/editors/demo', ['demo'])).toEqual({ editorId: 'demo', dir: '' });
    expect(parseEditorPath('/dev/editors/demo/', ['demo'])).toEqual({ editorId: 'demo', dir: '' });
    expect(parseEditorPath('/dev/editors/demo/what/toys/x/', ['demo'])).toEqual({ editorId: 'demo', dir: 'what/toys/x' });
    expect(parseEditorPath(editorUrl('demo', 'what/a b'), ['demo'])).toEqual({ editorId: 'demo', dir: 'what/a b' });
  });

  it('is not an editor page for an unknown editor or another route', () => {
    expect(parseEditorPath('/dev/editors/nope/what/x', ['demo'])).toBeNull();
    expect(parseEditorPath('/dev/editors', ['demo'])).toBeNull();
    expect(parseEditorPath('/card/what/x', ['demo'])).toBeNull();
    expect(parseEditorPath('/dev/editors/demo/%E0%A4', ['demo'])).toBeNull();
  });
});
