// Pure description resolution — the single place a card's one-line summary is
// decided (issue #71).
//
// 251 of 293 cards have no hand-written `description`, so a share card, feed
// item or browse subtitle built from frontmatter alone would be blank most of
// the time. resolveDescription keeps the hand-written value authoritative and
// derives a markdown-stripped body excerpt only when there isn't one.
//
// Consumers (OG/Twitter meta, JSON-LD, RSS, browse-card subtitles) all read
// `CardMeta.description`, which getAllCards() populates through this function
// — see the "decisions are pure, effects are thin" rule in CLAUDE.md.

/** Default excerpt length in characters, before word-boundary trimming. */
export const EXCERPT_MAX_LENGTH = 160;

/**
 * Reduces a markdown body to plain prose: fenced/inline code, HTML tags,
 * images, link syntax, headings, blockquote and list markers, emphasis,
 * horizontal rules and footnote markers all come out, and whitespace is
 * collapsed to single spaces. Returns '' for a body with no prose in it.
 */
export function stripMarkdown(body: string): string {
  let text = body;

  // Fenced code blocks (```…``` / ~~~…~~~) — dropped whole, not unwrapped.
  text = text.replace(/^[ \t]*(?:```|~~~)[\s\S]*?(?:```|~~~)[ \t]*$/gm, ' ');
  // Unterminated fence at end of body.
  text = text.replace(/^[ \t]*(?:```|~~~)[\s\S]*$/m, ' ');
  // HTML comments, then HTML/JSX tags.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<[^>]*>/g, ' ');
  // Images before links, so the leading `!` doesn't leave alt text behind.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ');
  // Links / wikilinks → their visible text.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target, label) => label || target);
  // Inline code → its contents.
  text = text.replace(/`([^`]*)`/g, '$1');
  // Horizontal rules.
  text = text.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ');
  // Block markers at line start: headings, blockquotes, list bullets, ordered items.
  text = text.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  text = text.replace(/^[ \t]*>[ \t]?/gm, '');
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');
  // Footnote references and definitions.
  text = text.replace(/\[\^[^\]]*\]:?/g, '');
  // Emphasis / strong / strikethrough markers.
  text = text.replace(/(\*\*\*|\*\*|\*|___|__|_|~~)/g, '');
  // Kramdown inline attribute lists left over from the Jekyll migration
  // (e.g. `[text](url){:target="blank"}`), which markdown renders as prose.
  text = text.replace(/\{:[^}]*\}/g, '');
  // Table pipes.
  text = text.replace(/\|/g, ' ');

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Truncates to at most `maxLength` characters, cutting at a word boundary and
 * appending an ellipsis. Text already within the limit is returned unchanged
 * (no ellipsis). A single word longer than the limit is cut hard, since there
 * is no boundary to fall back to.
 */
export function truncateAtWord(text: string, maxLength: number = EXCERPT_MAX_LENGTH): string {
  if (text.length <= maxLength) return text;
  const window = text.slice(0, maxLength + 1);
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : text.slice(0, maxLength);
  return `${cut.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * A card's summary: the hand-written `description` when it has one, else a
 * truncated, markdown-stripped excerpt of its body. Returns `undefined` (never
 * `''`) when neither yields prose, so callers can use `?? ` / conditional
 * rendering and omit the tag entirely.
 */
export function resolveDescription(
  card: { description?: string },
  body?: string,
  maxLength: number = EXCERPT_MAX_LENGTH
): string | undefined {
  const handWritten = card.description?.trim();
  if (handWritten) return handWritten;

  if (!body) return undefined;
  const stripped = stripMarkdown(body);
  if (!stripped) return undefined;

  return truncateAtWord(stripped, maxLength);
}
