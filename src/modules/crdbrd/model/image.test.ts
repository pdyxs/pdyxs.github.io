import { describe, it, expect } from 'vitest';
import { blank } from './game.ts';
import { addConcept, addEntity, addProperty, removeConcept, removeEntity, setEntityValue, setGameValue, setImageSlot, setImageVariesBy } from './ops.ts';
import { validate } from './validate.ts';
import type { Game } from './types.ts';
import { imageFor } from './image.ts';

function fighters() {
  let g = addConcept(blank(), { id: 'fighter', name: 'Fighter' });
  g = addEntity(g, { concept: 'fighter', id: 'knight', name: 'Knight' });
  g = addProperty(g, { owner: 'fighter', id: 'art', name: 'Art', type: { kind: 'image' } });
  return g;
}

describe('imageFor: plain image', () => {
  it('returns the stored filename', () => {
    const g = setEntityValue(fighters(), 'knight', 'art', 'knight.png');
    expect(imageFor(g, { entity: 'knight' }, 'art', {})).toEqual({ file: 'knight.png' });
  });

  it('is a gap, not a throw, when nothing is stored', () => {
    expect(imageFor(fighters(), { entity: 'knight' }, 'art', {})).toEqual({ gap: 'no image set' });
  });

  it('is a gap for an unknown owner, unknown property or non-image property', () => {
    let g = addProperty(fighters(), { id: 'title', name: 'Title' });
    expect(imageFor(g, { entity: 'nobody' }, 'art', {})).toEqual({ gap: 'no such owner' });
    expect(imageFor(g, { entity: 'knight' }, 'nope', {})).toEqual({ gap: 'no such property' });
    g = addProperty(g, { id: 'gtitle', name: 'T' });
    expect(imageFor(g, { entity: 'knight' }, 'title', {})).toEqual({ gap: 'not an image property' });
  });

  it('reads game-level values too', () => {
    let g = addProperty(blank(), { id: 'logo', name: 'Logo', type: { kind: 'image' } });
    g = setGameValue(g, 'logo', 'logo.svg');
    expect(imageFor(g, 'game', 'logo', {})).toEqual({ file: 'logo.svg' });
  });
});

function varying() {
  let g = fighters();
  g = addConcept(g, { id: 'player', name: 'Player' });
  g = addEntity(g, { concept: 'player', id: 'red', name: 'Red' });
  g = addEntity(g, { concept: 'player', id: 'blue', name: 'Blue' });
  g = setImageVariesBy(g, 'art', 'player');
  g = setImageSlot(g, 'knight', 'art', 'red', 'knight-red.png');
  return g;
}
const art = (g: Game) => g.concepts[0].entities[0].values.art;
const knight = { entity: 'knight' };

describe('imageFor: varies-by', () => {
  it('returns the file for the bound entity', () => {
    expect(imageFor(varying(), knight, 'art', { player: 'red' })).toEqual({ file: 'knight-red.png' });
  });

  it('ignores bindings for other concepts', () => {
    expect(imageFor(varying(), knight, 'art', { player: 'red', era: 'x' })).toEqual({ file: 'knight-red.png' });
  });

  it('is a gap for a missing combination, an unbound concept and an unknown bound entity', () => {
    const g = varying();
    expect(imageFor(g, knight, 'art', { player: 'blue' })).toEqual({ gap: 'no image for player blue' });
    expect(imageFor(g, knight, 'art', {})).toEqual({ gap: 'not bound to player' });
    expect(imageFor(g, knight, 'art', { player: 'green' })).toEqual({ gap: 'no such player entity green' });
  });
});

describe('image ops', () => {
  it('stores slots keyed by binding key, filenames only', () => {
    expect(art(varying())).toEqual({ 'player=red': 'knight-red.png' });
  });

  it('clears one slot with null', () => {
    expect(art(setImageSlot(varying(), 'knight', 'art', 'red', null))).toBeUndefined();
  });

  it('clears values when the varies-by concept changes or is removed from the declaration', () => {
    let g = addConcept(varying(), { id: 'era', name: 'Era' });
    expect(art(setImageVariesBy(g, 'art', 'era'))).toBeUndefined();
    expect(art(setImageVariesBy(g, 'art', null))).toBeUndefined();
    expect(art(setImageVariesBy(g, 'art', 'player'))).toEqual({ 'player=red': 'knight-red.png' });
  });

  it('deleting an entity of the varies-by concept removes its slots', () => {
    let g = setImageSlot(varying(), 'knight', 'art', 'blue', 'knight-blue.png');
    g = removeEntity(g, 'red');
    expect(art(g)).toEqual({ 'player=blue': 'knight-blue.png' });
  });

  it('deleting the varies-by concept drops the declaration and the values', () => {
    const g = removeConcept(varying(), 'player');
    expect(art(g)).toBeUndefined();
    expect(g.concepts[0].properties[0].type).toEqual({ kind: 'image' });
  });
});

describe('validate: images', () => {
  it('accepts plain and varies-by values, rejects orphans and wrong shapes', () => {
    expect(validate(varying())).toEqual([]);
    const bad = setEntityValue(varying(), 'knight', 'art', { 'player=ghost': 'x.png' });
    expect(validate(bad)).toEqual(['entity "knight" has an image for missing entity "ghost" in "art"']);
    expect(validate(setEntityValue(varying(), 'knight', 'art', 'plain.png'))).toEqual(['entity "knight" value for "art" does not fit its type']);
    const plain = setEntityValue(fighters(), 'knight', 'art', { 'player=red': 'x.png' });
    expect(validate(plain)).toEqual(['entity "knight" value for "art" does not fit its type']);
    expect(validate(setEntityValue(fighters(), 'knight', 'art', 'https://x/y.png'))).toEqual(['entity "knight" value for "art" does not fit its type']);
  });

  it('rejects a varies-by concept that does not exist', () => {
    const g = addProperty(blank(), { id: 'p', name: 'P', type: { kind: 'image', variesBy: 'ghost' } });
    expect(validate(g)).toEqual(['property "p" varies by missing concept "ghost"']);
  });
});
