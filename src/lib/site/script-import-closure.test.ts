import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

// Every `scripts/*.mjs` runs under PLAIN NODE type-stripping (engines floor
// 22.18) — no Vite, no Astro, no tsconfig path aliases, no `import.meta.env`.
// So does everything those scripts import, transitively. That closure is ~55
// files, most of them in src/lib, and NOTHING ELSE ENFORCES IT: a module that
// becomes Node-unloadable still builds, still typechecks, and still passes
// every other test, because all three of those go through Vite. It fails only
// when `predev`/`prebuild` next runs a generator — i.e. for the next person to
// boot a cold dev server, with an error naming neither the module nor the
// change that broke it.
//
// The live example is `lens-body-keys.ts`, a deliberate leaf sitting directly
// beside `lens-components.ts` in browse/lenses/. That neighbour is NOT
// Node-loadable: line 53 spreads `import.meta.env.DEV` at the top level, which
// Vite substitutes and Node leaves undefined. Folding the four-string key list
// into it — an attractive tidy, now that the two are siblings — would break
// `generate-lens-registry.mjs` and nothing would say so.
//
// This test derives its own coverage rather than listing it: the entry set is
// parsed out of the scripts, so a new script import is picked up with no edit
// here, and the transitive depth is covered by Node itself, so an import added
// anywhere BELOW an entry fails too.
//
// The scripts are deliberately never imported, only their sources read. Most
// have a top-level `main()`, so importing one RUNS it — `pad-card-images.mjs`
// re-pads committed images that way.
const STATIC_IMPORT_FROM_SRC = /^\s*import\s[\s\S]*?\sfrom\s+['"](\.\.\/src\/[^'"]+)['"]/gm;

async function entryModules(): Promise<string[]> {
  const files = (await readdir(SCRIPTS_DIR)).filter((f) => f.endsWith('.mjs'));
  const found = new Set<string>();
  for (const file of files) {
    const source = await readFile(path.join(SCRIPTS_DIR, file), 'utf8');
    for (const [, specifier] of source.matchAll(STATIC_IMPORT_FROM_SRC)) {
      found.add(path.resolve(SCRIPTS_DIR, specifier));
    }
  }
  return [...found].sort();
}

describe('the generator scripts’ import closure stays loadable by plain Node', () => {
  it('loads every module the scripts import, under plain node', { timeout: 60_000 }, async () => {
    const modules = await entryModules();

    // A regex that silently matched nothing would make this test vacuous.
    expect(modules.length).toBeGreaterThan(5);
    expect(modules.every((m) => m.startsWith(path.join(PROJECT_ROOT, 'src')))).toBe(true);

    // `node -e` with no flags: exactly how package.json invokes the scripts.
    const failures = await Promise.all(
      modules.map(async (modulePath) => {
        try {
          await run(process.execPath, ['-e', `import(${JSON.stringify(modulePath)})`], {
            cwd: PROJECT_ROOT,
          });
          return null;
        } catch (err) {
          const stderr = String((err as { stderr?: string }).stderr ?? err);
          const rel = path.relative(PROJECT_ROOT, modulePath);
          return `${rel}\n    ${stderr.trim().split('\n')[0]}`;
        }
      }),
    );

    expect(failures.filter(Boolean)).toEqual([]);
  });
});
