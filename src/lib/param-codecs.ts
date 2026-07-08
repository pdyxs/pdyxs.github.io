// Param codecs: compact, escape-free encoding of a stack entry's URL params
// (the `from`/`to` context in stack-codec.ts). Each param `[key, value]` pair
// becomes a token `<sigil><body>`, where the sigil (a single char) names the
// codec that produced it and the body is that codec's escape-free encoding.
//
// The registry is an ordered list; a param is encoded by the first codec whose
// `encode` returns non-null. The raw fallback (`q`) never declines, so every
// param — including ones no codec knows about — is always encodable.
//
// Extension point: to give a new custom param a short form, register a codec
// with a fresh sigil. Params whose author does nothing simply ride the raw
// fallback: correct and escape-free, just longer.
//
// Bodies are drawn only from `[A-Za-z0-9-_]` (base62 manifest codes and
// base64url), so tokens survive URLSearchParams / display / copy without any
// percent-escaping. Tokens are `~`-separated and entries `.`-separated by
// stack-codec; neither char appears in a body.
import type { ManifestLookup } from './stack-manifest';

export interface CodecContext {
  /** Lookup for the tag manifest (tag string <-> short code). */
  tags: ManifestLookup;
}

export interface ParamCodec {
  /** Single-char, unique across the registry. */
  readonly sigil: string;
  /** Returns the escape-free token body, or null to decline this pair. */
  encode(key: string, value: string, ctx: CodecContext): string | null;
  /** Inverse of encode. Returns null when the body can't be resolved. */
  decode(body: string, ctx: CodecContext): [string, string] | null;
}

const FILTER_KEY = 'filter';
const FILTER_PREFIX = 'filter.';

/**
 * Filter selections. A dimensioned filter `filter.what=art` and a (future)
 * dimensionless filter `filter=boardgames` both resolve to a canonical tag
 * string (`what:art` / `boardgames`) that the tag manifest codes. The tag
 * string is self-describing — presence of a `:` tells decode whether to
 * re-emit a dimensioned or a dimensionless key — so a single sigil covers both.
 */
export const filterCodec: ParamCodec = {
  sigil: 'f',
  encode(key, value, ctx) {
    let canonical: string;
    if (key === FILTER_KEY) canonical = value;
    else if (key.startsWith(FILTER_PREFIX)) canonical = `${key.slice(FILTER_PREFIX.length)}:${value}`;
    else return null;
    return ctx.tags.codeForUid(canonical) ?? null;
  },
  decode(body, ctx) {
    const canonical = ctx.tags.uidForCode(body);
    if (canonical === undefined) return null;
    const colon = canonical.indexOf(':');
    if (colon === -1) return [FILTER_KEY, canonical];
    return [`${FILTER_PREFIX}${canonical.slice(0, colon)}`, canonical.slice(colon + 1)];
  },
};

// --- base64url (unpadded) for the raw fallback -----------------------------
// Uses only [A-Za-z0-9-_]; the '=' padding is stripped and recomputed on decode.

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Total fallback: base64url-encodes the whole `key=value` pair. Handles any
 * bytes, so an arbitrary param that no other codec claims still round-trips.
 */
export const rawCodec: ParamCodec = {
  sigil: 'q',
  encode(key, value) {
    return toBase64Url(`${key}=${value}`);
  },
  decode(body) {
    const s = fromBase64Url(body);
    const eq = s.indexOf('=');
    if (eq === -1) return null;
    return [s.slice(0, eq), s.slice(eq + 1)];
  },
};

/** Ordered registry: the raw fallback must remain last (it never declines). */
export const PARAM_CODECS: ParamCodec[] = [filterCodec, rawCodec];

/** Encodes one param pair to a `<sigil><body>` token. */
export function encodeParam(key: string, value: string, ctx: CodecContext): string {
  for (const codec of PARAM_CODECS) {
    const body = codec.encode(key, value, ctx);
    if (body !== null) return codec.sigil + body;
  }
  // rawCodec never declines; this is unreachable.
  throw new Error(`no param codec accepted ${key}=${value}`);
}

/** Decodes one `<sigil><body>` token, or null if the sigil/body is unusable. */
export function decodeParam(token: string, ctx: CodecContext): [string, string] | null {
  if (!token) return null;
  const codec = PARAM_CODECS.find(c => c.sigil === token[0]);
  if (!codec) return null;
  return codec.decode(token.slice(1), ctx);
}
