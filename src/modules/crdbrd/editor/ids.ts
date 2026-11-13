/** A fresh stable id. Ops take ids from their caller; the island is that caller. */
export function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
