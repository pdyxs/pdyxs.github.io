// The contract every dimension must satisfy (issue #76, DEC-008).
//
// Each law corresponds to a bug the old hand-wiring either had or invited, so
// a new dimension that passes these can be registered without auditing the
// stations that fold over it.
//
// Vitest sets import.meta.env.DEV, so the dev-only status dimension is present
// in the registry here even though production never sees it.
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, hasAnySelection, toggleValue } from './registry';
import { filterStateFromParams, filterStateToParams, stripFilterParams } from './params';
import { encodeParam, decodeParam } from '../lib/param-codecs';
import { isValidFilterValue } from '../lib/five-w';
import type { CardMeta } from '../lib/cards';
import type { Dimension, DimensionSelection, NodeContext } from './types';
import { fakeCardMeta } from '../test/fixtures';

interface Fixture {
  /** A representative non-empty selection for this dimension. */
  selection: DimensionSelection;
  /** A single value belonging to this dimension, for toggle laws. */
  value: string;
  /** A card the selection above matches. */
  matching: CardMeta;
  /** Pool for nodes(). */
  nodeContext: NodeContext;
}

const cards = [
  fakeCardMeta({ uid: 'what/a', tags: ['what:projects/games', 'science'], status: 'draft' }),
  fakeCardMeta({ uid: 'what/b', tags: ['who:about', 'when:2020s'], status: 'published' }),
  fakeCardMeta({ uid: 'what/c', tags: ['where:europe', 'why:professional'] }),
];

function ctxFor(declaredValues: string[]): NodeContext {
  return { cards, declaredValues, display: {} };
}

const FIXTURES: Record<string, Fixture> = {
  what: {
    selection: ['what:projects'],
    value: 'what:projects',
    matching: cards[0],
    nodeContext: ctxFor(['what:projects', 'what:projects/games']),
  },
  who: {
    selection: ['who:about'],
    value: 'who:about',
    matching: cards[1],
    nodeContext: ctxFor(['who:about']),
  },
  when: {
    selection: ['when:2020s'],
    value: 'when:2020s',
    matching: cards[1],
    nodeContext: ctxFor(['when:2020s']),
  },
  where: {
    selection: ['where:europe'],
    value: 'where:europe',
    matching: cards[2],
    nodeContext: ctxFor(['where:europe']),
  },
  why: {
    selection: ['why:professional'],
    value: 'why:professional',
    matching: cards[2],
    nodeContext: ctxFor(['why:professional']),
  },
  '': {
    selection: ['science'],
    value: 'science',
    matching: cards[0],
    nodeContext: ctxFor([]),
  },
  status: {
    selection: 'draft',
    value: 'draft',
    matching: cards[0],
    nodeContext: ctxFor([]),
  },
};

const matchCtx = { cardBackedValues: new Set<string>() };

// ---------------------------------------------------------------------------
// Registry-level
// ---------------------------------------------------------------------------

describe('dimension registry', () => {
  it('every registered dimension has a contract fixture', () => {
    // Guards the suite itself: a dimension added without a fixture would
    // otherwise be silently skipped by describe.each below.
    expect(DIMENSIONS.map(d => d.id).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it('ids are unique', () => {
    const ids = DIMENSIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('at most one dimension claims the empty id', () => {
    expect(DIMENSIONS.filter(d => d.id === '')).toHaveLength(1);
  });

  it('registering status does not make status:draft a well-formed tag', () => {
    // isValidFilterValue binds to FIVE_W_DIMENSIONS, not the registry. If it
    // widened, collection-link and tag-registry would start treating
    // `status:draft` as real content tagging.
    expect(DIMENSIONS.some(d => d.id === 'status')).toBe(true);
    expect(isValidFilterValue('status:draft')).toBe(false);
  });

  it('the empty state is not active', () => {
    expect(hasAnySelection({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-dimension laws
// ---------------------------------------------------------------------------

describe.each(DIMENSIONS as Dimension<any>[])('dimension "$id"', (dimension) => {
  const fx = FIXTURES[dimension.id];

  it('an unselected dimension is the identity — it excludes nothing', () => {
    // applyFilters folds with .every(); a dimension that returned false here
    // would empty every result set the moment it was registered.
    for (const card of cards) {
      expect(dimension.matches(card, undefined, matchCtx)).toBe(true);
    }
  });

  it('matches a card its own fixture selection covers', () => {
    expect(dimension.matches(fx.matching, fx.selection, matchCtx)).toBe(true);
  });

  it('params round-trip', () => {
    const params = new URLSearchParams();
    for (const [k, v] of dimension.toParams(fx.selection)) params.append(k, v);
    expect(dimension.fromParams(params)).toEqual(fx.selection);
  });

  it('emits only keys it declares in paramKeys', () => {
    // What stripFilterParams got wrong by hand-listing keys.
    for (const [key] of dimension.toParams(fx.selection)) {
      expect(dimension.paramKeys).toContain(key);
    }
  });

  it('stripFilterParams removes everything it emits', () => {
    const params = filterStateToParams({ [dimension.id]: fx.selection });
    expect([...stripFilterParams(params)]).toEqual([]);
  });

  it('a full-state round-trip preserves this dimension', () => {
    const state = { [dimension.id]: fx.selection };
    expect(filterStateFromParams(filterStateToParams(state))).toEqual(state);
  });

  it('toggling the last value off yields undefined, never an empty selection', () => {
    // hasAnySelection reads truthiness — an empty array would show a phantom
    // chip bar with nothing in it and no way to dismiss it.
    const selected = dimension.toggle(undefined, fx.value);
    expect(selected).toBeDefined();
    expect(dimension.toggle(selected, fx.value)).toBeUndefined();
  });

  it('toggle is involutive through the registry helper', () => {
    const once = toggleValue({}, dimension.id, fx.value);
    expect(hasAnySelection(once)).toBe(true);
    expect(toggleValue(once, dimension.id, fx.value)).toEqual({});
  });

  it('values() reports what is selected without exposing the selection shape', () => {
    expect(dimension.values(undefined)).toEqual([]);
    expect(dimension.values(fx.selection)).toContain(fx.value);
  });

  it('every node it offers is stamped with its own id', () => {
    // The missing stamp is why the panel used to emit a bare string and the
    // receiver had to sniff a `status:` prefix back out of it.
    const walk = (nodes: ReturnType<Dimension<any>['nodes']>): void => {
      for (const node of nodes) {
        expect(node.dimensionId).toBe(dimension.id);
        walk(node.children);
      }
    };
    walk(dimension.nodes(fx.nodeContext));
  });

  it('every selectable node value is accepted by toggle', () => {
    const selectable = dimension
      .nodes(fx.nodeContext)
      .flatMap(function flatten(node): typeof node[] {
        return node.drillOnly ? node.children.flatMap(flatten) : [node];
      });
    for (const node of selectable) {
      expect(dimension.toggle(undefined, node.value)).toBeDefined();
    }
  });

  it('its params survive the stack codec', () => {
    const ctx = { tags: { codeForUid: () => undefined, uidForCode: () => undefined } };
    for (const [key, value] of dimension.toParams(fx.selection)) {
      // Unknown to the tag manifest here, so this exercises the raw fallback —
      // the path any dimension without its own codec always takes.
      expect(decodeParam(encodeParam(key, value, ctx), ctx)).toEqual([key, value]);
    }
  });
});
