import { describe, it, expect } from 'vitest';
import { collapseCollections } from './collapse';
import type { FolderIdentity } from './collapse';
import type { CollapseConfig } from './collapse-config';
import { fakeCardMeta } from '../test/fixtures';

const ARCTIC = 'what/posts/stories/arctic';

/** Three arctic chapters + one unrelated post. */
function arcticCards() {
  return [
    fakeCardMeta({
      uid: `${ARCTIC}/00-intro`, title: 'Intro', order: 0,
      date: new Date('2018-06-18'), tags: ['what:posts/stories/arctic', 'where:europe/norway/svalbard'],
    }),
    fakeCardMeta({
      uid: `${ARCTIC}/01-map`, title: 'Map', order: 1,
      date: new Date('2018-07-01'), tags: ['what:posts/stories/arctic', 'when:2018'],
    }),
    fakeCardMeta({
      uid: `${ARCTIC}/02-glacier`, title: 'Glacier', order: 2,
      date: new Date('2018-07-20'), tags: ['what:posts/stories/arctic', 'why:science'],
    }),
    fakeCardMeta({ uid: 'what/posts/other', title: 'Other', tags: ['what:posts'] }),
  ];
}

const identity: (i: Record<string, FolderIdentity>) => (v: string) => FolderIdentity =
  (map) => (v) => map[v] ?? {};

describe('collapseCollections', () => {
  it('returns the input untouched when config is empty', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map();
    expect(collapseCollections(cards, config, () => ({}))).toBe(cards);
  });

  it('replaces every member of a collapsed folder with a single representative', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const result = collapseCollections(cards, config, () => ({}));

    const arctic = result.filter(c => c.uid.startsWith(`${ARCTIC}/`));
    expect(arctic).toHaveLength(1);
    // The unrelated post survives.
    expect(result.some(c => c.uid === 'what/posts/other')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('uses the lowest-order member as the representative destination', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.uid).toBe(`${ARCTIC}/00-intro`);
  });

  it('honours an explicit target slug over order', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, { target: '02-glacier' }]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.uid).toBe(`${ARCTIC}/02-glacier`);
  });

  it('falls back to lowest-order when the target slug matches no member', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, { target: 'does-not-exist' }]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.uid).toBe(`${ARCTIC}/00-intro`);
  });

  it('takes title/description from the folder identity, not the destination card', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const [rep] = collapseCollections(
      cards, config,
      identity({ 'what:posts/stories/arctic': { name: 'The Arctic Circle', description: 'Dispatches from Svalbard.' } }),
    );
    expect(rep.title).toBe('The Arctic Circle');
    expect(rep.description).toBe('Dispatches from Svalbard.');
  });

  it('falls back to the destination card title when the folder declares no identity', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.title).toBe('Intro');
  });

  it('carries the union of all member tags so any chapter filter still matches', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.tags).toEqual([
      'what:posts/stories/arctic',
      'where:europe/norway/svalbard',
      'when:2018',
      'why:science',
    ]);
  });

  it('sorts by the latest member date', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const [rep] = collapseCollections(cards, config, () => ({}));
    expect(rep.date).toEqual(new Date('2018-07-20'));
  });

  it('keeps the representative at the destination card\'s original position', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([[ARCTIC, {}]]);
    const result = collapseCollections(cards, config, () => ({}));
    // Destination (00-intro) was first, other post last — order preserved.
    expect(result.map(c => c.uid)).toEqual([`${ARCTIC}/00-intro`, 'what/posts/other']);
  });

  it('skips a configured folder that has no member cards', () => {
    const cards = arcticCards();
    const config: CollapseConfig = new Map([['what/posts/stories/empty', {}]]);
    expect(collapseCollections(cards, config, () => ({}))).toHaveLength(4);
  });
});
