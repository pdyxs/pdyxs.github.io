// The dimension seam (issue #76, DEC-008). Consumers import from here.
export type {
  Dimension,
  DimensionId,
  DimensionPlacement,
  DimensionSelection,
  FilterState,
  MatchContext,
  NodeContext,
  ParamPair,
} from './types';

export {
  DIMENSIONS,
  clearDimension,
  dimensionById,
  emptyFilterState,
  hasAnySelection,
  isDimensionVisible,
  makeMatchContext,
  selectedValues,
  selectionFor,
  toggleValue,
} from './registry';

export { applyFilters, countSelectedValueMatches } from './apply';
export {
  filterStateFromParams,
  filterStateToParams,
  filterUrlForTagValue,
  stripFilterParams,
} from './params';

export { STATUS_ROOT_VALUE } from './status';
