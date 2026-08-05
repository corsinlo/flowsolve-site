import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('finalized deployment artifact', () => {
  it('contains no deployable source maps and keeps the client manifest private', () => {
    expect(lstatSync(dist).isDirectory()).toBe(true);
    expect(deployableSourceMaps(dist)).toEqual([]);
    expect(existsSync(join(projectRoot, '.astro/manifest-client-assets.json'))).toBe(true);
    expect(existsSync(join(dist, '_astro/manifest-client-assets.json'))).toBe(false);
  });
});
