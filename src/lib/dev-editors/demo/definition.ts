// Throwaway demo editor for the dev-editors standard. Deleted once a real
// editor lands on `dev`.

import type { EditorDefinition } from '../types.ts';

export interface DemoData {
  text: string;
  count: number;
}

export const demoEditor: EditorDefinition<DemoData> = {
  id: 'demo',
  name: 'Demo',
  frontmatter: { headerMedia: 'dev-editor-demo' },
  component: '/src/lib/dev-editors/demo/DemoEditor.svelte',
  blank: () => ({ text: '', count: 0 }),
  validate(data) {
    if (typeof data !== 'object' || data === null) return ['data must be an object'];
    const errors: string[] = [];
    if (typeof data.text !== 'string') errors.push('text must be a string');
    if (typeof data.count !== 'number' || !Number.isFinite(data.count)) errors.push('count must be a finite number');
    return errors;
  },
};
