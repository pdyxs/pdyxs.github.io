import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DevEditorDemo from '@components/header-media/DevEditorDemo.astro';
import { resolveHeaderMedia } from '@render/renderers';

describe('dev-editor-demo header media', () => {
  it('is registered and prints the two values from the card\'s index.json', async () => {
    expect(resolveHeaderMedia('dev-editor-demo')).toBe(DevEditorDemo);
    const container = await AstroContainer.create();
    const html = await container.renderToString(DevEditorDemo, {
      props: { entryId: 'what/toys/dev-editor-demo', images: [] },
    });
    expect(html).toContain('Hello from the demo editor');
    expect(html).toContain('3');
  });
});
