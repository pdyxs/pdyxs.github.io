import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Tiny World's Credits/Back button label is a Spark Label (26pt Georgia) built in
// Main._Main_Label1_i. The game was authored with a box 23px tall, shorter than one
// line of that font. Flash drew the line anyway; Ruffle draws nothing when no line
// fits the box, leaving the button blank (#217). scripts/patch-tiny-world-label.mjs
// heightens the box in game.swf. Newer Ruffle nightlies do not fix it.

const SWF = 'src/content/what/games/digital/tiny-world-the-musical-the-game/game.swf';
const FONT_SIZE = 26;

// getlocal1 pushbyte <v> setproperty <multiname> (u30: 1 to 3 bytes)
const SET = '\\x61(?:[\\x80-\\xff]{1,2}[\\x00-\\x7f]|[\\x00-\\x7f])';
const LABEL1_BOX = new RegExp(
  `\\xd1\\x24(.)${SET}\\xd1\\x24(.)${SET}\\xd1\\x24\\x67${SET}\\xd1\\x24(.)${SET}\\xd1\\x2c`,
  's',
);

function label1Box(): { x: number; y: number; height: number } {
  const swf = readFileSync(SWF);
  const body = inflateSync(swf.subarray(8)).toString('latin1');
  const m = LABEL1_BOX.exec(body);
  if (!m) throw new Error('Credits/Back label (x, y, width 103, height) not found in game.swf');
  const signed = (c: string) => (c.charCodeAt(0) << 24) >> 24;
  return { x: signed(m[1]), y: signed(m[2]), height: signed(m[3]) };
}

describe('Tiny World Credits/Back label', () => {
  it('has a box tall enough for one line of its font, or Ruffle draws nothing', () => {
    expect(label1Box().height).toBeGreaterThanOrEqual(Math.ceil(FONT_SIZE * 1.2));
  });
});
