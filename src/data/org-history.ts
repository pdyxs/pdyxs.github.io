export type OrgEntry = {
  slug: string;       // e.g. "accenture", "freelance", "university-of-sydney"
  from: string;       // ISO date "YYYY-MM-DD" (inclusive)
  to: string | null;  // ISO date "YYYY-MM-DD" (inclusive), null = ongoing
};

/**
 * Paul's organisation history in chronological order.
 * Each entry maps a date range to the org he was primarily associated with.
 * The `who:` tag value for a card dated within an entry's range becomes `who:<slug>`.
 */
export const ORG_HISTORY: OrgEntry[] = [
  { slug: 'university-of-sydney',  from: '2005-01-01', to: '2010-12-31' },
  { slug: 'accenture',             from: '2011-01-01', to: '2013-06-30' },
  { slug: 'freelance',             from: '2013-07-01', to: '2015-01-31' },
  { slug: 'pivotal',               from: '2015-02-01', to: '2018-05-31' },
  { slug: 'freelance',             from: '2018-06-01', to: '2020-12-31' },
  { slug: 'canva',                 from: '2021-01-01', to: '2023-06-30' },
  { slug: 'freelance',             from: '2023-07-01', to: null          },
];
