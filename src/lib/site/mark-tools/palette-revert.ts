// The revert tool: a small × hanging from the palette bauble while a
// non-default palette is kept. Pressing it puts the default colours back, and
// with nothing left to revert it reels itself up.
//
// `subscribe` is palette-dom's change signal, so it hears every kept change:
// the palette tool's commits, the floating PalettePicker's, and other tabs'.

import { isDefault } from '@site/palette';
import { commitPalette, onPaletteChange, storedPalette } from '@site/palette-dom';
import type { ToolBehaviour } from './types';

export const paletteRevert: ToolBehaviour = {
  kind: 'press',

  shown(): boolean {
    const p = storedPalette();
    return p !== null && !isDefault(p);
  },

  subscribe(changed: () => void): () => void {
    return onPaletteChange(() => changed());
  },

  press(): void {
    commitPalette(null);
  },
};
