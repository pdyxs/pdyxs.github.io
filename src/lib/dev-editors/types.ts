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
}

/** The content filesystem the api works over. Paths are absolute. */
export interface ContentFs {
  /** File contents, or null if absent. */
  read(file: string): string | null;
  /** Atomic: write `<file>.tmp`, then rename. */
  write(file: string, text: string): void;
  /** Every file under the content root, as posix paths relative to it. */
  list(): string[];
}
