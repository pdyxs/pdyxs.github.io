// Composition root for URL-param providers.
//
// Kept separate from url-params.ts (the contract) and from param-codecs.ts
// (the mechanism) so neither has to know who the providers are: the contract
// stays import-free, and the mechanism reads this list without any provider
// importing the mechanism back.
import { filterParamProvider } from '../dimensions/provider';
import type { UrlParamProvider } from './url-params';

/** Every subsystem that owns part of a location's URL params. */
export const URL_PARAM_PROVIDERS: readonly UrlParamProvider<any>[] = [
  filterParamProvider,
];
