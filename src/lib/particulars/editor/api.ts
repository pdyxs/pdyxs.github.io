// The editor's whole server side as a pure-ish module: requests in, responses
// out, file access through an injected `EditorFs`. The Vite plugin
// (scripts/particulars-editor-plugin.mjs) only adapts HTTP and the real
// filesystem to this. Relative `.ts` imports: it loads under plain Node.

import { resolveCardFile } from './paths.ts';
import { newCardFiles } from './new-card.ts';
import { validate } from '../scenario/validate.ts';

export interface EditorFs {
  /** File contents, or null if absent. */
  read(file: string): string | null;
  write(file: string, text: string): void;
  /** Every file under the content root, as posix paths relative to it. */
  list(): string[];
}

export interface EditorApiDeps {
  contentRoot: string;
  fs: EditorFs;
  today: () => string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });
const asJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export function createEditorApi({ contentRoot, fs, today }: EditorApiDeps) {
  return {
    cards(): ApiResponse {
      const files = fs.list().filter((f) => !f.split('/').some((s) => s.startsWith('_') || s.startsWith('.')));
      const set = new Set(files);
      const dirs = files.filter((f) => f.endsWith('/index.md')).map((f) => f.slice(0, -'/index.md'.length)).sort();
      return json(200, dirs.map((dir) => ({ dir, hasScenario: set.has(`${dir}/index.json`) })));
    },

    read(rel: string): ApiResponse {
      const target = resolveCardFile(contentRoot, rel);
      if (!target.ok) return json(400, { error: target.error });
      const text = fs.read(target.file);
      if (text === null) return json(404, { error: 'no scenario here yet' });
      try {
        return json(200, JSON.parse(text));
      } catch {
        return json(422, { error: 'index.json is not valid JSON' });
      }
    },

    create(dir: string, title: string): ApiResponse {
      const target = resolveCardFile(contentRoot, `${dir}/index.json`);
      if (!target.ok) return json(400, { error: target.error });
      if (typeof title !== 'string' || title.trim() === '') return json(400, { error: 'a card needs a title' });
      const mdFile = target.file.slice(0, -'index.json'.length) + 'index.md';
      if (fs.read(mdFile) !== null || fs.read(target.file) !== null) return json(409, { error: 'a card already exists there' });
      const files = newCardFiles(title.trim(), today());
      fs.write(mdFile, files.indexMd);
      fs.write(target.file, files.indexJson);
      return json(200, { ok: true, dir });
    },

    write(rel: string, scenario: unknown): ApiResponse {
      const target = resolveCardFile(contentRoot, rel);
      if (!target.ok) return json(400, { error: target.error });
      const checked = validate(scenario);
      if (!checked.ok) return json(422, { error: 'invalid scenario', errors: checked.errors });
      fs.write(target.file, asJson(scenario));
      return json(200, { ok: true });
    },
  };
}
