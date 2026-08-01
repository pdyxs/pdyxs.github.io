// The dimension id union — deliberately its own leaf module.
//
// types.ts already imports TagNode from lib/browse-helpers, and browse-helpers
// needs this union to type TagNode.dimensionId. Declaring it here (importing
// only from lib/five-w, itself a leaf) keeps that a straight line instead of a
// cycle: browse-helpers -> dimensions/id -> lib/five-w, with nothing pointing
// back.
import type { FiveWDimension } from '../lib/five-w';

/**
 * Every registered dimension's id: the five 5 W axes, the null dimension (bare
 * tags, id ''), and the dev-only status dimension.
 *
 * Closed on purpose — it's what makes FilterState reject a key that names no
 * dimension. An open `Record<string, …>` accepted any key, so misfiled
 * selections (e.g. nested under `selections:`) type-checked clean and silently
 * narrowed nothing — issue #79.
 *
 * This union hand-restates DIMENSIONS' membership rather than deriving from it
 * (`typeof DIMENSIONS[number]['id']` can't work — Dimension.id is typed *by*
 * this union). registry.ts asserts the two agree.
 */
export type DimensionId = FiveWDimension | '' | 'status';
