export function parseUidEntry(entry: string): { uid: string; params: Record<string, string> } {
  const colonIdx = entry.indexOf(':');
  if (colonIdx === -1) return { uid: entry, params: {} };
  const uid = entry.slice(0, colonIdx);
  const params: Record<string, string> = {};
  new URLSearchParams(entry.slice(colonIdx + 1)).forEach((v, k) => { params[k] = v; });
  return { uid, params };
}

export function serializeUidEntry(uid: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${uid}:${qs}` : uid;
}
