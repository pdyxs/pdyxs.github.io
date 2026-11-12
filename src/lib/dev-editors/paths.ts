// The path guard. Pure: a content root and a client-supplied path in, an
// absolute file or a refusal out. The only files a dev editor may touch are
// `index.md` and `index.json` directly inside a card folder under a dimension
// root of the content tree.

import path from 'node:path';
import { FIVE_W_DIMENSIONS } from '../content/tags/five-w.ts';

export type CardFileResult = { ok: true; file: string } | { ok: false; error: string };

const ALLOWED_FILES = ['index.md', 'index.json'];
const refuse = (error: string): CardFileResult => ({ ok: false, error });

export function resolveCardFile(contentRoot: string, rel: string): CardFileResult {
  if (typeof rel !== 'string' || rel === '') return refuse('empty path');
  if (rel.includes('\0') || rel.includes('\\')) return refuse('illegal character in path');
  if (rel.startsWith('/')) return refuse('path must be relative to the content root');
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return refuse('path must not contain empty, "." or ".." segments');
  if (segments.some((s) => s.startsWith('_') || s.startsWith('.'))) return refuse('path must not enter hidden or underscore folders');
  if (!ALLOWED_FILES.includes(segments[segments.length - 1])) return refuse('only index.md or index.json may be touched');
  if (segments.length < 3) return refuse('the file must sit inside a card folder under a dimension root');
  if (!(FIVE_W_DIMENSIONS as readonly string[]).includes(segments[0])) return refuse(`"${segments[0]}" is not a dimension root`);
  const file = path.join(contentRoot, ...segments);
  if (!file.startsWith(contentRoot + path.sep)) return refuse('path escapes the content root');
  return { ok: true, file };
}
