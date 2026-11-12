import { describe, it, expect } from 'vitest';
import { frontmatterPlan, applyFrontmatterPlan } from './frontmatter-plan.ts';

const FM = { headerMedia: 'particulars' };

describe('frontmatterPlan', () => {
  it('marks an absent property missing', () => {
    expect(frontmatterPlan('---\ntitle: "x"\n---\nbody', FM)).toEqual({ headerMedia: { kind: 'missing' } });
  });
  it('marks an equal value matches, ignoring quotes and trailing comments', () => {
    expect(frontmatterPlan('---\nheaderMedia: "particulars" # toy\n---\n', FM)).toEqual({ headerMedia: { kind: 'matches' } });
  });
  it('names old and new on a conflict', () => {
    expect(frontmatterPlan('---\nheaderMedia: flash-game\n---\n', FM)).toEqual({
      headerMedia: { kind: 'conflicts', old: 'flash-game', new: 'particulars' },
    });
  });
  it('treats text with no frontmatter block as all missing', () => {
    expect(frontmatterPlan('just body', FM)).toEqual({ headerMedia: { kind: 'missing' } });
  });
  it('compares numbers and booleans as text', () => {
    expect(frontmatterPlan('---\nn: 3\nb: true\n---\n', { n: 3, b: true })).toEqual({ n: { kind: 'matches' }, b: { kind: 'matches' } });
  });
});

describe('applyFrontmatterPlan', () => {
  const ORIGINAL = '---\n# lead comment\ntitle: "Demo" # keep\nheaderMedia: flash-game\ninspected: true\ntags: [a]\n---\nbody\n';
  it('replaces conflicts in place, appends missing, sets inspected false, preserving everything else', () => {
    const fm = { headerMedia: 'particulars', extra: 'x y' };
    const out = applyFrontmatterPlan(ORIGINAL, fm, frontmatterPlan(ORIGINAL, fm));
    expect(out).toBe('---\n# lead comment\ntitle: "Demo" # keep\nheaderMedia: particulars\ninspected: false\ntags: [a]\nextra: "x y"\n---\nbody\n');
  });
  it('drops continuation lines of a replaced multi-line value', () => {
    const text = '---\nheaderMedia:\n  - a\n  - b\ntitle: t\n---\n';
    expect(applyFrontmatterPlan(text, FM, frontmatterPlan(text, FM))).toBe('---\ninspected: false\nheaderMedia: particulars\ntitle: t\n---\n');
  });
  it('returns the text unchanged when everything matches', () => {
    const text = '---\nheaderMedia: particulars\ninspected: true\n---\n';
    expect(applyFrontmatterPlan(text, FM, frontmatterPlan(text, FM))).toBe(text);
  });
  it('creates a frontmatter block when there is none', () => {
    expect(applyFrontmatterPlan('body\n', FM, frontmatterPlan('body\n', FM))).toBe('---\ninspected: false\nheaderMedia: particulars\n---\nbody\n');
  });
});
