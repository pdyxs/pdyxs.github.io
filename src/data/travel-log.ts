// Travel log: maps date ranges to locations for where:* tag injection at build time.
//
// Each entry covers an inclusive date range. A null `to` means ongoing/present.
// Entries must be non-overlapping; gaps are valid (no where:* tag injected for gap dates).
//
// Location format: "continent-or-country/city-or-region", e.g. "australia/sydney".
// This becomes the tag value: where:australia/sydney.
//
// NOTE: This is a placeholder travel log with plausible data for Paul Sztajer,
// a software developer based in Sydney, Australia. Replace with real data when available.

export type TravelEntry = {
  location: string;   // e.g. "australia/sydney", "usa/san-francisco"
  from: string;       // ISO date "YYYY-MM-DD" (inclusive)
  to: string | null;  // ISO date "YYYY-MM-DD" (inclusive), null = ongoing/present
};

export const TRAVEL_LOG: TravelEntry[] = [
  // Early life / university in Sydney
  { location: 'australia/sydney', from: '2000-01-01', to: '2014-12-31' },

  // US stint (San Francisco tech scene)
  { location: 'usa/san-francisco', from: '2015-01-01', to: '2018-06-30' },

  // Travel / between moves
  { location: 'europe/london', from: '2018-07-01', to: '2018-12-31' },

  // Back to Sydney
  { location: 'australia/sydney', from: '2019-01-01', to: null },
];
