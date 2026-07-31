// Stack-URL compaction for filter params.
//
// This used to live in param-codecs.ts, where it hardcoded the `filter` /
// `filter.` key format and re-parsed what the filter layer had just produced
// two modules away. It belongs here: the dimension registry owns these keys,
// so it owns their short form too.
//
// One sigil covers every dimension. They all canonicalise to a tag string
// (`what:art`, or a bare `science` for the null dimension), and that string is
// self-describing — the presence of a colon tells decode which key shape to
// re-emit — so splitting the sigil per dimension would buy nothing.
import { DIMENSIONS } from './registry';
import type { CodecContext, ParamCodec, ParamPair } from '../lib/url-params';

const NULL_DIMENSION_KEY = 'filter';
const KEY_PREFIX = 'filter.';

/** param key -> dimension id, for every key the registry declares. */
const DIMENSION_ID_BY_KEY = new Map<string, string>(
  DIMENSIONS.flatMap(d => d.paramKeys.map(key => [key, d.id] as const)),
);

export const filterCodec: ParamCodec = {
  sigil: 'f',

  encode(key: string, value: string, ctx: CodecContext): string | null {
    const id = DIMENSION_ID_BY_KEY.get(key);
    if (id === undefined) return null;
    const canonical = id === '' ? value : `${id}:${value}`;
    // Only manifest-known tags compact. A dev-only dimension's values are
    // never in the manifest (it is append-only forever, so a code assigned in
    // a dev run could never be withdrawn), so those decline to the raw codec.
    return ctx.tags.codeForUid(canonical) ?? null;
  },

  decode(body: string, ctx: CodecContext): ParamPair | null {
    const canonical = ctx.tags.uidForCode(body);
    if (canonical === undefined) return null;
    const colon = canonical.indexOf(':');
    if (colon === -1) return [NULL_DIMENSION_KEY, canonical];
    return [`${KEY_PREFIX}${canonical.slice(0, colon)}`, canonical.slice(colon + 1)];
  },
};
