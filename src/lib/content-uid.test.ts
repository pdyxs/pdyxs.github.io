import { describe, it, expect } from 'vitest';
import { uidFromContentPath, uidFromTagPath } from './content-uid';

describe('uidFromContentPath', () => {
  it('uidFromContentPath_plain_file: a top-level file becomes collection/id', () => {
    expect(uidFromContentPath('posts/about-me.md')).toBe('posts/about-me');
  });

  it('uidFromContentPath_mdx_extension: .mdx files are stripped the same as .md', () => {
    expect(uidFromContentPath('writing/why-portal.mdx')).toBe('writing/why-portal');
  });

  it('uidFromContentPath_index_file_drops_to_parent_dir: index.md yields the directory as id', () => {
    expect(uidFromContentPath('projects/art-heist/index.md')).toBe('projects/art-heist');
  });

  it('uidFromContentPath_nested_non_index: nested non-index files keep their full relative id', () => {
    expect(uidFromContentPath('stories/arctic/00.md')).toBe('stories/arctic/00');
  });
});

describe('uidFromTagPath', () => {
  it('uidFromTagPath_nested_file: nested tag files get a tag/ prefixed uid', () => {
    expect(uidFromTagPath('what/posts.yaml')).toBe('tag/what/posts');
  });

  it('uidFromTagPath_index_file_drops_to_parent_dir', () => {
    expect(uidFromTagPath('who/index.yaml')).toBe('tag/who');
  });
});
