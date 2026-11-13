import { describe, expect, it } from 'vitest';
import { ATLAS } from './atlas/atlas-map';
import { UNITY } from './palette';
import { bodyLayers, isPlayerColourLayer, lighten, spriteFor, type BodySpec } from './recipe';

const has = (n: string) => n in ATLAS;
const spec = (o: Partial<BodySpec>): BodySpec => ({ type: 'up', parity: 1, colour: 'white', isPlayer: false, strong: false, ...o });

describe('spriteFor', () => {
  it('uses the matter, anti and player sprites as the original atlas names them', () => {
    expect(spriteFor(spec({}), 0, has)).toBe('up0');
    expect(spriteFor(spec({ parity: -1 }), 0, has)).toBe('aup0');
    expect(spriteFor(spec({ isPlayer: true }), 2, has)).toBe('up2player');
    expect(spriteFor(spec({ type: 'electron', parity: -1 }), 1, has)).toBe('positron1');
  });

  it('gives an antiparticle the white pupil under the strong force, so its colour reads', () => {
    expect(spriteFor(spec({ parity: -1 }), 5, has)).toBe('aup5');
    expect(spriteFor(spec({ parity: -1, strong: true }), 5, has)).toBe('up5');
  });

  it('skips layers the type has no sprite for', () => {
    expect(spriteFor(spec({}), 3, has)).toBeNull();
    expect(spriteFor(spec({ type: 'W' }), 0, has)).toBeNull();
    expect(spriteFor(spec({ type: 'muonNeutrino', parity: -1 }), 0, has)).toBe('neutrino0');
  });
});

describe('bodyLayers', () => {
  it('stacks body, glow, iris and pupil bottom first', () => {
    expect(bodyLayers(spec({}), UNITY, has).map((l) => l.sprite)).toEqual(['up0', 'up1', 'up2', 'up5']);
  });

  it('tints the glow by the charge after parity', () => {
    const glow = (o: Partial<BodySpec>) => bodyLayers(spec(o), UNITY, has).find((l) => l.layer === 1)!.tint;
    expect(glow({})).toEqual(UNITY.glowPos);
    expect(glow({ parity: -1 })).toEqual(UNITY.glowNeg);
    expect(glow({ type: 'down' })).toEqual(UNITY.glowNeg);
    expect(glow({ type: 'W' })[3]).toBe(1);
  });

  it("colours the pupil only while the strong force is on", () => {
    const pupil = (o: Partial<BodySpec>) => bodyLayers(spec(o), UNITY, has).find((l) => l.layer === 5)!.tint;
    expect(pupil({ colour: 'red' })).toEqual([1, 1, 1, 1]);
    expect(pupil({ colour: 'red', strong: true })).toEqual(UNITY.strong.red);
    expect(pupil({ colour: 'white', strong: true })).toEqual([1, 1, 1, 1]);
  });

  it("puts the player colour on the player's iris layers", () => {
    const layers = bodyLayers(spec({ isPlayer: true }), UNITY, has);
    expect(layers.find((l) => l.layer === 2)!.tint).toEqual(UNITY.player);
    expect(layers.find((l) => l.layer === 0)!.tint).toEqual([1, 1, 1, 1]);
  });
});

describe('player layer rules', () => {
  it('matches ParticleMeshUtil.isplayer', () => {
    expect([0, 1, 2, 3, 4, 5].map((l) => isPlayerColourLayer(l, 'up'))).toEqual([false, false, true, true, true, false]);
    expect(isPlayerColourLayer(2, 'top')).toBe(false);
  });

  it('lightens like ColorUtils.lighten', () => {
    expect(lighten([0.5, 0.5, 0.5, 1], 0.5)).toEqual([0.75, 0.75, 0.75, 1]);
    expect(lighten([1, 1, 1, 1], 0.5)).toEqual([1, 1, 1, 1]);
    // Past white it blends the *unscaled* colour into grey, as the original does.
    const c = lighten([0.2, 0.8, 0.2, 1], 0.5);
    expect(c[0]).toBeCloseTo(1 / 3);
    expect(c[1]).toBeCloseTo(0.7333);
  });
});
