import { getContext, setContext } from 'svelte';

// What a DitherLayer or HitLayer needs from its DitherSvg: the viewBox, the box's px size,
// and the transform that maps viewBox coords onto it. Getters, so reads stay reactive.
export type DitherSvgContext = {
  readonly viewBox: string;
  readonly width: number;
  readonly transform: string;
};

const KEY = Symbol('dither-svg');

export function setDitherSvgContext(ctx: DitherSvgContext) {
  setContext(KEY, ctx);
}

export function getDitherSvgContext(): DitherSvgContext {
  const ctx = getContext<DitherSvgContext>(KEY);
  if (!ctx) throw new Error('<DitherLayer> / <HitLayer> must be rendered inside <DitherSvg>');
  return ctx;
}
