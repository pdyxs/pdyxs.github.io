// The only thing the site knows about crdbrd: an EditorDefinition, registered
// in astro.config.mjs.

import type { EditorDefinition } from '../../lib/dev-editors/types.ts';
import { blank } from './model/game.ts';
import { validate } from './model/validate.ts';
import type { Game } from './model/types.ts';

export const crdbrdEditor: EditorDefinition<Game> = {
  id: 'crdbrd',
  name: 'crdbrd',
  // The envelope's editor id marks a crdbrd card; no frontmatter flag duplicates it.
  frontmatter: {},
  component: '/src/modules/crdbrd/editor/CrdbrdEditor.svelte',
  blank,
  validate,
};
