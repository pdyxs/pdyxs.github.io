# Spark Label baseline fix for Ruffle

`spark/components/Label.as` is Apache Flex SDK 4.16.1's Spark `Label` (Apache-2.0, header kept)
with one addition, `moveLinesUpForRuffle()`, called at the end of `composeTextLines`.
The rest of the file is byte-for-byte upstream (`spark/styles/metadata/*.as` and
`spark/core/Version.as` are the upstream files it `include`s).

## Why
A Spark `Label` draws its text as FTE `TextLine`s. In Flash Player a `TextLine`'s `y` is its
**baseline**, and Spark positions lines that way. Ruffle (0.7.1, and the 2026-10-31 nightly) draws the
line with its **top** at `y`, so every Spark label lands one ascent (nearly a full line) too low.
That is what put "Escape from Flatland"'s title and button labels in the wrong place, and
overlapped Tiny World's credits. Measured with a probe SWF: `TextLine.getBounds(line).y` is `0`
in Ruffle and about `-ascent` in Flash.

## What it does
After composing, for each line whose own bounds start at about 0 (Ruffle's behaviour), set
`line.y -= line.ascent` and move the strikethrough/underline child shape the other way. Under a
player that already puts the baseline at `y` the test fails and nothing moves, so the fix stays
correct if Ruffle is fixed.

## Use
Add the folder to the compiler's source path, after the SDK. The compiler prefers the newer of a
source file and a library class of the same name, so this file (newer than the SDK's `spark.swc`)
wins, and `Button`, `TextInput` and every other Spark skin that uses a `Label` gets the fix too:

    -source-path+=scripts/game-builds/shared/ruffle-spark-label

`escape-from-flatland/build.sh` and `tiny-world/build.sh` already do. Check a build contains it:
`moveLinesUpForRuffle` appears in the decompressed SWF.

## Strikethroughs and underlines
Spark draws `lineThrough` and `textDecoration="underline"` as a `Shape` child of the `TextLine`,
and Ruffle does not draw (or may not keep) children of a `TextLine`. So the Label remembers the
Shape it made for each line, and, under Ruffle only, moves it out to be a child of the Label itself
(behind the text, on the baseline the line now sits on), removing it again on the next compose.
That is what brings back "Escape from Flatland"'s struck-out "Romance"/"Many" and the underline
under "Flatland". Under Flash Player the Shape stays where Spark put it.
