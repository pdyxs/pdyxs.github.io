// The "go do it" links a card shows in its masthead band.
//
// Most cards author these directly as `actions:` rows. Puzzles don't: they
// carry `sudokupad_url` (where you play it) and `url` (its Logic Masters
// Deutschland page) as named fields, because both are load-bearing elsewhere —
// `url` is the identity a puzzle's LMD page is fetched by, and `sudokupad_url`
// is what the play link resolves to. Rather than duplicate each as an authored
// action row, they fold in here, exactly as `medium`/`when`/`roles` fold into
// meta rows in card-meta.ts.
//
// Pure: takes frontmatter data, returns display actions. No IO, no Astro.

/**
 * What an action *is*, independent of how its label is worded.
 *
 * The 13 cards that carry actions word them 16 different ways ("Play it",
 * "Play on iOS", "Download on Steam", "Get on the iOS App Store", "Use the
 * simulator"), so anything downstream that wants to know "can I go and do this
 * right now?" would otherwise have to regex prose — a heuristic that rots
 * silently as new labels are written. `kind` states the intent once, at
 * authoring time, and the `why:*` generators read it (see why-tags.ts).
 *
 * The five kinds, and the rulings that keep them apart:
 *
 *  - `play`   — go and use the thing itself. Includes app-store and Steam
 *               links: for a piece of software the store *is* the way to play
 *               it, so a store link is a play link, not a purchase.
 *  - `buy`    — the destination exists to sell you an object you don't get by
 *               playing (the Ko-fi shop's printed copy). One action today.
 *  - `read`   — writing *about* the thing: a case study, a postmortem.
 *  - `source` — the code.
 *  - `site`   — the thing's own home on the web (or its publisher's), where
 *               there is something to look at but nothing specific to do.
 *
 * Optional: an unkinded action still renders, it just tells the generators
 * nothing.
 */
export const ACTION_KINDS = ['play', 'buy', 'read', 'source', 'site'] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface Action {
  text: string;
  url: string;
  kind?: ActionKind;
}

export interface ActionSource {
  actions?: Action[];
  /** Puzzles: the playable SudokuPad link. */
  sudokupad_url?: string;
  /** Puzzles: the Logic Masters Deutschland page the puzzle was published on. */
  url?: string;
}

/**
 * Resolve a card's action links.
 *
 * The play link leads — it is what a reader is on a puzzle card to do — then
 * the card's own authored actions, then the source page it was published on.
 * A puzzle with no `sudokupad_url` plays on its LMD page instead, so that URL
 * becomes the play link rather than appearing twice.
 *
 * Actions missing either half are dropped: a label with no destination is not
 * a link, and a bare URL has nothing to read.
 */
export function resolveActions(data: ActionSource | undefined): Action[] {
  if (!data) return [];

  const actions: Action[] = [];

  const playUrl = data.sudokupad_url ?? data.url;
  if (playUrl) actions.push({ text: 'Play', url: playUrl, kind: 'play' });

  for (const action of data.actions ?? []) {
    if (action?.text && action?.url) {
      actions.push({ text: action.text, url: action.url, ...(action.kind ? { kind: action.kind } : {}) });
    }
  }

  // The LMD page is where the puzzle was published, not where it's solved —
  // the solvable link is already above as `play`.
  if (data.url && data.url !== playUrl) {
    actions.push({ text: 'LMD', url: data.url, kind: 'site' });
  }

  return actions;
}
