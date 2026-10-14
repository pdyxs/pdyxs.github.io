// The write endpoint's path decision. Pure: a content root and a client-supplied
// path in, an absolute file or a refusal out. The only file the editor may ever
// touch is `index.json` inside a card folder under one of the content roots.

import path from 'node:path';

/** The dimension roots under src/content that hold cards. */
export const CARD_ROOTS = ['what', 'when', 'where', 'who', 'why'] as const;

export type CardFileResult = { ok: true; file: string } | { ok: false; error: string };

const refuse = (error: string): CardFileResult => ({ ok: false, error });

export function resolveCardFile(contentRoot: string, rel: string): CardFileResult {
  if (typeof rel !== 'string' || rel === '') return refuse('empty path');
  if (rel.includes('\0') || rel.includes('\\')) return refuse('illegal character in path');
  if (rel.startsWith('/')) return refuse('path must be relative to the content root');
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return refuse('path must not contain empty, "." or ".." segments');
  if (segments.some((s) => s.startsWith('_') || s.startsWith('.'))) return refuse('path must not enter hidden or underscore folders');
  if (segments[segments.length - 1] !== 'index.json') return refuse('only index.json may be written');
  if (segments.length < 3) return refuse('index.json must sit inside a card folder under a content root');
  if (!(CARD_ROOTS as readonly string[]).includes(segments[0])) return refuse(`"${segments[0]}" is not a content root`);
  const file = path.join(contentRoot, ...segments);
  // Belt and braces: the segment checks above should already make this true.
  if (!file.startsWith(contentRoot + path.sep)) return refuse('path escapes the content root');
  return { ok: true, file };
}
