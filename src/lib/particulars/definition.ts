// The Particulars editor as a dev-editors standard definition. The composition
// root (astro.config.mjs) registers it; the standard never imports it.
// Relative `.ts` imports: it loads under plain Node.

import type { EditorDefinition } from '../dev-editors/types.ts';
import type { Scenario } from './scenario/types.ts';
import { validate } from './scenario/validate.ts';

export const particularsDefinition: EditorDefinition<Scenario> = {
  id: 'particulars',
  name: 'Particulars',
  frontmatter: { headerMedia: 'particulars' },
  component: '/src/components/header-media/particulars/editor/Editor.svelte',
  blank: () => ({
    // The original's camera shows about 70 x 40 units, and particle sizes are in those units.
    walls: { width: 64, height: 36 },
    player: { x: 0, y: 0 },
  }),
  validate(data) {
    const result = validate(data);
    return result.ok ? [] : result.errors;
  },
};
