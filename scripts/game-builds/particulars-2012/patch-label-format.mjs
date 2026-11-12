// Patch Particulars (2012 rewrite)'s Parts.swf so Ruffle shows its labels as designed.
// Usage: node patch-label-format.mjs <in.swf> <out.swf>   (idempotent; see README.md)
//
// The game's qnx.ui.text.Label.format setter does
//     _format = value; label_txt.defaultTextFormat = _format; setText(__text);
// i.e. it re-assigns the text after changing the default format. Flash formats text it is
// given with defaultTextFormat. Ruffle (0.7.1 and the 2026-10-31 nightly) gives the new text
// the format of the old text instead, so every label whose text is set before its format
// (the menu's title and high scores, the credits) stays 12pt black and left-aligned.
// This inserts `label_txt.text = ""` before the default format is set; the empty field then
// has nothing to inherit from. Same behaviour under Flash Player.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT) throw new Error('usage: node patch-label-format.mjs <in.swf> <out.swf>');

const swf = readFileSync(IN);
if (swf.subarray(0, 3).toString() !== 'CWS') throw new Error('expected a zlib-compressed SWF');
const body = Buffer.from(inflateSync(swf.subarray(8)));

// Label.format setter: method body, 31 bytes, preceded by its 6-byte header
// (method 72, max_stack, local_count, init_scope_depth, max_scope_depth, code_length 31).
const CODE = Buffer.from('d0 30 d0 d1 68 5f d0 66 60 20 13 10 00 00 d0 66 60 d0 66 5f 61 f1 08 d0 d0 66 56 4f 67 01 47'.replace(/ /g, ''), 'hex');
// Inserted after the `ifeq` that skips everything when label_txt is null:
//   getlocal0 getproperty label_txt  pushstring ""  setproperty text
const INSERT = Buffer.from('d0 66 60 2c 01 61 5e'.replace(/ /g, ''), 'hex');
const PATCHED = Buffer.concat([CODE.subarray(0, 14), INSERT, CODE.subarray(14)]);
PATCHED[11] = CODE[11] + INSERT.length; // the ifeq jumps to the final returnvoid: 16 -> 23

function locate(abc, code) {
  const at = abc.indexOf(code);
  if (at < 0 || abc.indexOf(code, at + 1) >= 0) return -1;
  if (abc[at - 6] !== 72 || abc[at - 1] !== code.length) throw new Error('unexpected method body header');
  return at;
}

// Walk the SWF tags to the DoABC (type 82) ones.
let pos = 0;
const nbits = body[0] >> 3;
pos = Math.ceil((5 + 4 * nbits) / 8) + 4; // frame rect, frame rate, frame count
const out = [body.subarray(0, pos)];
let patched = false;
let already = false;
while (pos < body.length) {
  const start = pos;
  const header = body.readUInt16LE(pos);
  let len = header & 63;
  const type = header >> 6;
  let hlen = 2;
  if (len === 63) { len = body.readUInt32LE(pos + 2); hlen = 6; }
  const content = body.subarray(pos + hlen, pos + hlen + len);
  pos += hlen + len;
  if (type === 82 && !patched) {
    let nameEnd = 4; while (content[nameEnd] !== 0) nameEnd++; nameEnd++;
    const abc = content.subarray(nameEnd);
    const at = locate(abc, CODE);
    if (at >= 0) {
      const newAbc = Buffer.concat([abc.subarray(0, at - 1), Buffer.from([PATCHED.length]), PATCHED, abc.subarray(at + CODE.length)]);
      const newContent = Buffer.concat([content.subarray(0, nameEnd), newAbc]);
      const h = Buffer.alloc(6); h.writeUInt16LE((82 << 6) | 63, 0); h.writeUInt32LE(newContent.length, 2);
      out.push(h, newContent);
      patched = true;
      continue;
    }
    if (locate(abc, PATCHED) >= 0) already = true;
  }
  out.push(body.subarray(start, pos));
}
if (!patched && !already) throw new Error('Label.format setter not found');
const newBody = Buffer.concat(out);
const head = Buffer.from(swf.subarray(0, 8));
head.writeUInt32LE(newBody.length + 8, 4);
writeFileSync(OUT, Buffer.concat([head, deflateSync(newBody, { level: 9 })]));
console.log(already ? 'already patched' : 'patched', OUT);
