import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const runsStaticSuite = process.argv.includes('tests/static');

export default defineConfig({
  plugins: [react()],
  test: {
    include: runsStaticSuite ? ['tests/static/**/*.test.{ts,tsx}'] : ['src/**/*.test.{ts,tsx}'],
    exclude: runsStaticSuite ? ['tests/e2e/**'] : ['tests/static/**', 'tests/e2e/**'],
  },
});
