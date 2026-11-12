import { describe, it, expect, vi } from 'vitest';
import { devInspect, INSPECT_ROUTE } from './integration.ts';

function setup(command: 'dev' | 'build' | 'preview' | 'sync') {
  const injectRoute = vi.fn();
  const updateConfig = vi.fn();
  const integration = devInspect();
  (integration.hooks['astro:config:setup'] as any)({ command, injectRoute, updateConfig });
  return { injectRoute, updateConfig };
}

describe('devInspect integration', () => {
  it('under `astro dev` mounts one serve-only middleware plugin', () => {
    const { injectRoute, updateConfig } = setup('dev');
    expect(INSPECT_ROUTE).toBe('/__inspect');
    const plugins = updateConfig.mock.calls[0][0].vite.plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].apply).toBe('serve');
    expect(injectRoute).not.toHaveBeenCalled();
  });

  it('the middleware answers a bad uid with 400', async () => {
    const { updateConfig } = setup('dev');
    const plugin = updateConfig.mock.calls[0][0].vite.plugins[0];
    let handler: any;
    plugin.configureServer({ config: { root: '/nonexistent-site' }, middlewares: { use: (_p: string, h: any) => (handler = h) } });
    const req = Object.assign((async function* () { yield JSON.stringify({ uid: '../x' }); })(), { method: 'POST', url: '/' });
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it.each(['build', 'preview', 'sync'] as const)('under `astro %s` adds no middleware and no route', (command) => {
    const { injectRoute, updateConfig } = setup(command);
    expect(injectRoute).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
