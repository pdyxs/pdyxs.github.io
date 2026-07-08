// Pure logic for encoding/decoding the card navigation stack in filter page URLs.

import { serialiseStack } from './stack-codec';
import { cardEntry } from './stack-layout';
import type { StackState } from './stack-layout';
import { manifestLookup } from './stack-manifest-client';
import { tagManifestLookup } from './tag-manifest-client';

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
 * Cards before activeIndex become `from`, cards after become `to`, encoded
 * via the same stack codec + manifest CardStack.svelte uses — so links built
 * here decode correctly once the user lands on the card page.
 */
export function buildCardUrl(stack: string[], activeIndex: number): string {
  const state: StackState = {
    entries: stack.map(cardEntry),
    activeKey: stack[activeIndex],
  };
  const { path, search } = serialiseStack(state, new Map(), manifestLookup, tagManifestLookup);
  return `${path}${search}`;
}
