import { describe, it, expect } from 'vitest';
import { collections } from './content.config';

const schema = (collections.content as unknown as { schema: { safeParse(v: unknown): { success: boolean; error?: { message: string } } } }).schema;

describe('content schema: surface / surfaceOn', () => {
  it('rejects an unknown surface value', () => {
    const r = schema.safeParse({ surface: 'fullscreen' });
    expect(r.success).toBe(false);
  });

  it('rejects surfaceOn without surface, with a message naming both keys', () => {
    const r = schema.safeParse({ surfaceOn: 'mobile' });
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/surfaceOn[\s\S]*surface/);
  });

  it('rejects an unknown surfaceOn value', () => {
    expect(schema.safeParse({ surface: 'viewport', surfaceOn: 'tablet' }).success).toBe(false);
  });

  it.each(['mobile', 'desktop', 'both'])('accepts surfaceOn: %s alongside surface', (surfaceOn) => {
    expect(schema.safeParse({ surface: 'viewport', surfaceOn }).success).toBe(true);
  });

  it('accepts surface alone and neither key', () => {
    expect(schema.safeParse({ surface: 'viewport' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });
});
