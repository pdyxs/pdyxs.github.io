import { describe, it, expect, vi } from 'vitest';
import { particularsEditor, EDITOR_ROUTE } from './integration.ts';

function setup(command: 'dev' | 'build' | 'preview' | 'sync') {
  const injectRoute = vi.fn();
  const updateConfig = vi.fn();
  const integration = particularsEditor();
  (integration.hooks['astro:config:setup'] as any)({ command, injectRoute, updateConfig });
  return { injectRoute, updateConfig };
}

describe('particularsEditor integration', () => {
  it('adds the route and the write endpoint under `astro dev`', () => {
    const { injectRoute, updateConfig } = setup('dev');
    expect(injectRoute).toHaveBeenCalledWith(expect.objectContaining({ pattern: EDITOR_ROUTE }));
    const plugins = updateConfig.mock.calls[0][0].vite.plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].apply).toBe('serve');
  });

  it.each(['build', 'preview', 'sync'] as const)('adds nothing under `astro %s`, so production ships no editor', (command) => {
    const { injectRoute, updateConfig } = setup(command);
    expect(injectRoute).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
