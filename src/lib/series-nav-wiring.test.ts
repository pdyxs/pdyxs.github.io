import { describe, it, expect } from 'vitest';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import { resolveNavRenderer } from './location-resolver';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';

// Regression guard for the stale-registration bug: story chapters live under
// `what/posts/stories/`, but the nav renderer was once keyed by a hardcoded
// `what/stories` path prefix that no longer matched, so the series prev/next
// nav silently stopped rendering. Nav renderers now cascade by name from
// `_config.yaml` (navRenderer: series). This test reads the REAL content tree,
// so if stories move again without updating their config, it fails here rather
// than silently dropping the nav shell in production.
describe('series nav renderer wiring (real content tree)', () => {
  it('resolves a story chapter to the SeriesNavRenderer via its cascaded navRenderer', async () => {
    const cascade = await resolveFolderCascade(
      'what/posts/stories/arctic/00-introduction',
      makeFileReader(),
    );
    expect(cascade.navRenderer).toBe('series');
    expect(resolveNavRenderer(cascade.navRenderer)).toBe(SeriesNavRenderer);
  });

  it('leaves a non-story card with no nav renderer', async () => {
    const cascade = await resolveFolderCascade(
      'what/posts/2018-07-15-its-been-a-few-weeks-since',
      makeFileReader(),
    );
    expect(resolveNavRenderer(cascade.navRenderer)).toBeNull();
  });
});
