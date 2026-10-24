// One-off, idempotent patch of Tiny World's game.swf (#217).
//
// The Credits/Back label (Main._Main_Label1_i, 26pt Georgia) sits in a 23px-tall
// box. Ruffle draws nothing when no line fits the box. This heightens the box to
// 32px and moves it up so the text sits centred in the button under Ruffle (whose
// verticalAlign=middle lands the line lower than Flash did). Same byte length, so
// no other offset in the SWF moves. Run: node scripts/patch-tiny-world-label.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SWF = 'src/content/what/games/digital/tiny-world-the-musical-the-game/game.swf';
const Y = -20;
const HEIGHT = 32;

const SET = '\\x61(?:[\\x80-\\xff]{1,2}[\\x00-\\x7f]|[\\x00-\\x7f])';
const BOX = new RegExp(
  `\\xd1\\x24(.)${SET}\\xd1\\x24(.)${SET}\\xd1\\x24\\x67${SET}\\xd1\\x24(.)${SET}\\xd1\\x2c`,
  'sd',
);

const swf = readFileSync(SWF);
if (swf.subarray(0, 3).toString() !== 'CWS') throw new Error('expected a zlib-compressed SWF');
const body = Buffer.from(inflateSync(swf.subarray(8)));
const m = BOX.exec(body.toString('latin1'));
if (!m) throw new Error('Credits/Back label not found');
body[m.indices[2][0]] = Y & 0xff;
body[m.indices[3][0]] = HEIGHT;
writeFileSync(SWF, Buffer.concat([swf.subarray(0, 8), deflateSync(body, { level: 9 })]));
console.log('patched', SWF);
