// Client-facing tag manifest lookup. Statically imports the build-generated
// tag manifest JSON (src/data/tag-manifest.json) so filter params in a shared
// `from`/`to` URL decode to their tag values without a network round trip.
//
// Kept separate from the location manifest (stack-manifest-client.ts): the two
// are independent code spaces — a location and a tag may share a code, and are
// only ever looked up in their own context (see param-codecs.ts / stack-codec.ts).
import tagManifestData from '../data/tag-manifest.json';
import { buildLookup } from './stack-manifest';
import type { Manifest, ManifestLookup } from './stack-manifest';

export const tagManifestLookup: ManifestLookup = buildLookup(tagManifestData as Manifest);
