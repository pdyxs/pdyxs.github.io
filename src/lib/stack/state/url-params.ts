// The URL-param contract (issue #76, DEC-008).
//
// A *provider* owns some slice of a location's URL params end to end: which
// keys it may emit, how it encodes and decodes them for the active location's
// readable query string, and optionally how to compact them for the stack URL.
//
// Types only — this module deliberately has no runtime imports, so a provider
// can depend on the contract without the contract depending back on any
// provider (see url-param-providers.ts for the composition).
//
// There is one provider today: the dimension registry, which owns the filter
// params. The stack already carries other per-entry params (card-internal
// state like `tab=bio` — see the Location entry in the vault Glossary), and
// those become the second provider when they're built.

/** One `[key, value]` URL param pair. */
export type ParamPair = [string, string];

/** Lookups a codec may need. Currently just the tag short-code manifest. */
export interface CodecContext {
  tags: {
    codeForUid(uid: string): string | undefined;
    uidForCode(code: string): string | undefined;
  };
}

/**
 * Compaction for the *stack* URL — the inactive `from`/`to` entries, where a
 * pair rides as a `<sigil><body>` token instead of a readable `key=value`.
 *
 * Opting in is purely a URL-length choice: a provider that supplies no codec
 * still round-trips correctly through the raw fallback, just more verbosely.
 */
export interface ParamCodec {
  /** Single character, unique across every registered codec. */
  readonly sigil: string;
  /** The escape-free token body, or null to decline this pair. */
  encode(key: string, value: string, ctx: CodecContext): string | null;
  /** Inverse of encode. Returns null when the body can't be resolved. */
  decode(body: string, ctx: CodecContext): ParamPair | null;
}

/**
 * A subsystem that owns part of a location's URL params.
 *
 * `paramKeys` must cover every key `toParams` can emit — that is what lets a
 * caller strip this provider's params without enumerating them by hand, which
 * is exactly what the old stripFilterParams got wrong.
 */
export interface UrlParamProvider<TState = unknown> {
  readonly id: string;
  readonly paramKeys: readonly string[];
  toParams(state: TState): ParamPair[];
  fromParams(params: URLSearchParams): TState;
  /** Stack-URL compaction. Omitted means "ride the raw fallback". */
  readonly codecs?: readonly ParamCodec[];
}
