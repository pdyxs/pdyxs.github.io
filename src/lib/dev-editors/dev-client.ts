// Dev-only entry, loaded on every page by Base.astro under import.meta.env.DEV.
//
// - Mounts the "open in editor" button into the dev dock.
// - Reloads a page when a card's index.json changes, unless it is an editor
//   page (the one saving). The dev server sends DATA_CHANGED_EVENT in place of
//   Astro's reload-everything (see integration.ts).
import { mount } from 'svelte';
import OpenInEditorButton from './OpenInEditorButton.svelte';
import { devDock } from '../site/dev-dock.ts';
import { DATA_CHANGED_EVENT, isEditorPage } from './routes.ts';

mount(OpenInEditorButton, { target: devDock() });

import.meta.hot?.on(DATA_CHANGED_EVENT, () => {
  if (!isEditorPage(location.pathname)) location.reload();
});
