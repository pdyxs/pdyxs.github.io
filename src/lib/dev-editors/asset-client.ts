// What an editor calls to list, upload and display a card's images, so it never
// builds api paths itself. Re-exported from dev-client.ts. No side effects on
// import (dev-client.ts mounts UI), so it is testable on its own.
//
// An editor stores the filename in its index.json, never the URL.

const API = '/__dev-editors';
const enc = encodeURIComponent;

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** URL an `<img src>` can use for the image `filename` in card folder `dir`. */
export function assetUrl(editorId: string, dir: string, filename: string): string {
  return `${API}/${enc(editorId)}/asset?path=${enc(dir)}&name=${enc(filename)}`;
}

/** The image filenames in a card folder, sorted. */
export async function listAssets(editorId: string, dir: string, fetcher: FetchLike = fetch as FetchLike): Promise<string[]> {
  const res = await fetcher(`${API}/${enc(editorId)}/assets?path=${enc(dir)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `listing assets failed (${res.status})`);
  return body;
}

export type UploadResult = { ok: true; filename: string } | { ok: false; exists: boolean; error: string };

/**
 * Upload an image into a card folder. Refuses to replace an existing file
 * (`exists: true` in the result) unless `overwrite` is true.
 */
export async function uploadAsset(
  editorId: string,
  dir: string,
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  { overwrite = false }: { overwrite?: boolean } = {},
  fetcher: FetchLike = fetch as FetchLike,
): Promise<UploadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const res = await fetcher(`${API}/${enc(editorId)}/asset?path=${enc(dir)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data: btoa(binary), overwrite }),
  });
  const body = await res.json();
  if (res.ok) return { ok: true, filename: body.filename };
  return { ok: false, exists: res.status === 409, error: body?.error ?? `upload failed (${res.status})` };
}
