# Testing

## Test location and commands

Tests are co-located with source as `src/**/*.test.ts`. Shared utilities live in `src/test/`.

The one naming rule: a test that **mounts a Svelte island** is named
`*.island.test.ts`, which routes it to the `island` vitest project below.
Everything else keeps the plain `*.test.ts` name.

```bash
npm test          # run once (CI / regression gate)
npm run test:watch  # watch mode during development
```

## Two vitest projects, because one Vite config cannot be both

`vitest.config.ts` is a thin root that lists two projects; `npx vitest run` runs
both. Each has its own Vite config, and the split is the whole answer to issue
#95:

| project | config | include | resolves through |
|---|---|---|---|
| `astro` | `vitest.astro.config.ts` | `src/**/*.test.ts` | Astro's Vite config (`getViteConfig`), `viteEnvironment: "ssr"` |
| `island` | `vitest.island.config.ts` | `src/**/*.island.test.ts` | a **plain** Vite config: `@sveltejs/vite-plugin-svelte` + `resolve.conditions: ['browser']`, environment `happy-dom` |

The `astro` project uses a custom environment at `src/test/vitest-env.ts` named
`astro-happy-dom`. That is required because the built-in `happy-dom` Vitest
environment sets `viteEnvironment: "client"`, causing the Astro Vite plugin to
return browser stubs for `.astro` imports instead of real SSR component
factories. The custom environment sets `viteEnvironment: "ssr"` while still
providing happy-dom DOM globals.

**Never rename that file to `happy-dom`** — the name is hardcoded in Vitest to
use `viteEnvironment: "client"`.

The `island` project pays the exact opposite cost, and it is the rule that keeps
the split honest: **an `*.island.test.ts` must not import a `.astro` file.**
There is no Astro plugin in that project to transform one. Island components
import only `.svelte` and `.ts`, so this holds today; a test that needs both a
mounted island and a rendered `.astro` component needs a browser, not a third
config.

`*.island.test.ts` is excluded from the `astro` project by filename, so a test
runs in exactly one of the two.

## DOM API gaps in happy-dom

- `document.startViewTransition` — not available; VT paths must be guarded and tested via instant-fallback branch only.
- `element.animate()` — not available in this happy-dom version; future StackNav tests that exercise animation paths must guard with `typeof el.animate === 'function'`.

## A Svelte island mounts only in the `island` project

`mount()` from `svelte` throws `lifecycle_function_unavailable` in the **`astro`**
project. The `viteEnvironment: "ssr"` that `.astro` imports require (see above)
also makes Svelte resolve to its **server** build, which has no client
lifecycle — and because that resolution comes from Astro's Vite config via
`getViteConfig`, it is project-wide *within that project*: neither a
`@vitest-environment happy-dom` docblock nor `--environment happy-dom` changes
it. Name a mount test `*.island.test.ts` instead and it runs in the sibling
project, where Svelte is its client build and `mount()`, `$effect`, `onMount`
and event handlers all work. `CardStack.island.test.ts` is the reference.

Three kinds of island coverage, and the boundaries between them are real:

- **Client mount** (`*.island.test.ts`) — the mount path, effects, the delegated
  click handlers, the `cardparam` / `popstate` listeners, and every store
  mutation they make. This is where orchestration is asserted as behaviour.
- **Server render** — `render()` from `svelte/server`, in the `astro` project.
  That project's `"ssr"` environment is precisely what makes the server renderer
  available, so anything a component does *during server render* is testable
  there and only there. `CardStack.ssr-isolation.test.ts` (#102) uses it to
  render two pages back to back through one module instance, which is what
  `astro build`'s prerenderer does and what a browser never does.
- **Neither** — View Transitions (happy-dom has no
  `document.startViewTransition`, so `startVT` stays undefined and every push
  takes the instant-fallback branch), real layout and geometry, CSS
  transitions, and scroll. Those still need browser verification.

A **source-level wiring guard** (reading the component as text) is now the last
resort, not the default. It is still the right tool for asserting an *absence* —
"`initFromUrl` marks nothing read" has no behaviour to observe — which is all
`CardStack.cold-load.test.ts` still does.

## Component tests

Use `experimental_AstroContainer` from `astro/container` to render `.astro` components in isolation:

```ts
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
const container = await AstroContainer.create();
const html = await container.renderToString(MyComponent, { props: { ... } });
```

Parse the returned HTML string with `document.createElement('div')` + `innerHTML` and assert against `textContent` or DOM queries.

## Pure logic and testability

The "decisions are pure, effects are thin" global rule (`~/.claude/rules/architecture.md`) is also this project's testing contract. Decision functions are extracted to `src/lib/` so they can be imported and tested without DOM setup. The thin DOM applier that writes the result is not unit-tested directly — the decision function is where the logic (and the test coverage) lives.

