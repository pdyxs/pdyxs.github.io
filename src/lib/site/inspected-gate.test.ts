import { describe, it, expect } from 'vitest';
import { uninspectedCards, setInspectedFalse, cardFileForUid, planRollbackStep } from './inspected-gate.ts';

describe('uninspectedCards', () => {
  it('finds nothing when every card is inspected', () => {
    expect(uninspectedCards([{ uid: 'a', inspected: true }])).toEqual([]);
  });

  it('reports an explicitly un-ticked card', () => {
    expect(uninspectedCards([{ uid: 'a', inspected: true }, { uid: 'b', inspected: false }])).toEqual(['b']);
  });

  it('counts an absent key as not inspected', () => {
    expect(uninspectedCards([{ uid: 'a' }])).toEqual(['a']);
  });

  it('counts truthy non-booleans as not inspected, like audit.ts', () => {
    expect(uninspectedCards([{ uid: 'a', inspected: 'true' }, { uid: 'b', inspected: 1 }])).toEqual(['a', 'b']);
  });
});

describe('setInspectedFalse', () => {
  it('flips a ticked flag without rewriting the rest of the frontmatter', () => {
    const raw = '---\ninspected: true\ntitle: "X"\n# note\n---\nbody\n';
    expect(setInspectedFalse(raw)).toBe('---\ninspected: false\ntitle: "X"\n# note\n---\nbody\n');
  });

  it('adds the key when absent', () => {
    expect(setInspectedFalse('---\ntitle: X\n---\nbody')).toBe('---\ninspected: false\ntitle: X\n---\nbody');
  });

  it('is a no-op when already false', () => {
    const raw = '---\ninspected: false\n---\nbody';
    expect(setInspectedFalse(raw)).toBe(raw);
  });

  it('adds frontmatter when there is none', () => {
    expect(setInspectedFalse('body')).toBe('---\ninspected: false\n---\nbody');
  });
});

describe('cardFileForUid', () => {
  it('maps a uid to its index.md', () => {
    expect(cardFileForUid('what/projects/foo')).toBe('src/content/what/projects/foo/index.md');
  });

  it.each(['', '../x', 'what/../../x', '/what/x', '_templates/x', '.obsidian/x', 'tag/x'])(
    'rejects %j',
    uid => {
      expect(() => cardFileForUid(uid)).toThrow();
    },
  );
});

describe('planRollbackStep', () => {
  it('refuses a card that is not on main', () => {
    expect(() => planRollbackStep({ onMain: false, addedByLastChange: false })).toThrow(/not on main/);
  });

  it('restores the previous version of a card that existed before', () => {
    expect(planRollbackStep({ onMain: true, addedByLastChange: false })).toBe('restore');
  });

  it('removes a card the last change introduced', () => {
    expect(planRollbackStep({ onMain: true, addedByLastChange: true })).toBe('remove');
  });
});
