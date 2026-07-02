// Pure logic for encoding/decoding the card navigation stack in filter page URLs.

const STACK_PARAM = 'stack';

/**
 * Appends the card stack UIDs to a filter URL as a `stack` query param.
 * Returns the URL unchanged if uids is empty.
 */
export function appendStackToUrl(uids: string[], filterUrl: string): string {
  if (uids.length === 0) return filterUrl;
  const sep = filterUrl.includes('?') ? '&' : '?';
  return `${filterUrl}${sep}${STACK_PARAM}=${encodeURIComponent(uids.join(','))}`;
}

/**
 * Reads card UIDs from the `stack` URL search param.
 * Returns an empty array if the param is absent.
 */
export function stackFromParams(params: URLSearchParams): string[] {
  const value = params.get(STACK_PARAM);
  if (!value) return [];
  return value.split(',').filter(Boolean);
}

/**
 * Builds the card page URL for navigating to `stack[activeIndex]`.
 * Cards before activeIndex become `from`, cards after become `to`.
 */
export function buildCardUrl(stack: string[], activeIndex: number): string {
  const activeUid = stack[activeIndex];
  const fromUids = stack.slice(0, activeIndex);
  const toUids = stack.slice(activeIndex + 1);

  const params = new URLSearchParams();
  if (fromUids.length) params.set('from', fromUids.join(','));
  if (toUids.length) params.set('to', toUids.join(','));

  const query = params.toString();
  return query ? `/card/${activeUid}?${query}` : `/card/${activeUid}`;
}
