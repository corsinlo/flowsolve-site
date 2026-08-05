import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const firstPartyDirectories = ['src', 'tests', 'scripts'];

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

function firstPartyFiles(): string[] {
  const rootConfigs = readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.config\.[cm]?[jt]sx?$/.test(entry.name))
    .map((entry) => join(projectRoot, entry.name));
  const directoryFiles = firstPartyDirectories.flatMap((directory) => {
    const path = join(projectRoot, directory);
    return existsSync(path) ? filesIn(path) : [];
  });

  return [...rootConfigs, ...directoryFiles];
}

function importedPackages(files: string[]): string[] {
  return files.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const staticSpecifiers = [...source.matchAll(
      /\b(?:import|export)\s*(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    )].map((match) => match[1]);
    const dynamicSpecifiers = [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((match) => match[1]);

    return [...staticSpecifiers, ...dynamicSpecifiers];
  });
}

describe('static public baseline', () => {
  it('uses the public package identity without private package dependencies or first-party imports', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    const imports = importedPackages(firstPartyFiles());

    expect(packageJson.name).toBe('@flowsolve/site');
    expect(packageNames.filter((name) => name.startsWith('@flowsolve/'))).toEqual([]);
    expect(imports.filter((specifier) => specifier.startsWith('@flowsolve/'))).toEqual([]);
  });

  it('does not publish repository, private package, or private API markers', () => {
    const artifact = filesIn(join(projectRoot, 'dist'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const disallowedBrandMarker = ['flowsolve', 'pilot'].join('-');
    const privateMarkers = new RegExp([
      'corsinlo\\/flowsolve',
      disallowedBrandMarker,
      '@flowsolve\\/',
      'private[_-]?api',
      'api[_-]?key',
    ].join('|'), 'i');

    expect(artifact).not.toMatch(privateMarkers);
  });
});
