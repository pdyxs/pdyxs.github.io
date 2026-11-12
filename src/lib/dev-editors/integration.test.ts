import { describe, it, expect, vi } from 'vitest';
import { devEditors, EDITORS_ROUTE, EDITORS_API } from './integration.ts';
import type { EditorDefinition } from './types.ts';

const editor = (id: string): EditorDefinition => ({ id, name: id, frontmatter: {}, component: '', blank: () => ({}), validate: () => [] });

function setup(command: 'dev' | 'build' | 'preview' | 'sync') {
  const injectRoute = vi.fn();
  const updateConfig = vi.fn();
  const integration = devEditors({ editors: [editor('a'), editor('b')] });
  (integration.hooks['astro:config:setup'] as any)({ command, injectRoute, updateConfig });
  return { injectRoute, updateConfig };
}

describe('devEditors integration', () => {
  it('under `astro dev` injects the list page, one page per editor, and the api middleware', () => {
    const { injectRoute, updateConfig } = setup('dev');
    expect(injectRoute.mock.calls.map((c) => c[0].pattern)).toEqual([EDITORS_ROUTE, `${EDITORS_ROUTE}/a`, `${EDITORS_ROUTE}/b`]);
    const plugins = updateConfig.mock.calls[0][0].vite.plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].apply).toBe('serve');
    expect(EDITORS_API).toBe('/__dev-editors');
  });

  it.each(['build', 'preview', 'sync'] as const)('under `astro %s` injects no route and no middleware', (command) => {
    const { injectRoute, updateConfig } = setup(command);
    expect(injectRoute).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
