import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { parseSwfHeader, readCardSwfHeader } from '@render/swf';

// Bit-packs a SWF RECT (Nbits, then Xmin/Xmax/Ymin/Ymax) into bytes.
function rect(xmin: number, xmax: number, ymin: number, ymax: number, nbits: number): number[] {
  let bits = nbits.toString(2).padStart(5, '0');
  for (const v of [xmin, xmax, ymin, ymax]) bits += v.toString(2).padStart(nbits, '0');
  bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
  return bits.match(/.{8}/g)!.map((b) => parseInt(b, 2));
}

// Everything after the 8-byte header: RECT, frame rate (8.8 fixed), frame count.
function body(widthPx: number, heightPx: number, fps: number): number[] {
  return [...rect(0, widthPx * 20, 0, heightPx * 20, 16), 0, fps, 1, 0];
}

function swf(sig: string, version: number, payload: number[]): Uint8Array {
  const header = [...sig].map((c) => c.charCodeAt(0)).concat(version, 0, 0, 0, 0);
  return Uint8Array.from([...header, ...payload]);
}

describe('parseSwfHeader', () => {
  it('reads version, stage size in pixels and frame rate from an uncompressed FWS', () => {
    const bytes = swf('FWS', 10, body(800, 600, 30));
    expect(parseSwfHeader(bytes)).toEqual({ version: 10, width: 800, height: 600, frameRate: 30 });
  });

  it('reads a zlib-compressed CWS', () => {
    const header = swf('CWS', 9, []);
    const compressed = Uint8Array.from(deflateSync(Uint8Array.from(body(550, 400, 24))));
    const bytes = Uint8Array.from([...header, ...compressed]);
    expect(parseSwfHeader(bytes)).toEqual({ version: 9, width: 550, height: 400, frameRate: 24 });
  });

  it('decodes the fractional part of the frame rate', () => {
    const payload = [...rect(0, 11000, 0, 8000, 15), 0x80, 12, 1, 0];
    expect(parseSwfHeader(swf('FWS', 8, payload)).frameRate).toBe(12.5);
  });

  it('fails clearly on LZMA-compressed ZWS', () => {
    expect(() => parseSwfHeader(swf('ZWS', 13, [0, 0, 0, 0]))).toThrow(/LZMA/);
  });

  it('fails clearly on something that is not a SWF', () => {
    expect(() => parseSwfHeader(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/not a SWF/i);
  });
});

describe.each([
  ['Tiny World', 'what/games/digital/tiny-world-the-musical-the-game'],
  ['Enemies', 'what/games/digital/enemies'],
])('%s poster', (_name, id) => {
  // The poster fills a stage box with the SWF's aspect ratio (object-fit: cover),
  // so a poster of any other shape is cropped, and is not the framing Ruffle
  // shows once the game starts (#216).
  it('has the same aspect ratio as the stage it stands in for', () => {
    const png = readFileSync(`src/content/${id}/poster.png`);
    const posterW = png.readUInt32BE(16);
    const posterH = png.readUInt32BE(20);
    const stage = readCardSwfHeader(id)!;
    expect(posterW / posterH).toBeCloseTo(stage.width / stage.height, 3);
  });
});
