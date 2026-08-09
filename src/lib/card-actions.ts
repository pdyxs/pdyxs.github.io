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

export interface Action {
  text: string;
  url: string;
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
  if (playUrl) actions.push({ text: 'Play', url: playUrl });

  for (const action of data.actions ?? []) {
    if (action?.text && action?.url) actions.push({ text: action.text, url: action.url });
  }

  if (data.url && data.url !== playUrl) {
    actions.push({ text: 'LMD', url: data.url });
  }

  return actions;
}
