import { describe, it, expect } from 'vitest';
import { buildStatusFacetNode, STATUS_FACET_VALUE, STATUS_LEAF_PREFIX } from './status-facet-node';
import { STATUS_VALUES } from './status-visibility';
import { isValidFilterValue as isValidDimensionValue } from './filters';
import type { CardMeta } from './cards';

// Minimal CardMeta stub — buildStatusFacetNode only reads `.status`.
function card(status: string): CardMeta {
  return { status } as unknown as CardMeta;
}

describe('buildStatusFacetNode', () => {
  it('is a drillOnly parent using the bare sentinel value', () => {
    const node = buildStatusFacetNode([]);
    expect(node.value).toBe(STATUS_FACET_VALUE);
    expect(node.drillOnly).toBe(true);
    expect(node.declared).toBe(true);
    expect(node.name).toBe('Status');
  });

  it('the sentinel value is not a valid `dimension:value`, so it never matches a card', () => {
    // Guards the whole design: 'status' must fall outside the tag-filter shape
    // so applyFilters/prefix-matching can never treat it as a real selection.
    expect(isValidDimensionValue(STATUS_FACET_VALUE)).toBe(false);
  });

  it('emits one leaf per status value, even zero-count ones', () => {
    const node = buildStatusFacetNode([card('published')]);
    expect(node.children.map(c => c.label)).toEqual([...STATUS_VALUES]);
    for (const child of node.children) {
      expect(child.value).toBe(`${STATUS_LEAF_PREFIX}${child.label}`);
      expect(child.declared).toBe(true);
      expect(child.children).toEqual([]);
    }
  });

  it('counts cards per resolved status', () => {
    const node = buildStatusFacetNode([
      card('draft'), card('draft'), card('published'), card('archived'),
    ]);
    const counts = Object.fromEntries(node.children.map(c => [c.label, c.count]));
    expect(counts.draft).toBe(2);
    expect(counts.published).toBe(1);
    expect(counts.archived).toBe(1);
    expect(counts.scheduled).toBe(0);
  });

  it('leaf values are outside the dimension tag namespace', () => {
    // A `status:draft` leaf must not read as a valid `dimension:value` tag.
    for (const child of buildStatusFacetNode([]).children) {
      expect(isValidDimensionValue(child.value)).toBe(false);
    }
  });
});
