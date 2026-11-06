# Tiny World the Musical: reproducible build

`src/content/what/games/digital/tiny-world-the-musical-the-game/game.swf` is built from the archived
`pdyxs/tiny-world-the-musical` source with the Spark `Label` baseline fix for Ruffle
(`../shared/ruffle-spark-label/`). It replaces the 2012 Release/Main.swf plus the byte patch of #217.

## Inputs (none are in this repo)
- `git clone https://github.com/pdyxs/tiny-world-the-musical` (archived).
- The libraries the source was written against, from Koofr:
  `rclone-koofr-ro copy "kunlim:Archive/Projects/Digital Games/Tiny World/workspace/Libraries" <dir>`
  (`box2d/Source`, `greensock-as3`, `gameapi-as3`, `flashpunk`; `flashpunk` is not used).
- Apache Flex SDK 4.16.1 and `playerglobal32_0.swc`, set up as in `../escape-from-flatland/README.md`.

## Recipe
    scripts/game-builds/tiny-world/build.sh <clone> <Libraries dir> <FLEX_HOME> game.swf

Works on a copy: applies `credits-label.patch`, places `assets/` beside the classes that
`[Embed]` them (Flex resolves `[Embed]` relative to the embedding file), then runs `mxmlc`
for player 32 with the shared `Label` on the source path.

## Patch
- `credits-label.patch`: the Credits/Back label (26pt Georgia) was a box 23px tall, shorter than
  one line. Flash drew the line anyway; Ruffle draws nothing when no line fits. Box is now
  `y=6 height=32`, which centres the text in the button. (Replaces `patch-tiny-world-label.mjs`.)

`src/lib/render/tiny-world-label.test.ts` checks the built SWF still has a tall enough box.
