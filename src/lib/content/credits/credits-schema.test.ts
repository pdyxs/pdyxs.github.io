import { describe, it, expect } from 'vitest';
import { collections } from '../../../content.config';

const schema = (collections.content as unknown as { schema: { parse(v: unknown): any; safeParse(v: unknown): { success: boolean } } }).schema;

describe('content schema: credits', () => {
  it('leaves an absent block undefined, not []', () => {
    expect(schema.parse({}).credits).toBeUndefined();
  });

  it('defaults listed to map', () => {
    expect(schema.parse({ credits: [{ name: 'Nick' }] }).credits[0].listed).toBe('map');
  });

  it('fails the build on an unknown listed value', () => {
    expect(schema.safeParse({ credits: [{ name: 'Nick', listed: 'both' }] }).success).toBe(false);
  });

  it('requires a name', () => {
    expect(schema.safeParse({ credits: [{ role: 'Designer' }] }).success).toBe(false);
  });
});
