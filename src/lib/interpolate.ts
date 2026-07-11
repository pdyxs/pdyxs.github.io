// Minimal Mustache-subset interpolator — no dependency, variables only.
//
// Powers `cardDescriptionParts` (folder-config.ts): a folder declares a list of
// small templates, each rendered against a card's frontmatter to synthesise a
// fallback description when the card supplies none.

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Replaces `{{ key }}` placeholders in `template` with values from `data`.
 *
 * Returns `undefined` if ANY referenced placeholder resolves to a missing,
 * empty, or non-scalar value — so a caller can drop the whole part rather than
 * render a template with a hole in it (e.g. a puzzle with no `puzzle_type`
 * drops its `"{{puzzle_type}}"` part entirely instead of showing an empty one).
 *
 * Only strings (non-empty after trimming) and finite numbers count as
 * resolvable scalars. A template with no placeholders resolves to itself.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>,
): string | undefined {
  let missing = false;
  const out = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim() !== '') return value;
    missing = true;
    return '';
  });
  return missing ? undefined : out;
}
