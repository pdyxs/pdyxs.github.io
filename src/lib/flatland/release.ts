/** Pure decisions for scripts/fetch-flatland.mjs. Relative `.ts` imports only: that script runs it under plain Node. */

/** Whether the pinned release must be downloaded, given the marker file's contents (undefined if absent). */
export function needsFetch(installedVersion: string | undefined, wanted: string): boolean {
  return installedVersion?.trim() !== wanted;
}

/** The release asset for a tag, e.g. `v1.0.0` -> `flatland-web-1.0.0.zip`. */
export function releaseAssetName(tag: string): string {
  return `flatland-web-${tag.replace(/^v/, '')}.zip`;
}
