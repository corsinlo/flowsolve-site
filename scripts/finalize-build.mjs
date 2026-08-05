import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url));

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function assertInside(root, candidate, description) {
  if (!isInside(root, candidate)) {
    throw new Error(`${description} resolves outside the build directory: ${candidate}`);
  }
}

async function collectDeployableSourceMaps(root, realRoot) {
  const sourceMaps = [];

  async function visit(directory) {
    const directoryStat = await lstat(directory);
    if (directoryStat.isSymbolicLink()) {
      throw new Error(`Build directory traversal encountered a symbolic link: ${directory}`);
    }
    if (!directoryStat.isDirectory()) {
      throw new Error(`Expected a build directory, received: ${directory}`);
    }

    const realDirectory = await realpath(directory);
    assertInside(realRoot, realDirectory, 'Build directory');

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = path.resolve(directory, entry.name);
      assertInside(root, candidate, 'Build artifact');

      if (entry.isSymbolicLink()) {
        throw new Error(`Deploy artifact contains a symbolic link: ${candidate}`);
      }
      if (entry.isDirectory()) {
        await visit(candidate);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Deploy artifact contains an unsupported file type: ${candidate}`);
      }

      const candidateStat = await lstat(candidate);
      if (candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
        throw new Error(`Deploy artifact changed during finalization: ${candidate}`);
      }
      assertInside(realRoot, await realpath(candidate), 'Build artifact');
      if (entry.name.toLowerCase().endsWith('.map')) sourceMaps.push(candidate);
    }
  }

  await visit(root);
  return sourceMaps.sort();
}

async function assertSafeSourceMap(root, realRoot, sourceMap) {
  assertInside(root, sourceMap, 'Source map');
  if (!path.basename(sourceMap).toLowerCase().endsWith('.map')) {
    throw new Error(`Refusing to remove a non-map artifact: ${sourceMap}`);
  }

  const sourceMapStat = await lstat(sourceMap);
  if (sourceMapStat.isSymbolicLink() || !sourceMapStat.isFile()) {
    throw new Error(`Refusing to remove an unsafe source-map entry: ${sourceMap}`);
  }
  assertInside(realRoot, await realpath(path.dirname(sourceMap)), 'Source-map directory');
  assertInside(realRoot, await realpath(sourceMap), 'Source map');
}

export async function finalizeBuild(buildRoot = DEFAULT_DIST) {
  const root = path.resolve(buildRoot);
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Build root must not be a symbolic link: ${root}`);
  }
  if (!rootStat.isDirectory()) throw new Error(`Build root is not a directory: ${root}`);

  const realRoot = await realpath(root);
  const sourceMaps = await collectDeployableSourceMaps(root, realRoot);
  for (const sourceMap of sourceMaps) {
    await assertSafeSourceMap(root, realRoot, sourceMap);
    try {
      await unlink(sourceMap);
    } catch (error) {
      throw new Error(`Failed to remove generated source map ${sourceMap}: ${error.message}`, {
        cause: error,
      });
    }
  }

  const remaining = await collectDeployableSourceMaps(root, realRoot);
  if (remaining.length > 0) {
    throw new Error(`Deploy artifact still contains source maps: ${remaining.join(', ')}`);
  }

  return {
    removed: sourceMaps.map((file) => path.relative(root, file).split(path.sep).join('/')),
  };
}

async function main() {
  const result = await finalizeBuild();
  process.stdout.write(`Finalized deploy artifact: removed ${result.removed.length} source map(s).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
