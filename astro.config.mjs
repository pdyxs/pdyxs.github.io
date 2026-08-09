// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { REDIRECTS } from './src/data/redirects.generated.ts';
import { rehypeExternalLinks } from './src/lib/external-links.ts';
import { rehypeVideoEmbeds } from './src/lib/video-embeds.ts';
import { devReloadPlugin } from './scripts/dev-reload-plugin.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://pdyxs.wtf',
  integrations: [svelte()],
  // Old Jekyll permalinks (issue #70). The map is generated from the retired
  // site on `master` by scripts/generate-redirects.mjs (a prebuild step), never
  // hand-edited. In a static build Astro emits one meta-refresh HTML page per
  // entry, which is the only redirect mechanism GitHub Pages offers.
  redirects: REDIRECTS,
  markdown: {
    // Shiki is off: its themes hardcode hex colours (the default `github-dark`
    // painted every code block #24292e in both themes), and the palette here is
    // two colours — ink and paper — with no room for syntax hues. Astro then
    // emits bare `<pre><code>` and global.css owns the surface. The untagged
    // case lands as `<code>` with no class, which is the hook the wrap rule
    // uses to tell prose-in-a-fence from real code.
    syntaxHighlight: false,
    // Order matters: rehypeVideoEmbeds replaces a bare-video-link paragraph
    // with a figure, so the anchor is gone before rehypeExternalLinks (which
    // opens off-site links in a new tab, decided in one place instead of the
    // per-link `{:target="_blank"}` annotations the Jekyll content carried)
    // could give it a target.
    rehypePlugins: [rehypeVideoEmbeds, rehypeExternalLinks],
  },
  vite: {
    server: {
      allowedHosts: ['preview.pdyxs.wtf'],
      // The glob loader reads a changed file on the watcher event, with no
      // settling delay of its own. An editor that saves by truncate-then-write
      // (Obsidian does) can therefore be read at zero length: the entry parses
      // as empty frontmatter and empty body, and the *defaults* — no title, no
      // rendered html — are what gets written into `.astro/data-store.json`.
      // The card then renders as an untitled, bodiless shell until something
      // makes the loader read the file again. Waiting for the write to settle
      // is the fix; it costs 100ms on every content save.
      watch: {
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 10 },
      },
    },
    // Dev only: content YAML (`_config.yaml`, `*.tag.yaml`, `*.lens.yaml`) is
    // read by fs / consumed by a pre* generator, so nothing in the module graph
    // changes when it does. See scripts/dev-reload-plugin.mjs.
    plugins: [devReloadPlugin()],
  },
});
