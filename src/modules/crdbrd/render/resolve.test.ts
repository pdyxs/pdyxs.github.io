import { describe, it, expect } from 'vitest';
import { resolve } from './resolve.ts';
import { blank } from '../model/game.ts';
import type { Instance } from '../model/expand.ts';
import type { ComponentSet, Layer } from '../model/types.ts';

const instance: Instance = { component: 'k', index: 0, bound: {}, values: {} };
const game = blank();
const set = (over: Partial<ComponentSet> = {}): ComponentSet => ({ id: 's', name: 'S', substitute: '', properties: [], components: [], children: [], size: { width: 60, height: 80 }, bleed: 3, ...over });

describe('resolve: an empty card', () => {
  it('has the page size including bleed, the cut path, and no items', () => {
    const scene = resolve(set(), instance, game);
    expect(scene.size).toEqual({ width: 60, height: 80 });
    expect(scene.bleed).toBe(3);
    expect(scene.page).toEqual({ x: -3, y: -3, width: 66, height: 86 });
    expect(scene.cutPath).toBe('M0 0H60V80H0Z');
    expect(scene.items).toEqual([]);
  });
});
