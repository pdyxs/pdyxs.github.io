import { describe, it, expect } from 'vitest';
import { MARK_RIG } from '@data/mark-rig';
import { MARK_TOOLS, type ToolConfig } from '@data/mark-tools';
import { MARK_ICONS } from '@data/mark-icons';
import { BUILT_IN } from '@site/mark-tools';
import {
  childPivot,
  flattenTools,
  focusFallback,
  focusOrder,
  isTug,
  tautThreads,
  toolLength,
  validateTools,
  visibleTools,
  type ToolRegistries,
} from '@site/mark/tools';
import { PROOF_BEHAVIOURS, PROOF_TOOLS } from '../../../experiments/mark-tools-proof';

const tool = (id: string, extra: Partial<ToolConfig> = {}): ToolConfig => ({
  id,
  behaviour: 'b',
  string: 50,
  radius: 10,
  icon: 'palette',
  label: id,
  ...extra,
});

// a (thread 1) ─ a1 ─ a1x
//              └ a2
// b (thread 3)
const TREE: ToolConfig[] = [
  tool('a', { thread: 1, children: [tool('a1', { children: [tool('a1x')] }), tool('a2')] }),
  tool('b', { thread: 3 }),
];
const nodes = flattenTools(TREE);
const all = new Set(nodes.map((n) => n.id));

describe('flattenTools', () => {
  it('lists parents before their children, depth-first, in config order', () => {
    expect(nodes.map((n) => n.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
    expect(nodes.map((n) => n.parent)).toEqual([null, 'a', 'a1', 'a', null]);
  });

  it('keeps a thread only for top-level tools', () => {
    expect(nodes.map((n) => n.thread)).toEqual([1, null, null, null, 3]);
  });
});

describe('visibleTools', () => {
  it('hangs every shown tool', () => {
    expect(visibleTools(nodes, () => true)).toEqual(all);
  });

  it('hangs no child whose parent is not hanging', () => {
    expect([...visibleTools(nodes, (n) => n.id !== 'a1')]).toEqual(['a', 'a2', 'b']);
    expect([...visibleTools(nodes, (n) => n.id !== 'a')]).toEqual(['b']);
  });
});

describe('isTug', () => {
  it('is a tug with no tools, or no top-level tool shown', () => {
    expect(isTug([], new Set())).toBe(true);
    expect(isTug(nodes, new Set())).toBe(true);
    expect(isTug(nodes, new Set(['b']))).toBe(false);
  });
});

describe('tautThreads', () => {
  it('pulls only the threads that carry a tool in play', () => {
    expect(tautThreads(nodes, all, 5)).toEqual([false, true, false, true, false]);
    expect(tautThreads(nodes, new Set(['b']), 5)).toEqual([false, false, false, true, false]);
  });

  it('ignores children, which carry no thread', () => {
    expect(tautThreads(nodes, new Set(['a1', 'a2']), 5)).toEqual([false, false, false, false, false]);
  });

  it('pulls every thread for a tug (null)', () => {
    expect(tautThreads(nodes, null, 5)).toEqual([true, true, true, true, true]);
  });
});

describe('toolLength', () => {
  it('pays out the configured string only while out and shown', () => {
    const a = nodes[0];
    expect(toolLength(a, true, all)).toBe(50);
    expect(toolLength(a, false, all)).toBe(0);
    expect(toolLength(a, true, new Set(['b']))).toBe(0);
  });
});

describe('childPivot', () => {
  it('hangs from the bottom of the parent body, as scaled', () => {
    expect(childPivot({ x: 10, y: 20 }, 12, 1)).toEqual({ x: 10, y: 32 });
    expect(childPivot({ x: 10, y: 20 }, 12, 0.5)).toEqual({ x: 10, y: 26 });
  });
});

describe('focus', () => {
  it('orders the hanging baubles depth-first', () => {
    expect(focusOrder(nodes, all)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
    expect(focusOrder(nodes, new Set(['a', 'a2', 'b']))).toEqual(['a', 'a2', 'b']);
  });

  it('falls back to the nearest hanging ancestor, else the dot', () => {
    expect(focusFallback(nodes, 'a1x', new Set(['a', 'a1']))).toBe('a1');
    expect(focusFallback(nodes, 'a1x', new Set(['a']))).toBe('a');
    expect(focusFallback(nodes, 'a1x', new Set())).toBeNull();
    expect(focusFallback(nodes, 'b', all)).toBeNull();
  });
});

describe('validateTools', () => {
  const reg: ToolRegistries = { threads: 5, icons: ['palette'], behaviours: ['b'] };

  it('passes a sound tree', () => {
    expect(validateTools(TREE, reg)).toEqual([]);
  });

  it('catches threads out of range, missing or on a child', () => {
    expect(validateTools([tool('x', { thread: 5 })], reg)).toHaveLength(1);
    expect(validateTools([tool('x')], reg)).toHaveLength(1);
    expect(validateTools([tool('x', { thread: 0, children: [tool('y', { thread: 1 })] })], reg)).toHaveLength(1);
  });

  it('catches duplicate ids, anywhere in the tree', () => {
    expect(validateTools([tool('x', { thread: 0, children: [tool('x')] })], reg)).toEqual(['"x": id used twice']);
  });

  it('catches unknown icons and behaviours, and bad sizes', () => {
    expect(validateTools([tool('x', { thread: 0, icon: 'nope' })], reg)).toEqual(['"x": no icon "nope"']);
    expect(validateTools([tool('x', { thread: 0, behaviour: 'nope' })], reg)).toEqual(['"x": no behaviour "nope"']);
    expect(validateTools([tool('x', { thread: 0, string: 0, radius: -1 })], reg)).toHaveLength(2);
  });
});

describe('the configs', () => {
  const icons = Object.keys(MARK_ICONS);

  it('MARK_TOOLS is sound against the production registries', () => {
    expect(validateTools(MARK_TOOLS, { threads: MARK_RIG.threads.length, icons, behaviours: Object.keys(BUILT_IN) })).toEqual([]);
  });

  it('the bench config is sound against the production registry plus its own behaviours', () => {
    const behaviours = [...Object.keys(BUILT_IN), ...Object.keys(PROOF_BEHAVIOURS)];
    expect(validateTools(PROOF_TOOLS, { threads: MARK_RIG.threads.length, icons, behaviours })).toEqual([]);
  });

  it('the bench proves a press tool, a child, a drag tool and a shown() tool', () => {
    const flat = flattenTools(PROOF_TOOLS);
    const kinds = flat.map((n) => PROOF_BEHAVIOURS[n.behaviour]);
    expect(kinds.some((b) => b.kind === 'press')).toBe(true);
    expect(kinds.some((b) => b.kind === 'drag')).toBe(true);
    expect(kinds.some((b) => b.shown && b.subscribe)).toBe(true);
    expect(flat.some((n) => n.parent !== null)).toBe(true);
  });
});

describe('MARK_ICONS', () => {
  it('colours only through the two icon classes, never a literal colour', () => {
    for (const [name, body] of Object.entries(MARK_ICONS)) {
      expect(body, name).not.toMatch(/\b(fill|stroke|style|color)\s*=/);
      for (const [, cls] of body.matchAll(/class="([^"]*)"/g)) {
        expect(['site-mark-icon-ink', 'site-mark-icon-paper'], name).toContain(cls);
      }
    }
  });
});
