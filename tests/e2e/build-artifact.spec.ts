import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = new URL('../..', import.meta.url).pathname;
const dist = join(projectRoot, 'dist');

function deployableSourceMaps(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Deploy artifact contains a symbolic link: ${file}`);
    return entry.isDirectory()
      ? deployableSourceMaps(file)
      : entry.isFile() && entry.name.toLowerCase().endsWith('.map')
        ? [file]
        : [];
  });
}

test('the E2E build is the finalized deployment artifact', () => {
  expect(deployableSourceMaps(dist)).toEqual([]);
  expect(existsSync(join(projectRoot, '.astro/manifest-client-assets.json'))).toBe(true);
  expect(existsSync(join(dist, '_astro/manifest-client-assets.json'))).toBe(false);
});
