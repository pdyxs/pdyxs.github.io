import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The boundary between the mark and its tools (docs/plans/suspended-mark.md,
// "Tools"). The mark draws every tool the same way from config and calls the
// behaviour through the registry; it must not know what any tool does. So:
//
//   - the mark (SuspendedMark.astro, MarkTool.astro, src/lib/site/mark/*)
//     imports nothing under src/lib/site/mark-tools/ except index.ts (the
//     registry) and types.ts (the interface), and nothing palette-specific;
//   - a behaviour (src/lib/site/mark-tools/*) imports nothing of the mark's:
//     its whole contract with the mark is types.ts, beside it.
//
// Read as text, not imported: this is about what a file names, not what runs.

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SRC = path.join(ROOT, 'src');
const MARK_LIB = path.join(SRC, 'lib/site/mark');
const TOOLS_LIB = path.join(SRC, 'lib/site/mark-tools');
const MARK_COMPONENTS = ['SuspendedMark.astro', 'MarkTool.astro'].map((f) => path.join(SRC, 'components/site', f));

const ALIASES: Record<string, string> = {
  '@site/': 'lib/site/',
  '@data/': 'data/',
  '@components/': 'components/',
  '@stack/': 'lib/stack/',
};

/** Every module specifier in `source`: static, side-effect, re-export and dynamic imports. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const re = /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** A specifier as an absolute path without extension, or null for a package. */
function resolve(spec: string, from: string): string | null {
  let p: string | null = null;
  if (spec.startsWith('.')) p = path.resolve(path.dirname(from), spec);
  for (const [alias, dir] of Object.entries(ALIASES)) if (spec.startsWith(alias)) p = path.join(SRC, dir, spec.slice(alias.length));
  return p === null ? null : p.replace(/\.(ts|js|astro|svelte)$/, '');
}

const isUnder = (p: string, dir: string) => p === dir || p.startsWith(dir + path.sep);

/** The rule for the mark: under mark-tools/, only the registry and the interface; no palette. */
function markViolations(file: string, source: string): string[] {
  const bad: string[] = [];
  for (const spec of specifiers(source)) {
    const p = resolve(spec, file);
    // `@site/palette*`, by alias or by path.
    if (/^@site\/palette/.test(spec) || (p && /[/\\]palette[^/\\]*$/.test(p) && isUnder(p, path.join(SRC, 'lib/site')))) {
      bad.push(`${spec} (palette)`);
      continue;
    }
    if (!p) continue;
    if (isUnder(p, TOOLS_LIB) && ![TOOLS_LIB, path.join(TOOLS_LIB, 'index'), path.join(TOOLS_LIB, 'types')].includes(p)) {
      bad.push(`${spec} (a tool's internals)`);
    }
  }
  return bad;
}

/** The rule for a behaviour: nothing of the mark's. */
function toolViolations(file: string, source: string): string[] {
  const bad: string[] = [];
  for (const spec of specifiers(source)) {
    const p = resolve(spec, file);
    if (!p) continue;
    if (isUnder(p, MARK_LIB) || MARK_COMPONENTS.some((c) => c.replace(/\.astro$/, '') === p)) bad.push(spec);
  }
  return bad;
}

const sources = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|astro)$/.test(f) && !/\.test\.ts$/.test(f))
    .map((f) => path.join(dir, f));

describe('the mark ↔ tools boundary', () => {
  const markFiles = [...MARK_COMPONENTS, ...sources(MARK_LIB)];

  it('reads the imports it checks (not vacuous)', () => {
    expect(markFiles.length).toBeGreaterThan(6);
    const mark = readFileSync(MARK_COMPONENTS[0], 'utf8');
    expect(specifiers(mark)).toContain('@site/mark-tools');
    expect(specifiers(mark)).toContain('@site/mark/motion');
  });

  it('the mark imports only the registry and the interface from mark-tools/, and nothing palette', () => {
    const found = markFiles.flatMap((f) => markViolations(f, readFileSync(f, 'utf8')).map((v) => `${path.relative(ROOT, f)}: ${v}`));
    expect(found).toEqual([]);
  });

  it('no behaviour imports the mark', () => {
    const files = sources(TOOLS_LIB);
    expect(files.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['index.ts', 'types.ts']));
    const found = files.flatMap((f) => toolViolations(f, readFileSync(f, 'utf8')).map((v) => `${path.relative(ROOT, f)}: ${v}`));
    expect(found).toEqual([]);
  });

  it('catches what it is meant to', () => {
    const file = path.join(MARK_LIB, 'x.ts');
    expect(markViolations(file, "import { pick } from '@site/palette';")).toHaveLength(1);
    expect(markViolations(file, "import x from '@site/mark-tools/palette';")).toHaveLength(1);
    expect(markViolations(file, "import x from '../mark-tools/palette.ts';")).toHaveLength(1);
    expect(markViolations(file, "const m = import('@site/mark-tools/palette-revert');")).toHaveLength(1);
    expect(markViolations(file, "import { toolBehaviour } from '@site/mark-tools';\nimport type { ToolBehaviour } from '@site/mark-tools/types';")).toEqual([]);
    const tool = path.join(TOOLS_LIB, 'x.ts');
    expect(toolViolations(tool, "import type { V } from '@site/mark/geometry';")).toHaveLength(1);
    expect(toolViolations(tool, "import { DROP } from '../mark/geometry';")).toHaveLength(1);
    expect(toolViolations(tool, "import type { ToolBehaviour } from './types';")).toEqual([]);
  });
});
