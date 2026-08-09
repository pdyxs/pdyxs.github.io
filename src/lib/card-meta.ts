// The credit/fact rows shown on a card ("Medium: Video Game", "Accolades: …").
//
// Ported from the retired Jekyll site's `definitions:` list, which was an
// open-ended array of {head, text|texts|links} — 22 distinct heads across 25
// cards, most used once or twice. The Astro migration originally flattened it
// to three named fields (`medium`, `when`, `roles`) and dropped the rest; this
// restores the list, keeping those three as authoring shorthands.
//
// The authored shape is uniform on purpose — one row is always
// `{ label, values: string[] }` — so it maps onto a Metadata Menu Object List
// (see the `metaRow` comment in content.config.ts). Links live inside the
// strings as ordinary markdown links and are parsed back out here.
//
// Pure: takes frontmatter data, returns display rows. No IO, no Astro.

import { parseDifficultyLevel, formatDifficultyStars, difficultyAriaLabel } from './difficulty';

/** One item inside a row's value — plain text, or text carrying a link. */
export interface MetaItem {
  text: string;
  url?: string;
  /**
   * Spoken form, when `text` is a glyph rather than words (the difficulty star
   * row). Renders as an `aria-label` on a `role="img"` wrapper so a screen
   * reader says "Difficulty 3 out of 5" instead of five star characters.
   */
  ariaLabel?: string;
}

/** A resolved row, ready to render. `items` is never empty. */
export interface MetaRow {
  label: string;
  items: MetaItem[];
}

/** A row as authored in frontmatter (see `metaRow` in content.config.ts). */
export interface RawMetaRow {
  label: string;
  values?: string[];
}

export interface MetaSource {
  medium?: string;
  when?: string;
  roles?: string;
  puzzle_type?: string;
  difficulty?: string;
  meta?: RawMetaRow[];
}

// The named shorthands, in the order they lead the row list: the legacy Jekyll
// three first (work-history cards opened with When/Roles, project cards with
// Medium), then the puzzle pair. `puzzle_type` and `difficulty` are named
// fields rather than authored `meta` rows because every puzzle has a
// difficulty and it also feeds the folder's `cardDescriptionParts` template —
// which reads frontmatter, not resolved rows.
const LEGACY_FIELDS: ReadonlyArray<readonly [keyof MetaSource, string]> = [
  ['when', 'When'],
  ['medium', 'Medium'],
  ['roles', 'Roles'],
  ['puzzle_type', 'Type'],
  ['difficulty', 'Difficulty'],
];

// A whole value that is exactly one markdown link, e.g.
// "[Libby Heaney](http://libbyheaney.co.uk/)". Anchored deliberately: a value
// that merely *contains* a link ("Made at [Qiskit Camp](…) in Zurich") is left
// as literal text rather than silently losing its surrounding words.
const WHOLE_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/**
 * Turn one authored value string into a display item, unwrapping a markdown
 * link if the whole string is one.
 */
export function parseMetaItem(value: string): MetaItem {
  const text = value.trim();
  const match = WHOLE_LINK.exec(text);
  return match ? { text: match[1].trim(), url: match[2] } : { text };
}

/**
 * Fold the legacy shorthand fields into the authored `meta` list and parse each
 * row's values into display items.
 *
 * Rows with no label or no usable value are dropped rather than rendered as an
 * empty definition — a blank `<dd>` reads as a missing fact, not an absent one.
 */
export function resolveMetaRows(data: MetaSource | undefined): MetaRow[] {
  if (!data) return [];

  const rows: MetaRow[] = [];

  for (const [field, label] of LEGACY_FIELDS) {
    const value = data[field];
    if (typeof value !== 'string' || !value.trim()) continue;

    // Difficulty is a rating, not a phrase: "Level 3 (Medium)" reads as stars.
    // An unparseable string falls through to its authored text rather than
    // being dropped or guessed at — see parseDifficultyLevel.
    if (field === 'difficulty') {
      const level = parseDifficultyLevel(value);
      if (level !== undefined) {
        rows.push({
          label,
          items: [{ text: formatDifficultyStars(level), ariaLabel: difficultyAriaLabel(level) }],
        });
        continue;
      }
    }

    rows.push({ label, items: [parseMetaItem(value)] });
  }

  for (const raw of data.meta ?? []) {
    if (!raw?.label?.trim()) continue;
    const items = (raw.values ?? [])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map(parseMetaItem);
    if (items.length === 0) continue;
    rows.push({ label: raw.label.trim(), items });
  }

  return rows;
}
