// Param codecs: compact, escape-free encoding of a stack entry's URL params
// (the `from`/`to` context in stack-codec.ts). Each param `[key, value]` pair
// becomes a token `<sigil><body>`, where the sigil (a single char) names the
// codec that produced it and the body is that codec's escape-free encoding.
//
// Mechanism only. This module knows nothing about `filter.` or any other
// param key — codecs come from the registered UrlParamProviders (see
// url-param-providers.ts), each of which owns its own keys and their short
// form. The raw fallback (`q`) never declines, so every param — including
// ones no provider claims — is always encodable.
//
// Extension point: a provider gives its params a short form by declaring a
// codec with a fresh sigil. A provider that declares none simply rides the
// raw fallback: correct and escape-free, just longer.
//
// Bodies are drawn only from `[A-Za-z0-9-_]` (base62 manifest codes and
// base64url), so tokens survive URLSearchParams / display / copy without any
// percent-escaping. Tokens are `~`-separated and entries `.`-separated by
// stack-codec; neither char appears in a body.
import { URL_PARAM_PROVIDERS } from './url-param-providers';
import type { CodecContext, ParamCodec } from './url-params';

export type { CodecContext, ParamCodec } from './url-params';

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

/**
 * Ordered registry: every provider's codecs, then the raw fallback — which
 * must remain last, since it never declines.
 */
export const PARAM_CODECS: ParamCodec[] = [
  ...URL_PARAM_PROVIDERS.flatMap(p => p.codecs ?? []),
  rawCodec,
];

// A sigil collision would silently route decode to the wrong codec, so fail
// loudly at module load rather than corrupting shared links.
const sigils = PARAM_CODECS.map(c => c.sigil);
if (new Set(sigils).size !== sigils.length) {
  throw new Error(`duplicate param codec sigil among: ${sigils.join(', ')}`);
}

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
