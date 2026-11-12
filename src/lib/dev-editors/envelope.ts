// The envelope: `{ editor, version, data }`. The plumbing owns `editor` and
// `version`; the editor's `validate` only ever sees `data`. Pure.

import type { EditorDefinition, Envelope } from './types.ts';

export const STARTING_VERSION = '1.0.0';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function newEnvelope<D>(editor: EditorDefinition<D>): Envelope<D> {
  return { editor: editor.id, version: STARTING_VERSION, data: editor.blank() };
}

export function parseEnvelope(text: string): { ok: true; envelope: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, envelope: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'index.json is not valid JSON' };
  }
}

/** Errors for an envelope against an editor; empty means valid. */
export function validateEnvelope(editor: EditorDefinition<any>, envelope: unknown): string[] {
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) return ['envelope must be an object'];
  const e = envelope as Record<string, unknown>;
  const errors: string[] = [];
  if (e.editor !== editor.id) errors.push(`editor must be "${editor.id}"`);
  if (typeof e.version !== 'string' || !SEMVER.test(e.version)) errors.push('version must be semver (x.y.z)');
  if (!('data' in e) || e.data === undefined) return [...errors, 'data is required'];
  return [...errors, ...editor.validate(e.data)];
}
