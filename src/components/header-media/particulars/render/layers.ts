// Every visual layer the toy can stack around its SVG. Order here breaks z ties.
import type { LayerDef } from './types';
import { chargeLayer } from './charge';
import { trailsLayer } from './trails';
import { blobsLayer } from './blobs';
import { bodiesLayer } from './bodies';

export const LAYERS: readonly LayerDef[] = [chargeLayer, trailsLayer, blobsLayer, bodiesLayer];
