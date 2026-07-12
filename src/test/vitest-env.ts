// Custom Vitest environment: happy-dom globals + SSR Vite environment.
// The built-in "happy-dom" environment sets viteEnvironment: "client", which
// causes the Astro Vite plugin to return a browser stub for .astro imports
// instead of the real SSR component factory. Setting viteEnvironment: "ssr"
// here ensures .astro files are transformed correctly for Container API tests.
import type { Environment } from 'vitest/runtime';
import { populateGlobal } from 'vitest/runtime';
import { Window, GlobalWindow } from 'happy-dom';

async function teardownWindow(win: Window) {
  if ('abort' in win.happyDOM) {
    await (win.happyDOM as any).abort();
    win.close();
  } else {
    (win.happyDOM as any).cancelAsync();
  }
}

const env: Environment = {
  name: 'astro-happy-dom',
  viteEnvironment: 'ssr',

  async setup(global, { happyDOM = {} }: { happyDOM?: Record<string, unknown> } = {}) {
    const win = new ((GlobalWindow || Window) as typeof Window)({
      ...happyDOM,
      console: global.console ?? undefined,
      url: (happyDOM.url as string) || 'http://localhost:3000',
      settings: {
        ...(happyDOM.settings as object | undefined),
        disableErrorCapturing: true,
      },
    });

    const { keys, originals } = populateGlobal(global, win, {
      bindFunctions: true,
      additionalKeys: [
        'Request',
        'Response',
        'MessagePort',
        'fetch',
        'Headers',
        'AbortController',
        'AbortSignal',
        'URL',
        'URLSearchParams',
        'FormData',
      ],
    });

    return {
      async teardown(global: Record<string, unknown>) {
        await teardownWindow(win as unknown as Window);
        keys.forEach((key) => delete global[key]);
        originals.forEach((v, k) => (global[k as string] = v));
      },
    };
  },
};

export default env;
