import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: './src/test/vitest-env.ts',
    globals: true,
  },
});
