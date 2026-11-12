// The bench's own tests. They live beside the bench, not in
// src/lib/site/mark/tools.test.ts, because src/experiments/ never reaches
// `main` (MAIN_NEVER in src/lib/site/promotion.ts) and a test there that
// imported it would fail.
import { describe, it, expect } from 'vitest';
import { MARK_RIG } from '@data/mark-rig';
import { MARK_ICONS } from '@data/mark-icons';
import { BUILT_IN } from '@site/mark-tools';
import { flattenTools, validateTools } from '@site/mark/tools';
import { PROOF_BEHAVIOURS, PROOF_TOOLS } from './mark-tools-proof';

describe('the mark-tools bench', () => {
  const icons = Object.keys(MARK_ICONS);

  it('its config is sound against the production registry plus its own behaviours', () => {
    const behaviours = [...Object.keys(BUILT_IN), ...Object.keys(PROOF_BEHAVIOURS)];
    expect(validateTools(PROOF_TOOLS, { threads: MARK_RIG.threads.length, icons, behaviours })).toEqual([]);
  });

  it('proves a press tool, a child, a drag tool and a shown() tool', () => {
    const flat = flattenTools(PROOF_TOOLS);
    const kinds = flat.map((n) => PROOF_BEHAVIOURS[n.behaviour]);
    expect(kinds.some((b) => b.kind === 'press')).toBe(true);
    expect(kinds.some((b) => b.kind === 'drag')).toBe(true);
    expect(kinds.some((b) => b.shown && b.subscribe)).toBe(true);
    expect(flat.some((n) => n.parent !== null)).toBe(true);
  });
});
