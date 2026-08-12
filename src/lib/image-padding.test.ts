import { describe, it, expect } from 'vitest';
import {
  parsePadSpec,
  resolvePadPixels,
  chooseBackground,
  planCardPadding,
  planImagePadding,
  summarise,
  type PadCandidate,
} from './image-padding.ts';

const card = (over: Partial<PadCandidate> = {}): PadCandidate => ({
  uid: 'what/puzzles/convergent-clues/cityscrapers',
  image: 'bild.png',
  hasOriginal: false,
  hasCurrent: true,
  ...over,
});

describe('parsePadSpec', () => {
  it('reads percentages and pixels', () => {
    expect(parsePadSpec('5%')).toEqual({ unit: 'percent', value: 5 });
    expect(parsePadSpec('40px')).toEqual({ unit: 'px', value: 40 });
    expect(parsePadSpec('2.5%')).toEqual({ unit: 'percent', value: 2.5 });
  });

  it('treats a bare number as pixels', () => {
    expect(parsePadSpec(40)).toEqual({ unit: 'px', value: 40 });
    expect(parsePadSpec('40')).toEqual({ unit: 'px', value: 40 });
  });

  it('tolerates surrounding and internal whitespace', () => {
    expect(parsePadSpec('  5 % ')).toEqual({ unit: 'percent', value: 5 });
  });

  it('returns null for anything it cannot read, rather than guessing zero', () => {
    expect(parsePadSpec('5em')).toBeNull();
    expect(parsePadSpec('lots')).toBeNull();
    expect(parsePadSpec('')).toBeNull();
    expect(parsePadSpec(undefined)).toBeNull();
    expect(parsePadSpec(null)).toBeNull();
  });
});

describe('resolvePadPixels', () => {
  it('resolves pixels as themselves', () => {
    expect(resolvePadPixels({ unit: 'px', value: 40 }, 1000, 1000)).toBe(40);
  });

  it('resolves a percentage against the longer side, so the border stays even', () => {
    // 5% of the 1000px height, on all four sides of a 667-wide image — not 33px
    // beside and 50px above.
    expect(resolvePadPixels({ unit: 'percent', value: 5 }, 667, 1000)).toBe(50);
    expect(resolvePadPixels({ unit: 'percent', value: 5 }, 1000, 667)).toBe(50);
  });

  it('rounds to whole pixels', () => {
    expect(resolvePadPixels({ unit: 'percent', value: 2.5 }, 805, 805)).toBe(20);
  });
});

describe('chooseBackground', () => {
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const black = { r: 0, g: 0, b: 0, alpha: 1 };

  it('extends the image ground when all four corners agree', () => {
    expect(chooseBackground([black, black, black, black])).toEqual(black);
  });

  it('falls back to white when the corners disagree', () => {
    expect(chooseBackground([white, black, white, white])).toEqual(white);
  });

  it('treats a differing alpha as disagreement', () => {
    const clear = { r: 255, g: 255, b: 255, alpha: 0 };
    expect(chooseBackground([white, white, white, clear])).toEqual(white);
    expect(chooseBackground([clear, clear, clear, clear])).toEqual(clear);
  });

  it('falls back to white with nothing to sample', () => {
    expect(chooseBackground([])).toEqual(white);
  });
});

describe('planCardPadding', () => {
  it('skips a card that has never opted in', () => {
    expect(planCardPadding(card())).toEqual({ action: 'skip', uid: card().uid });
  });

  it('adopts the current file as the original on first opt-in', () => {
    const plan = planCardPadding(card({ imagePad: '5%' }));
    expect(plan).toMatchObject({ action: 'pad', adopt: true, spec: { unit: 'percent', value: 5 } });
  });

  it('pads from the stored original once one exists', () => {
    const plan = planCardPadding(card({ imagePad: '5%', hasOriginal: true }));
    expect(plan).toMatchObject({ action: 'pad', adopt: false });
  });

  it('re-pads from the original rather than compounding, whatever the value', () => {
    // The point of keeping _original/: changing 5% to 8% is a fresh pad of the
    // untouched source, not 8% added to an already-padded file.
    const first = planCardPadding(card({ imagePad: '5%', hasOriginal: true }));
    const second = planCardPadding(card({ imagePad: '8%', hasOriginal: true }));
    expect(first).toMatchObject({ action: 'pad', adopt: false });
    expect(second).toMatchObject({ action: 'pad', adopt: false, spec: { unit: 'percent', value: 8 } });
  });

  it('restores the original when imagePad is removed', () => {
    const plan = planCardPadding(card({ hasOriginal: true }));
    expect(plan).toEqual({ action: 'restore', uid: card().uid, image: 'bild.png' });
  });

  it('restores the original when imagePad is explicitly zero', () => {
    const plan = planCardPadding(card({ imagePad: '0', hasOriginal: true }));
    expect(plan).toMatchObject({ action: 'restore' });
    expect(planCardPadding(card({ imagePad: '0%', hasOriginal: true }))).toMatchObject({
      action: 'restore',
    });
  });

  it('treats an explicit zero with no original as nothing to do', () => {
    expect(planCardPadding(card({ imagePad: '0' }))).toMatchObject({ action: 'skip' });
  });

  it('reports an unreadable value instead of silently doing nothing', () => {
    const plan = planCardPadding(card({ imagePad: '5em' }));
    expect(plan).toMatchObject({ action: 'error' });
    expect((plan as { reason: string }).reason).toContain('5em');
  });

  it('reports imagePad on a card with no image', () => {
    expect(planCardPadding(card({ imagePad: '5%', image: undefined }))).toMatchObject({
      action: 'error',
    });
  });

  it('reports imagePad on a remote image, which it cannot rewrite', () => {
    const plan = planCardPadding(card({ imagePad: '5%', image: 'https://example.com/a.png' }));
    expect(plan).toMatchObject({ action: 'error' });
  });

  it('reports a missing file rather than writing one', () => {
    const plan = planCardPadding(card({ imagePad: '5%', hasCurrent: false }));
    expect(plan).toMatchObject({ action: 'error' });
  });
});

describe('planImagePadding', () => {
  it('plans every candidate in input order', () => {
    const plans = planImagePadding([
      card({ uid: 'a', imagePad: '5%' }),
      card({ uid: 'b' }),
      card({ uid: 'c', imagePad: 'nonsense' }),
    ]);
    expect(plans.map((p) => [p.uid, p.action])).toEqual([
      ['a', 'pad'],
      ['b', 'skip'],
      ['c', 'error'],
    ]);
  });
});

describe('summarise', () => {
  it('counts each outcome and carries the reasons through', () => {
    const summary = summarise(
      planImagePadding([
        card({ uid: 'a', imagePad: '5%' }),
        card({ uid: 'b' }),
        card({ uid: 'c', hasOriginal: true }),
        card({ uid: 'd', imagePad: 'nonsense' }),
      ])
    );
    expect(summary).toMatchObject({ padded: 1, restored: 1, skipped: 1 });
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].uid).toBe('d');
  });
});
