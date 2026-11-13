import type { LayerDef } from './types';

/**
 * Which variant each layer runs, decided from a query string. `?pv-trails=b`
 * picks variant b of the trails layer; `?pv-trails=off` turns it off; an
 * unknown variant falls back to the default. Pure.
 */
export function chooseVariants(defs: readonly LayerDef[], search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const d of defs) {
    const asked = params.get(`pv-${d.id}`);
    out[d.id] = asked === 'off' || (asked !== null && d.variants.includes(asked)) ? asked : d.defaultVariant;
  }
  return out;
}
