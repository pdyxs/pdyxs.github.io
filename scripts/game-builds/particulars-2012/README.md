# Particulars (2012 rewrite): label format patch

`src/content/what/games/digital/particulars-2012/game.swf` is the archived `Parts.swf`
(`kunlim:Archive/Dev/particulars-flash-Builds/blackberry/Parts.swf`) with one patch. The source of
this build (a BlackBerry PlayBook / `qnx.ui` project, package `fabulaexmachina.particulars`) is not
in the archive, so it cannot be rebuilt; `patch-label-format.mjs` edits the bytecode.

    node scripts/game-builds/particulars-2012/patch-label-format.mjs Parts.swf game.swf

## Cause
`qnx.ui.text.Label`'s `format` setter is `_format = value; label_txt.defaultTextFormat = _format;
setText(__text)`. The game sets a label's text first and its format second (title, high scores,
credits), relying on Flash formatting the re-assigned text with `defaultTextFormat`. Ruffle (0.7.1 and
the 2026-10-31 nightly) gives new text the format of the old text, so those labels stayed 12pt
black and left-aligned: tiny, in the corner, black on a dark background.

## Patch
Inserts `label_txt.text = ""` (7 bytes) before the default format is set, so the field is empty and
the new text takes the default. Same behaviour under Flash Player. The method body grows from 31 to
38 bytes, the `ifeq` is adjusted, and the DoABC tag is re-emitted with its new length.
Idempotent. Needs no change if Ruffle ever formats `text =` from `defaultTextFormat`.
