// Travel log: maps date ranges to locations for where:* tag injection at build time.
//
// Each entry covers an inclusive date range. A null `to` means ongoing/present.
// Entries must be non-overlapping; gaps are valid (no where:* tag injected for gap dates).
//
// Location format: "continent/country/city" (e.g. "europe/uk/london"), except
// Australia, which is a top-level segment ("australia/sydney"). Where a row
// names no city the slug stops at the country level ("europe/iceland"). Prefix
// filtering is depth-agnostic, so selecting `where:europe` matches every
// European city and `where:australia` every Australian one.
//
// Derived from ~/notes/Exploration/Travel History.md. Each range runs from the
// row's arrival date to the day before the next arrival; transit rows fold into
// their destination, multi-city tour rows use a country-level slug, and
// consecutive same-location rows are merged.

export type TravelEntry = {
  location: string;   // e.g. "australia/sydney", "north-america/usa/san-francisco"
  from: string;       // ISO date "YYYY-MM-DD" (inclusive)
  to: string | null;  // ISO date "YYYY-MM-DD" (inclusive), null = ongoing/present
};

export const TRAVEL_LOG: TravelEntry[] = [
  // Sydney baseline: everything before the travel history begins (Feb 2015).
  { location: 'australia/sydney', from: '2000-01-01', to: '2015-02-23' },

  // 2015 — US → Europe → home
  { location: 'north-america/usa/chicago', from: '2015-02-24', to: '2015-02-26' },
  { location: 'north-america/usa/san-francisco', from: '2015-02-27', to: '2015-03-07' },
  { location: 'north-america/usa/boston', from: '2015-03-08', to: '2015-03-10' },
  { location: 'north-america/usa/new-york', from: '2015-03-11', to: '2015-03-20' },
  { location: 'europe/uk/london', from: '2015-03-21', to: '2015-03-23' },
  { location: 'europe/italy/venice', from: '2015-03-24', to: '2015-03-27' },
  { location: 'europe/italy/naples', from: '2015-03-28', to: '2015-04-03' },
  { location: 'europe/netherlands/amsterdam', from: '2015-04-04', to: '2015-04-15' },
  { location: 'australia/sydney', from: '2015-04-16', to: '2015-10-24' },
  { location: 'australia/melbourne', from: '2015-10-25', to: '2015-11-02' },
  { location: 'australia/sydney', from: '2015-11-03', to: '2016-05-13' },

  // 2016 — Europe trip, then home
  { location: 'europe/spain/barcelona', from: '2016-05-14', to: '2016-05-20' },
  { location: 'europe/france/paris', from: '2016-05-21', to: '2016-05-26' },
  { location: 'europe/germany/berlin', from: '2016-05-27', to: '2016-05-31' },
  { location: 'europe/turkey/istanbul', from: '2016-06-01', to: '2016-06-06' },
  { location: 'australia/sydney', from: '2016-06-07', to: '2016-06-08' },
  { location: 'australia/adelaide', from: '2016-06-09', to: '2016-06-09' },
  { location: 'australia/sydney', from: '2016-06-10', to: '2016-07-25' },
  { location: 'australia/melbourne', from: '2016-07-26', to: '2016-07-26' },
  { location: 'australia/sydney', from: '2016-07-27', to: '2016-10-30' },
  { location: 'australia/melbourne', from: '2016-10-31', to: '2016-11-06' },
  { location: 'australia/sydney', from: '2016-11-07', to: '2017-05-21' },

  // 2017 — long trip: Europe, Morocco, home, then SE Asia
  { location: 'europe/uk/london', from: '2017-05-22', to: '2017-06-04' },
  { location: 'europe/italy/palermo', from: '2017-06-05', to: '2017-07-01' },
  { location: 'europe/italy/rome', from: '2017-07-02', to: '2017-07-03' },
  { location: 'europe/switzerland', from: '2017-07-04', to: '2017-07-06' },
  { location: 'europe/germany/gottingen', from: '2017-07-07', to: '2017-07-08' },
  { location: 'europe/france/paris', from: '2017-07-09', to: '2017-07-14' },
  { location: 'europe/iceland', from: '2017-07-15', to: '2017-07-28' },
  { location: 'europe/uk/london', from: '2017-07-29', to: '2017-07-31' },
  { location: 'europe/uk/edinburgh', from: '2017-08-01', to: '2017-08-29' },
  { location: 'africa/morocco/taghazout', from: '2017-08-30', to: '2017-10-08' },
  { location: 'australia/sydney', from: '2017-10-09', to: '2017-10-21' },
  { location: 'australia/melbourne', from: '2017-10-22', to: '2017-11-13' },
  { location: 'australia/adelaide', from: '2017-11-14', to: '2017-11-17' },
  { location: 'australia/melbourne', from: '2017-11-18', to: '2017-11-19' },
  { location: 'asia/cambodia/phnom-penh', from: '2017-11-20', to: '2017-12-15' },
  { location: 'asia/cambodia/siem-reap', from: '2017-12-16', to: '2017-12-18' },
  { location: 'asia/thailand/ko-samui', from: '2017-12-19', to: '2017-12-23' },
  { location: 'asia/thailand/ko-pha-ngan', from: '2017-12-24', to: '2017-12-26' },
  { location: 'asia/thailand/bangkok', from: '2017-12-27', to: '2017-12-29' },
  { location: 'asia/vietnam/ho-chi-minh-city', from: '2017-12-30', to: '2018-01-04' },

  // 2018 — SE Asia, then Europe → Central/South America
  { location: 'asia/thailand/bangkok', from: '2018-01-05', to: '2018-01-05' },
  { location: 'asia/thailand/krabi', from: '2018-01-06', to: '2018-01-18' },
  { location: 'asia/indonesia/bali', from: '2018-01-19', to: '2018-03-17' },
  { location: 'asia/thailand/bangkok', from: '2018-03-18', to: '2018-04-18' },
  { location: 'europe/uk/london', from: '2018-04-19', to: '2018-04-22' },
  { location: 'europe/ireland/dublin', from: '2018-04-23', to: '2018-04-24' },
  { location: 'europe/germany/berlin', from: '2018-04-25', to: '2018-06-01' },
  { location: 'europe/switzerland/geneva', from: '2018-06-02', to: '2018-06-05' },
  { location: 'europe/norway/oslo', from: '2018-06-06', to: '2018-06-09' },
  { location: 'europe/norway/svalbard', from: '2018-06-10', to: '2018-06-26' },
  { location: 'europe/norway/oslo', from: '2018-06-27', to: '2018-07-02' },
  { location: 'europe/germany/berlin', from: '2018-07-03', to: '2018-07-18' },
  { location: 'europe/uk/london', from: '2018-07-19', to: '2018-07-24' },
  { location: 'north-america/panama', from: '2018-07-25', to: '2018-07-26' },
  { location: 'south-america/ecuador/quito', from: '2018-07-27', to: '2018-08-05' },
  { location: 'south-america/ecuador/galapagos', from: '2018-08-06', to: '2018-08-12' },
  { location: 'south-america/peru', from: '2018-08-13', to: '2018-09-22' },
  { location: 'north-america/usa/austin', from: '2018-09-23', to: '2018-10-04' },
  { location: 'north-america/usa/san-francisco', from: '2018-10-05', to: '2018-10-16' },
  { location: 'south-america/colombia/medellin', from: '2018-10-17', to: '2018-11-01' },
  { location: 'north-america/usa/washington-dc', from: '2018-11-02', to: '2018-11-26' },
  { location: 'south-america/colombia/cartagena', from: '2018-11-27', to: '2018-12-01' },
  { location: 'south-america/colombia/santa-marta', from: '2018-12-02', to: '2018-12-12' },
  { location: 'south-america/colombia/cartagena', from: '2018-12-13', to: '2018-12-17' },
  { location: 'south-america/colombia/medellin', from: '2018-12-18', to: '2018-12-22' },
  { location: 'south-america/colombia/guatape', from: '2018-12-23', to: '2018-12-27' },
  { location: 'south-america/colombia/manizales', from: '2018-12-28', to: '2019-01-12' },

  // 2019 — South America, home, then Europe → NZ
  { location: 'south-america/ecuador/quito', from: '2019-01-13', to: '2019-02-06' },
  { location: 'south-america/ecuador/cuenca', from: '2019-02-07', to: '2019-02-11' },
  { location: 'south-america/peru', from: '2019-02-12', to: '2019-03-06' },
  { location: 'south-america/bolivia', from: '2019-03-07', to: '2019-03-12' },
  { location: 'south-america/chile/santiago', from: '2019-03-13', to: '2019-03-16' },
  { location: 'australia/sydney', from: '2019-03-17', to: '2019-04-10' },
  { location: 'australia/perth', from: '2019-04-11', to: '2019-07-20' },
  { location: 'europe/uk/london', from: '2019-07-21', to: '2019-08-10' },
  { location: 'europe/uk/edinburgh', from: '2019-08-11', to: '2019-08-13' },
  { location: 'europe/denmark/copenhagen', from: '2019-08-14', to: '2019-08-17' },
  { location: 'europe/sweden', from: '2019-08-18', to: '2019-09-10' },
  { location: 'europe/switzerland', from: '2019-09-11', to: '2019-09-17' },
  { location: 'europe/germany/berlin', from: '2019-09-18', to: '2019-10-03' },
  { location: 'oceania/new-zealand/wellington', from: '2019-10-04', to: '2019-12-07' },
  { location: 'australia/sydney', from: '2019-12-08', to: '2020-03-11' },

  // 2020–2021 — mostly home (pandemic), Australian domestic trips
  { location: 'australia/brisbane', from: '2020-03-12', to: '2020-03-25' },
  { location: 'australia/sydney', from: '2020-03-26', to: '2021-03-05' },
  { location: 'australia/adelaide', from: '2021-03-06', to: '2021-03-20' },
  { location: 'australia/sydney', from: '2021-03-21', to: '2021-04-09' },
  { location: 'australia/canberra', from: '2021-04-10', to: '2021-04-11' },
  { location: 'australia/sydney', from: '2021-04-12', to: '2022-09-02' },

  // 2022 — UK trip, then home + domestic
  { location: 'asia/uae/dubai', from: '2022-09-03', to: '2022-09-04' },
  { location: 'europe/uk/scotland', from: '2022-09-05', to: '2022-09-19' },
  { location: 'europe/uk/bath', from: '2022-09-20', to: '2022-10-01' },
  { location: 'australia/melbourne', from: '2022-10-02', to: '2022-10-10' },
  { location: 'australia/sydney', from: '2022-10-11', to: '2023-06-07' },

  // 2023 — home + domestic
  { location: 'australia/brisbane', from: '2023-06-08', to: '2023-06-17' },
  { location: 'australia/sydney', from: '2023-06-18', to: '2023-10-11' },
  { location: 'australia/brisbane', from: '2023-10-12', to: '2023-10-15' },
  { location: 'australia/sydney', from: '2023-10-16', to: '2024-02-15' },

  // 2024 — domestic, then Europe trip
  { location: 'australia/adelaide', from: '2024-02-16', to: '2024-02-25' },
  { location: 'australia/sydney', from: '2024-02-26', to: '2024-05-16' },
  { location: 'australia/gold-coast', from: '2024-05-17', to: '2024-05-18' },
  { location: 'australia/sydney', from: '2024-05-19', to: '2024-05-24' },
  { location: 'australia/melbourne', from: '2024-05-25', to: '2024-05-26' },
  { location: 'australia/sydney', from: '2024-05-27', to: '2024-06-13' },
  { location: 'australia/melbourne', from: '2024-06-14', to: '2024-06-15' },
  { location: 'australia/sydney', from: '2024-06-16', to: '2024-08-20' },
  { location: 'europe/switzerland/st-gallen', from: '2024-08-21', to: '2024-09-03' },
  { location: 'europe/france/alsace', from: '2024-09-04', to: '2024-09-09' },
  { location: 'europe/france/provence', from: '2024-09-10', to: '2024-09-12' },
  { location: 'europe/spain', from: '2024-09-13', to: '2024-09-19' },
  { location: 'europe/spain/camino-de-santiago', from: '2024-09-20', to: '2024-09-29' },
  { location: 'australia/sydney', from: '2024-09-30', to: '2025-02-14' },

  // 2025 — NZ trip, then home + domestic
  { location: 'oceania/new-zealand/wellington', from: '2025-02-15', to: '2025-02-17' },
  { location: 'australia/sydney', from: '2025-02-18', to: '2025-10-08' },
  { location: 'australia/melbourne', from: '2025-10-09', to: '2025-10-12' },
  { location: 'australia/sydney', from: '2025-10-13', to: '2026-03-12' },

  // 2026 — domestic, then home (ongoing)
  { location: 'australia/adelaide', from: '2026-03-13', to: '2026-03-22' },
  { location: 'australia/sydney', from: '2026-03-23', to: '2026-06-03' },
  { location: 'australia/hervey-bay', from: '2026-06-04', to: '2026-06-07' },
  { location: 'australia/sydney', from: '2026-06-08', to: null },
];
