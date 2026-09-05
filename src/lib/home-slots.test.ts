import { describe, it, expect } from 'vitest';
import { parseHomeSlots, resolveSlotSpans, resolveSlotRows } from './home-slots';

// ---------------------------------------------------------------------------
// The tier cascade
//
// Both resolvers are the same function shape by design — two keys sitting
// beside each other in the same slot must not read differently — so the table
// is asserted for both, including the `{large}`-only case where each falls back
// to its OWN base (12 columns, 1 row).
// ---------------------------------------------------------------------------

describe('resolveSlotSpans / resolveSlotRows', () => {
  const cases = [
    { declared: undefined, spans: { small: 12, large: 12 }, rows: { small: 1, large: 1 } },
    { declared: 6, spans: { small: 6, large: 6 }, rows: { small: 6, large: 6 } },
    { declared: { small: 7 }, spans: { small: 7, large: 7 }, rows: { small: 7, large: 7 } },
    { declared: { large: 4 }, spans: { small: 12, large: 4 }, rows: { small: 1, large: 4 } },
    { declared: { small: 5, large: 4 }, spans: { small: 5, large: 4 }, rows: { small: 5, large: 4 } },
    { declared: {}, spans: { small: 12, large: 12 }, rows: { small: 1, large: 1 } },
  ];

  for (const { declared, spans, rows } of cases) {
    it(`spans: ${JSON.stringify(declared)} -> ${JSON.stringify(spans)}`, () => {
      expect(resolveSlotSpans(declared as never)).toEqual(spans);
    });
    it(`rows: ${JSON.stringify(declared)} -> ${JSON.stringify(rows)}`, () => {
      expect(resolveSlotRows(declared as never)).toEqual(rows);
    });
  }
});

// ---------------------------------------------------------------------------
// parseHomeSlots
// ---------------------------------------------------------------------------

describe('parseHomeSlots', () => {
  it('normalises a bare `uid:` slot to every default', () => {
    expect(parseHomeSlots({ slots: [{ uid: 'who/about-me' }] })).toEqual([
      {
        uid: 'who/about-me',
        span: { small: 12, large: 12 },
        rows: { small: 1, large: 1 },
        side: 'main',
        variant: 'full',
        seeMore: false,
      },
    ]);
  });

  // span: 12 / rows: 1 as defaults are what make the layout feature opt-in:
  // an unmodified slot list renders as the old stacked single column.
  it('gives an unspanned slot the full 12 columns at every tier', () => {
    const [slot] = parseHomeSlots({ slots: [{ filter: { what: ['what:puzzles'] } }] });
    expect(slot.span).toEqual({ small: 12, large: 12 });
    expect(slot.rows).toEqual({ small: 1, large: 1 });
  });

  // pool is deliberately NOT defaulted here — DEFAULT_SLOT_POOL lives in
  // slot-selection.ts, which this leaf module must not import. One default,
  // one place: selectSlotCard applies it.
  it('leaves pool undefined when the slot declares none', () => {
    const [slot] = parseHomeSlots({ slots: [{ filter: { what: ['what:puzzles'] } }] });
    expect(slot.pool).toBeUndefined();
    expect('pool' in slot).toBe(false);
  });

  it('keeps a declared pool', () => {
    const [slot] = parseHomeSlots({ slots: [{ filter: { what: ['what:puzzles'] }, pool: 3 }] });
    expect(slot.pool).toBe(3);
  });

  // .strict() is load-bearing: zod STRIPS unknown keys silently, so without it
  // `spann: 4` would be a slot that quietly ignores its own layout — the same
  // hazard CLAUDE.md records for `priorty:` and `imagePadding:`.
  it('rejects a typo\'d key rather than stripping it', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', spann: 4 }] })).toThrow(/spann/);
  });

  // A union's error collapses to "Invalid input" — zod can't say which branch
  // was meant — so what the message names is the slot and the key, which is
  // enough to find it. The rejection itself is the point.
  it('rejects an unknown key inside a span mapping', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', span: { medium: 4 } }] })).toThrow(
      /slot 1 \(`span`\)/,
    );
  });

  it('rejects a span outside 1..12', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', span: 13 }] })).toThrow(/slot 1/);
  });

  it('rejects `side: left` rather than silently ignoring it', () => {
    // A one-member enum, not `rail: true` — so a wrong value is a validation
    // error rather than a no-op, and the enum extends later without a rename.
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', side: 'left' }] })).toThrow(/slot 1/);
  });

  it('rejects an unrecognised variant at generation time', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', variant: 'tiny' }] })).toThrow(/slot 1/);
  });

  // Both refinements name the mistake, with the offending slot's 1-based
  // number — that was #129's deciding criterion for validating here at all.
  it('rejects a slot declaring both uid and filter, naming the slot', () => {
    expect(() =>
      parseHomeSlots({ slots: [{ uid: 'a' }, { uid: 'b', filter: { what: ['x'] } }] }),
    ).toThrow(/slot 2 declares both `uid:` and `filter:`/);
  });

  it('rejects a slot declaring neither, naming the slot', () => {
    expect(() => parseHomeSlots({ slots: [{ label: 'A Post' }] })).toThrow(
      /slot 1 declares neither `uid:` nor `filter:`/,
    );
  });

  it('rejects seeMore on a uid slot, which has no filter to point at', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', seeMore: true }] })).toThrow(
      /slot 1 declares `seeMore:` on a `uid:` slot/,
    );
  });

  it('rejects pool on a uid slot, which selects no card', () => {
    expect(() => parseHomeSlots({ slots: [{ uid: 'a', pool: 2 }] })).toThrow(
      /slot 1 declares `pool:` on a `uid:` slot/,
    );
  });

  it('accepts the full authored shape and normalises every tiered key', () => {
    expect(
      parseHomeSlots({
        slots: [
          {
            filter: { what: ['what:games', 'what:art'] },
            pool: 5,
            span: { small: 5, large: 4 },
            side: 'right',
            rows: 2,
            variant: 'full',
            label: 'A Project',
            seeMore: true,
          },
        ],
      }),
    ).toEqual([
      {
        filter: { what: ['what:games', 'what:art'] },
        pool: 5,
        span: { small: 5, large: 4 },
        rows: { small: 2, large: 2 },
        side: 'right',
        variant: 'full',
        label: 'A Project',
        seeMore: true,
      },
    ]);
  });

  it('accepts an empty slot list', () => {
    expect(parseHomeSlots({ slots: [] })).toEqual([]);
  });
});
