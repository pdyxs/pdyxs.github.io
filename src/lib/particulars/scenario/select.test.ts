import { describe, it, expect } from 'vitest';
import { scenarioFor } from './select';

const GOOD = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0 } };
const dir = '/src/content/what/toys/particulars';

describe('scenarioFor', () => {
  it('picks the index.json beside the card by entryId', () => {
    const files = { [`${dir}/index.json`]: GOOD, '/src/content/other/index.json': {} };
    expect(scenarioFor(files, 'what/toys/particulars')).toEqual(GOOD);
  });

  it('throws a readable error when the card has no index.json', () => {
    expect(() => scenarioFor({}, 'what/toys/particulars')).toThrow(
      'Particulars: what/toys/particulars has no index.json beside its index.md',
    );
  });

  it('throws every validation problem, naming the card', () => {
    const files = { [`${dir}/index.json`]: { walls: { width: 0, height: 5 }, player: { x: 0, y: 0 } } };
    expect(() => scenarioFor(files, 'what/toys/particulars')).toThrow(
      /Particulars: invalid scenario for what\/toys\/particulars\n- walls\.width must be a positive number/,
    );
  });
});
