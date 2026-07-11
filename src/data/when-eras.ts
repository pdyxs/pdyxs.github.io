// When eras: maps date ranges to named life/career eras for when:* tag injection
// at build time. The temporal twin of the travel log (src/data/travel-log.ts) —
// where that derives geographic where:* tags, this derives when:<era>/<year>/<month>.
//
// Each entry covers an inclusive date range. A null `to` means ongoing/present.
// Entries must be non-overlapping AND contiguous (no gaps): every card date is
// expected to resolve to exactly one era, so the earliest entry's `from` is a
// low baseline (not the literal start of uni), mirroring the travel log's
// pre-history baseline row.
//
// The `when` hierarchy the drill-down panel navigates is <era>/<year>/<month>;
// only the leaf tag is emitted per card, and buildTagHierarchy synthesises the
// `when:<era>` and `when:<era>/<year>` ancestor nodes. `label` is the era's
// display name (surfaced via generatedDisplayName in filter-generators.ts) —
// years humanise to themselves and months are mapped to month names there.

export type WhenEra = {
  slug: string;        // era path segment, e.g. "seethrough"
  label: string;       // display name for the when:<slug> node
  from: string;        // ISO date "YYYY-MM-DD" (inclusive)
  to: string | null;   // ISO date "YYYY-MM-DD" (inclusive), null = ongoing/present
};

export const WHEN_ERAS: WhenEra[] = [
  { slug: 'uni',        label: 'University',         from: '2000-01-01', to: '2009-12-31' },
  { slug: 'seethrough', label: 'SeeThrough Studios', from: '2010-01-01', to: '2014-12-31' },
  { slug: 'edtech',     label: 'EdTech',             from: '2015-01-01', to: '2016-12-31' },
  { slug: 'nomad',      label: 'Nomad',              from: '2017-01-01', to: '2019-12-31' },
  { slug: 'current',    label: 'Current',            from: '2020-01-01', to: null },
];
