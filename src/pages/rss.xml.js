import rss from '@astrojs/rss';

export async function GET(context) {
  return rss({
    title: 'pdyxs.wtf',
    description: 'Paul Sztajer — writing, projects, and work',
    site: context.site,
    items: [],
    customData: `<language>en-us</language>`,
  });
}
