import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface SwfHeader {
  version: number;
  /** Stage size in pixels (the header stores twips, 1/20 px). */
  width: number;
  height: number;
  frameRate: number;
}

/**
 * Reads the stage size and frame rate from a SWF's header. Pure; build-time
 * only (it uses node:zlib), so a Flash card can reserve its aspect ratio
 * before anything loads.
 *
 * Handles FWS (uncompressed) and CWS (zlib). ZWS (LZMA) is refused: nothing
 * in the archive uses it and it would need a decoder dependency.
 */
export function parseSwfHeader(bytes: Uint8Array): SwfHeader {
  const sig = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0);
  if (sig === 'ZWS') throw new Error('parseSwfHeader: LZMA-compressed (ZWS) SWFs are not supported');
  if (sig !== 'FWS' && sig !== 'CWS') throw new Error('parseSwfHeader: not a SWF (bad signature)');
  const version = bytes[3]!;

  // Only the RECT and frame rate are needed, and they sit in the first few
  // bytes after the header; for CWS, everything after byte 8 is one zlib stream.
  const rest = sig === 'CWS' ? inflateSync(bytes.subarray(8)) : bytes.subarray(8);

  const nbits = rest[0]! >> 3;
  let bitPos = 5;
  const readBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++, bitPos++) {
      v = v * 2 + ((rest[bitPos >> 3]! >> (7 - (bitPos & 7))) & 1);
    }
    return v;
  };
  const xmin = readBits(nbits);
  const xmax = readBits(nbits);
  const ymin = readBits(nbits);
  const ymax = readBits(nbits);

  const rectBytes = Math.ceil((5 + 4 * nbits) / 8);
  const frameRate = rest[rectBytes + 1]! + rest[rectBytes]! / 256;

  return { version, width: (xmax - xmin) / 20, height: (ymax - ymin) / 20, frameRate };
}

/**
 * The header of the SWF colocated in a card's folder, read from disk. Build /
 * SSR only. Undefined when the folder holds no .swf.
 */
export function readCardSwfHeader(entryId: string): SwfHeader | undefined {
  const dir = join(process.cwd(), 'src/content', entryId);
  if (!existsSync(dir)) return undefined;
  const name = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.swf'));
  return name ? parseSwfHeader(readFileSync(join(dir, name))) : undefined;
}
