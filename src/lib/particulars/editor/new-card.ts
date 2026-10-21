// What a freshly created Particulars card contains. Pure text in, text out.
//
// The card schema (src/content.config.ts) requires nothing, so "minimal valid"
// is what the site needs to *use* the card: `headerMedia: particulars` picks the
// toy, `title` names it, `tags: []` matches the other toy cards. `date` is there
// because every card sorts on it. `inspected: false` because this is an
// automated write (docs/agents/workflow.md), so it lands on the worklist.

import type { Scenario } from '../scenario/types.ts';

export const BLANK_SCENARIO: Scenario = {
  // The original's camera shows about 70 x 40 units, and particle sizes are in those units.
  walls: { width: 64, height: 36 },
  player: { x: 0, y: 0 },
};

export function newCardFiles(title: string, isoDate: string): { indexMd: string; indexJson: string } {
  const indexMd = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${isoDate}`,
    'tags: []',
    'inspected: false',
    'headerMedia: particulars',
    '---',
    '',
  ].join('\n');
  return { indexMd, indexJson: JSON.stringify(BLANK_SCENARIO, null, 2) + '\n' };
}
