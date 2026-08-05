import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { finalizeBuild } from './finalize-build.mjs';

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flowsolve-finalize-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

test('removes nested source maps while preserving every non-map artifact', async () => {
  await withTemporaryDirectory(async (workspace) => {
    const dist = path.join(workspace, 'dist');
    const privateManifest = path.join(workspace, '.astro/manifest-client-assets.json');
    await mkdir(path.join(dist, '_astro/nested'), { recursive: true });
    await mkdir(path.dirname(privateManifest), { recursive: true });
    await writeFile(path.join(dist, '_astro/app.js.map'), 'first private source map');
    await writeFile(path.join(dist, '_astro/nested/styles.CSS.MAP'), 'second private source map');
    await writeFile(path.join(dist, '_astro/app.js'), 'export const app = true;');
    await writeFile(path.join(dist, '_astro/settings.map.json'), '{"public":true}');
    await writeFile(privateManifest, '{"private":true}');

    const result = await finalizeBuild(dist);

    assert.deepEqual(result.removed, [
      '_astro/app.js.map',
      '_astro/nested/styles.CSS.MAP',
    ]);
    assert.equal(await exists(path.join(dist, '_astro/app.js.map')), false);
    assert.equal(await exists(path.join(dist, '_astro/nested/styles.CSS.MAP')), false);
    assert.equal(await readFile(path.join(dist, '_astro/app.js'), 'utf8'), 'export const app = true;');
    assert.equal(await readFile(path.join(dist, '_astro/settings.map.json'), 'utf8'), '{"public":true}');
    assert.equal(await readFile(privateManifest, 'utf8'), '{"private":true}');
  });
});

test('refuses a symlinked build root without touching its target', async () => {
  await withTemporaryDirectory(async (workspace) => {
    const outside = path.join(workspace, 'outside');
    const linkedDist = path.join(workspace, 'dist');
    const outsideMap = path.join(outside, 'outside.js.map');
    await mkdir(outside);
    await writeFile(outsideMap, 'must remain');
    await symlink(outside, linkedDist, 'dir');

    await assert.rejects(() => finalizeBuild(linkedDist), /symbolic link/i);
    assert.equal(await readFile(outsideMap, 'utf8'), 'must remain');
  });
});

test('does not follow a nested symlink and fails before deleting in-root maps', async () => {
  await withTemporaryDirectory(async (workspace) => {
    const dist = path.join(workspace, 'dist');
    const outside = path.join(workspace, 'outside');
    const inRootMap = path.join(dist, 'in-root.js.map');
    const outsideMap = path.join(outside, 'outside.js.map');
    await mkdir(dist);
    await mkdir(outside);
    await writeFile(inRootMap, 'retain after unsafe traversal');
    await writeFile(outsideMap, 'never traverse');
    await symlink(outside, path.join(dist, 'linked-directory'), 'dir');

    await assert.rejects(() => finalizeBuild(dist), /symbolic link/i);
    assert.equal(await readFile(inRootMap, 'utf8'), 'retain after unsafe traversal');
    assert.equal(await readFile(outsideMap, 'utf8'), 'never traverse');
  });
});

test('fails closed when the requested build root does not exist', async () => {
  await withTemporaryDirectory(async (workspace) => {
    await assert.rejects(
      () => finalizeBuild(path.join(workspace, 'missing-dist')),
      /missing-dist|ENOENT/i,
    );
  });
});
