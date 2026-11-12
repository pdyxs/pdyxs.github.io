// The `/__inspect` endpoint as a pure-ish function over an injected fs, so it is
// tested with a fake. The uid is validated by `cardFileForUid` (the same rule
// rollback uses): anything it rejects is a 400 and nothing is read or written.

import path from 'node:path';
import { cardFileForUid, setInspectedTrue } from '../site/inspected-gate.ts';

export interface InspectFs {
  /** File text, or null when it does not exist. */
  read(file: string): string | null;
  /** Atomic write (the real one writes a temp file and renames it). */
  write(file: string, text: string): void;
}

export interface InspectRequest {
  method: string;
  body: unknown;
}

export interface InspectResponse {
  status: number;
  body: { ok: true } | { error: string };
}

export function createInspectHandler({ fs, root }: { fs: InspectFs; root: string }) {
  return function handle({ method, body }: InspectRequest): InspectResponse {
    if (method !== 'POST') return { status: 405, body: { error: 'POST only' } };
    const uid = (body as { uid?: unknown } | null | undefined)?.uid;
    if (typeof uid !== 'string') return { status: 400, body: { error: 'body must be { uid: string }' } };
    let file: string;
    try {
      file = path.join(root, cardFileForUid(uid));
    } catch (err) {
      return { status: 400, body: { error: err instanceof Error ? err.message : 'bad uid' } };
    }
    const raw = fs.read(file);
    if (raw === null) return { status: 404, body: { error: `no card file for "${uid}"` } };
    const next = setInspectedTrue(raw);
    if (next !== raw) fs.write(file, next);
    return { status: 200, body: { ok: true } };
  };
}
