import { describe, expect, it } from 'vitest';
import {
  computeStripOverflow,
  computeStripDots,
  computeThumbGeometry,
  scrollLeftForFraction,
  stripScrollStep,
} from './card-strip';

describe('computeStripOverflow', () => {
  it('reports no overflow when the content fits', () => {
    expect(computeStripOverflow({ scrollLeft: 0, scrollWidth: 600, clientWidth: 600 })).toEqual({
      canScrollBack: false,
      canScrollOn: false,
    });
  });

  it('offers only forward at the start of an overflowing strip', () => {
    expect(computeStripOverflow({ scrollLeft: 0, scrollWidth: 2800, clientWidth: 600 })).toEqual({
      canScrollBack: false,
      canScrollOn: true,
    });
  });

  it('offers both controls in the middle', () => {
    expect(computeStripOverflow({ scrollLeft: 600, scrollWidth: 2800, clientWidth: 600 })).toEqual({
      canScrollBack: true,
      canScrollOn: true,
    });
  });

  it('offers only back at the end', () => {
    expect(computeStripOverflow({ scrollLeft: 2200, scrollWidth: 2800, clientWidth: 600 })).toEqual({
      canScrollBack: true,
      canScrollOn: false,
    });
  });

  it('tolerates sub-pixel drift at both ends', () => {
    // Fractional scroll metrics are the norm at non-integer device pixel
    // ratios; without slack the forward control stays live forever.
    expect(
      computeStripOverflow({ scrollLeft: 0.4, scrollWidth: 2800.6, clientWidth: 600 }),
    ).toEqual({ canScrollBack: false, canScrollOn: true });

    expect(
      computeStripOverflow({ scrollLeft: 2200.4, scrollWidth: 2800.6, clientWidth: 600 }),
    ).toEqual({ canScrollBack: true, canScrollOn: false });
  });
});

describe('stripScrollStep', () => {
  it('advances just under a viewport so the edge card stays partly visible', () => {
    expect(stripScrollStep(600)).toBe(480);
  });

  it('floors the step for a strip narrower than a single card', () => {
    expect(stripScrollStep(120)).toBe(200);
  });
});

describe('computeThumbGeometry', () => {
  it('fills the track when nothing overflows', () => {
    expect(computeThumbGeometry({ scrollLeft: 0, scrollWidth: 600, clientWidth: 600 })).toEqual({
      leftPct: 0,
      widthPct: 100,
    });
  });

  it('sizes the thumb as the viewport fraction of the content', () => {
    const g = computeThumbGeometry({ scrollLeft: 0, scrollWidth: 2400, clientWidth: 600 });
    expect(g).toEqual({ leftPct: 0, widthPct: 25 });
  });

  it('lands exactly on the right edge at maximum scroll', () => {
    // scrollLeft + clientWidth === scrollWidth is the end of travel; left+width
    // must total 100 or the thumb visibly stops short.
    const g = computeThumbGeometry({ scrollLeft: 1800, scrollWidth: 2400, clientWidth: 600 });
    expect(g.leftPct + g.widthPct).toBe(100);
  });

  it('never lets the thumb escape the track', () => {
    const g = computeThumbGeometry({ scrollLeft: 99999, scrollWidth: 2400, clientWidth: 600 });
    expect(g.leftPct + g.widthPct).toBeLessThanOrEqual(100);
  });

  it('survives an unmeasured scroller', () => {
    expect(computeThumbGeometry({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })).toEqual({
      leftPct: 0,
      widthPct: 100,
    });
  });
});

describe('computeStripDots', () => {
  const cards = [
    { start: 0, end: 600 },
    { start: 600, end: 1200 },
    { start: 1200, end: 1800 },
    { start: 1800, end: 2400 },
  ];
  const metrics = { scrollLeft: 0, scrollWidth: 2400, clientWidth: 600 };

  it('places a dot at each card centre, in the same space as the thumb', () => {
    const dots = computeStripDots(cards, metrics);
    expect(dots.map(d => d.leftPct)).toEqual([12.5, 37.5, 62.5, 87.5]);
    // The first dot must fall inside the thumb, since card one is in view.
    const thumb = computeThumbGeometry(metrics);
    expect(dots[0].leftPct).toBeGreaterThan(thumb.leftPct);
    expect(dots[0].leftPct).toBeLessThan(thumb.leftPct + thumb.widthPct);
  });

  it('does not move a dot when the strip scrolls — only the thumb moves', () => {
    // Dots are anchored to content, not to the viewport. This is what lets the
    // thumb pass over them to show what's in view.
    const atRest = computeStripDots(cards, metrics);
    const scrolled = computeStripDots(cards, { ...metrics, scrollLeft: 300 });
    expect(scrolled).toEqual(atRest);
  });

  it('carries no visibility state — the dot reads on both surfaces', () => {
    // A card that is only partly in view has its centre outside the thumb, so
    // any per-dot "visible" styling would paint it for the wrong surface.
    expect(Object.keys(computeStripDots(cards, metrics)[0])).toEqual(['leftPct']);
  });

  it('returns nothing for an unmeasured scroller', () => {
    expect(computeStripDots(cards, { scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })).toEqual([]);
  });
});

describe('scrollLeftForFraction', () => {
  it('maps a track fraction onto content position', () => {
    expect(scrollLeftForFraction(0.25, { scrollWidth: 2400, clientWidth: 600 })).toBe(600);
  });

  it('clamps past the end to the last scroll position', () => {
    expect(scrollLeftForFraction(1, { scrollWidth: 2400, clientWidth: 600 })).toBe(1800);
  });

  it('clamps a drag past the start to zero', () => {
    expect(scrollLeftForFraction(-0.5, { scrollWidth: 2400, clientWidth: 600 })).toBe(0);
  });
});
