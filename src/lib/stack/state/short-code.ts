// Base62 codec for short-code manifest entries.
//
// Maps a non-negative integer index to a compact alphanumeric code and back.
// Digits are ordered so that sequential indices (0, 1, 2, ...) produce
// codes in increasing length order — i.e. taking the next unused index
// always yields the shortest still-free code.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length;

export function encodeBase62(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`encodeBase62 requires a non-negative integer, got ${n}`);
  }
  if (n === 0) return ALPHABET[0];
  let out = '';
  let x = n;
  while (x > 0) {
    out = ALPHABET[x % BASE] + out;
    x = Math.floor(x / BASE);
  }
  return out;
}

export function decodeBase62(code: string): number {
  let n = 0;
  for (const ch of code) {
    const digit = ALPHABET.indexOf(ch);
    if (digit === -1) throw new Error(`invalid base62 character: ${ch}`);
    n = n * BASE + digit;
  }
  return n;
}
