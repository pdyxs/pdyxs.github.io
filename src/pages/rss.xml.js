import rss from '@astrojs/rss';
import { getAllCards } from '../lib/cards';
import { buildFeedItems } from '../lib/rss';

export async function GET(context) {
  const cards = await getAllCards();
  // buildFeedItems filters to `.visibility.listed` cards (see
  // computeStatusVisibility) — a draft/scheduled(future)/archived/unlisted
  // card never reaches the feed, the same rule the tag registry and
  // browse/lens pool already apply.
  const items = buildFeedItems(cards);

  return rss({
    title: 'pdyxs.wtf',
    description: 'Paul Sztajer — writing, projects, and work',
    site: context.site,
    items,
    customData: `<language>en-us</language>`,
  });
}
