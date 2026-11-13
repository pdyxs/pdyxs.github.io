// The path guard. Pure: a content root and a client-supplied path in, an
// absolute file or a refusal out. The only files a dev editor may touch are
// `index.md` and `index.json` directly inside a card folder under a dimension
// root of the content tree.

import path from 'node:path';
import { FIVE_W_DIMENSIONS } from '../content/tags/five-w.ts';

export type CardFileResult = { ok: true; file: string } | { ok: false; error: string };

const ALLOWED_FILES = ['index.md', 'index.json'];
const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] as const;
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

/** The content type for an allowlisted image filename, or null. */
export function assetContentType(name: string): string | null {
  return CONTENT_TYPES[path.extname(name).toLowerCase()] ?? null;
}

/** The segments of `rel` if it is a safe path to a file inside a card folder under a dimension root. */
function cardSegments(contentRoot: string, rel: string): { ok: true; segments: string[]; file: string } | { ok: false; error: string } {
  if (typeof rel !== 'string' || rel === '') return refuse('empty path');
  if (rel.includes('\0') || rel.includes('\\')) return refuse('illegal character in path');
  if (rel.startsWith('/')) return refuse('path must be relative to the content root');
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return refuse('path must not contain empty, "." or ".." segments');
  if (segments.some((s) => s.startsWith('_') || s.startsWith('.'))) return refuse('path must not enter hidden or underscore folders');
  if (segments.length < 3) return refuse('the file must sit inside a card folder under a dimension root');
  if (!(FIVE_W_DIMENSIONS as readonly string[]).includes(segments[0])) return refuse(`"${segments[0]}" is not a dimension root`);
  const file = path.join(contentRoot, ...segments);
  if (!file.startsWith(contentRoot + path.sep)) return refuse('path escapes the content root');
  return { ok: true, segments, file };
}

export function resolveCardFile(contentRoot: string, rel: string): CardFileResult {
  const found = cardSegments(contentRoot, rel);
  if (!found.ok) return found;
  if (!ALLOWED_FILES.includes(found.segments[found.segments.length - 1])) return refuse('only index.md or index.json may be touched');
  return { ok: true, file: found.file };
}

/**
 * An image directly inside a card folder. Whether the folder is a card (and so
 * the file is flat beside its index.md, not in a subfolder of one) needs the
 * filesystem; the api checks that.
 */
export function resolveCardAsset(contentRoot: string, rel: string): CardFileResult {
  const found = cardSegments(contentRoot, rel);
  if (!found.ok) return found;
  const name = found.segments[found.segments.length - 1];
  if (assetContentType(name) === null) return refuse(`only ${ASSET_EXTENSIONS.join(' ')} files may be stored`);
  return { ok: true, file: found.file };
}
