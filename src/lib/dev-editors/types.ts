/** What an editor hands the standard. The standard never imports an editor. */
export interface EditorDefinition<Data = unknown> {
  id: string;
  name: string;
  /** Card frontmatter properties and values the editor's renderer needs, e.g. `{ headerMedia: 'demo' }`. */
  frontmatter: Record<string, string | number | boolean>;
  /** Errors for `data`; empty means valid. */
  validate(data: Data): string[];
  /** The data of a new file. */
  blank(): Data;
  /**
   * The client UI component to mount: a Svelte component path relative to the
   * project root (loaded by the editor page). A string keeps this module free
   * of any editor's imports.
   */
  component: string;
}

export interface Envelope<Data = unknown> {
  editor: string;
  version: string;
  data: Data;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** Set instead of a JSON `body` when the response is a file's bytes. */
  raw?: { bytes: Uint8Array; contentType: string };
}

/** The content filesystem the api works over. Paths are absolute. */
export interface ContentFs {
  /** File contents, or null if absent. */
  read(file: string): string | null;
  /** Atomic: write `<file>.tmp`, then rename. */
  write(file: string, text: string): void;
  /** File bytes, or null if absent. */
  readBytes(file: string): Uint8Array | null;
  /** Atomic: write `<file>.tmp`, then rename. */
  writeBytes(file: string, bytes: Uint8Array): void;
  /** Every file under the content root, as posix paths relative to it. */
  list(): string[];
}

/** Git operations the version bump and version history need, run in the checkout the dev server runs in. */
export interface ContentGit {
  /** A description of the merge, rebase or cherry-pick in progress, or null. */
  inProgress(): string | null;
  /** Stage everything under `paths` and commit only those paths. Retries once if the index is locked. */
  commitPaths(paths: string[], message: string): { ok: true } | { ok: false; error: string };
  /** Commits touching the absolute `file`, newest first. `date` is the committer date, ISO 8601. */
  log(file: string): { commit: string; date: string }[];
  /** The absolute `file` as of `commit`, or null if it did not exist there. */
  show(commit: string, file: string): string | null;
}
