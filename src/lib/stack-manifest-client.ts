// Client-facing manifest lookup. Statically imports the build-generated
// manifest JSON (src/data/stack-manifest.json) so it ships in the same JS
// bundle as CardStack.svelte — a cold deep-link load can decode short
// codes without any extra network round trip.
import manifestData from '../data/stack-manifest.json';
import { buildLookup } from './stack-manifest';
import type { Manifest, ManifestLookup } from './stack-manifest';

export const manifestLookup: ManifestLookup = buildLookup(manifestData as Manifest);
