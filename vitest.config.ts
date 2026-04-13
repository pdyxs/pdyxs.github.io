import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: './src/test/vitest-env.ts',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: true,
  },
});
