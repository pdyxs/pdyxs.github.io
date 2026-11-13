// The editor pages' URLs. Pure: the shell and the dev-server rewrite both read
// a card out of the path with `parseEditorPath`, so the two cannot disagree.
//
// An open card's path mirrors its page on the site: the card at `/card/<dir>`
// is edited at `/dev/editors/<editor>/<dir>`.

export const EDITORS_ROUTE = '/dev/editors';

/** Custom HMR event the dev server sends when a card's index.json changes. Payload `{ dir }`. */
export const DATA_CHANGED_EVENT = 'dev-editors:data-changed';

/** Whether a page is an editor page, which must not reload when the card data it is saving changes. */
export const isEditorPage = (pathname: string) => pathname === EDITORS_ROUTE || pathname.startsWith(`${EDITORS_ROUTE}/`);

export function editorUrl(editorId: string, dir = ''): string {
  return dir ? `${EDITORS_ROUTE}/${editorId}/${dir}` : `${EDITORS_ROUTE}/${editorId}`;
}

/** The editor and card (`''` for none) a path names, or null if it is not an editor page. */
export function parseEditorPath(pathname: string, editorIds: readonly string[]): { editorId: string; dir: string } | null {
  if (!pathname.startsWith(`${EDITORS_ROUTE}/`)) return null;
  const segments = pathname.slice(EDITORS_ROUTE.length + 1).split('/').filter((s) => s !== '');
  const [editorId, ...rest] = segments;
  if (!editorId || !editorIds.includes(editorId)) return null;
  let dir: string;
  try {
    dir = rest.map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  return { editorId, dir };
}
