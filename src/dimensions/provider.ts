// The dimension registry as a UrlParamProvider — the filter slice of a
// location's URL, owned end to end (issue #76, DEC-008).
import type { ParamPair, UrlParamProvider } from '../lib/url-params';
import { DIMENSIONS } from './registry';
import { filterStateFromParams, filterStateToParams } from './params';
import { filterCodec } from './codec';
import type { FilterState } from './types';

export const filterParamProvider: UrlParamProvider<FilterState> = {
  id: 'filters',

  // Folded from each dimension's own declaration rather than listed here, so
  // registering a dimension makes its params strippable with no second edit.
  get paramKeys(): readonly string[] {
    return DIMENSIONS.flatMap(d => d.paramKeys);
  },

  toParams(state: FilterState): ParamPair[] {
    return [...filterStateToParams(state)] as ParamPair[];
  },

  fromParams(params: URLSearchParams): FilterState {
    return filterStateFromParams(params);
  },

  codecs: [filterCodec],
};
