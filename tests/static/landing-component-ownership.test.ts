import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const plannedComponent = 'src/components/landing/LandingPage.astro';
const topLevelComponent = 'src/components/LandingPage.astro';

describe('landing component ownership', () => {
  it('uses Task 3’s planned landing component path from both route entries', () => {
    expect(existsSync(join(projectRoot, plannedComponent))).toBe(true);
    expect(existsSync(join(projectRoot, topLevelComponent))).toBe(false);

    for (const route of ['src/pages/index.astro', 'src/pages/[locale]/index.astro']) {
      expect(readFileSync(join(projectRoot, route), 'utf8')).toContain("components/landing/LandingPage.astro");
      expect(readFileSync(join(projectRoot, route), 'utf8')).not.toContain("components/LandingPage.astro");
    }
  });
});
