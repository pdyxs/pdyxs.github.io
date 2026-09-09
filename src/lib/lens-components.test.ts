import { describe, it, expect } from 'vitest';
import { LENS_BODY_LOADERS } from './lens-components';
import { LENS_BODY_KEYS } from './lens-body-keys';

// The generator (scripts/generate-lens-registry.mjs) validates a lens's
// declared `component:` against LENS_BODY_KEYS, and cannot import
// lens-components.ts to ask it directly. So the two must agree, and this is
// what says so: drift makes either a legal-looking `component:` fail at
// generation, or a registered loader unreachable from any lens.
describe('lens body registry', () => {
  it('registers a loader for every declared body key', () => {
    // `audit` is DEV-only — it is dead-code-eliminated from the map in a
    // production build (see lens-components.ts), so it is legal for the map to
    // be missing it and never legal for the map to hold a key the list lacks.
    const registered = Object.keys(LENS_BODY_LOADERS).sort();
    const declared = [...LENS_BODY_KEYS].sort();

    expect(declared).toEqual(expect.arrayContaining(registered));

    const missing = declared.filter((k) => !registered.includes(k));
    expect(missing.every((k) => k === 'audit')).toBe(true);
  });

  it('declares audit, which only the dev map registers', () => {
    expect(LENS_BODY_KEYS).toContain('audit');
  });
});
