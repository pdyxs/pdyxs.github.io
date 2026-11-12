import { describe, it, expect } from 'vitest';
import { versionHistory } from './history.ts';

const snap = (commit: string, version: unknown, date = `d-${commit}`) => ({
  commit,
  date,
  text: JSON.stringify({ editor: 'demo', version, data: {} }),
});

describe('versionHistory', () => {
  it('keeps the latest commit per version, newest version first', () => {
    // newest-first, as read from git
    const out = versionHistory([snap('c4', '2.0.0'), snap('c3', '1.1.0'), snap('c2', '1.0.0'), snap('c1', '1.0.0')]);
    expect(out).toEqual([
      { version: '2.0.0', commit: 'c4', date: 'd-c4' },
      { version: '1.1.0', commit: 'c3', date: 'd-c3' },
      { version: '1.0.0', commit: 'c2', date: 'd-c2' },
    ]);
  });

  it('skips snapshots that fail to parse or carry no version', () => {
    const out = versionHistory([
      { commit: 'c3', date: 'd', text: '{bad' },
      { commit: 'c2', date: 'd', text: '{"data":1}' },
      snap('c1', '1.0.0'),
    ]);
    expect(out.map((v) => v.commit)).toEqual(['c1']);
  });
});
