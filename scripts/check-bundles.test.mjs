import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  INITIAL_ASSET_BUDGET_BYTES,
  SCENE_GZIP_BUDGET_BYTES,
  collectStaticChunkFiles,
  enforceBudgets,
  measureInitialAssets,
  measureSceneGraph,
} from './check-bundles.mjs';

const fiveNodeManifest = {
  'src/components/scene/ResolutionScene.client.tsx': {
    file: '_astro/scene.js',
    isEntry: true,
    imports: ['src/a.js', 'src/b.js'],
  },
  'src/a.js': { file: '_astro/a.js', imports: ['src/shared.js'] },
  'src/b.js': { file: '_astro/b.js', imports: ['src/shared.js'] },
  'src/shared.js': { file: '_astro/shared.js', imports: ['src/leaf.js'] },
  'src/leaf.js': { file: '_astro/leaf.js' },
};

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flowsolve-bundles-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function deterministicBytes(length) {
  let state = 0x12345678;
  return Buffer.from({ length }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state >>> 24;
  });
}

test('counts a shared static dependency once in a five-node scene graph', () => {
  assert.deepEqual(
    collectStaticChunkFiles(fiveNodeManifest),
    [
      '_astro/scene.js',
      '_astro/a.js',
      '_astro/shared.js',
      '_astro/leaf.js',
      '_astro/b.js',
    ],
  );
});

test('fails when the client manifest has no ResolutionScene entry', () => {
  assert.throws(
    () => collectStaticChunkFiles({ 'src/other.ts': { file: '_astro/other.js', isEntry: true } }),
    /ResolutionScene\.client entry/,
  );
});

test('terminates cyclic static imports and counts every file once', () => {
  const manifest = {
    'src/components/scene/ResolutionScene.client.tsx': {
      file: '_astro/scene.js',
      imports: ['src/a.js'],
    },
    'src/a.js': { file: '_astro/a.js', imports: ['src/b.js'] },
    'src/b.js': {
      file: '_astro/b.js',
      imports: ['src/components/scene/ResolutionScene.client.tsx'],
    },
  };

  assert.deepEqual(
    collectStaticChunkFiles(manifest),
    ['_astro/scene.js', '_astro/a.js', '_astro/b.js'],
  );
});

test('fails closed when a static import is absent from the manifest', () => {
  const manifest = {
    'src/components/scene/ResolutionScene.client.tsx': {
      file: '_astro/scene.js',
      imports: ['src/missing.js'],
    },
  };

  assert.throws(() => collectStaticChunkFiles(manifest), /src\/missing\.js/);
});

test('sums the gzip size of each scene graph file', async () => {
  await withTemporaryDirectory(async (directory) => {
    const contents = new Map([
      ['_astro/scene.js', 'export const scene = "scene";'],
      ['_astro/a.js', 'export const a = "alpha";'],
      ['_astro/shared.js', 'export const shared = "shared";'],
      ['_astro/leaf.js', 'export const leaf = "leaf";'],
      ['_astro/b.js', 'export const b = "beta";'],
    ]);
    await mkdir(path.join(directory, '_astro'));
    await Promise.all([...contents].map(([file, source]) => writeFile(path.join(directory, file), source)));

    const measured = await measureSceneGraph(fiveNodeManifest, directory);
    const expected = [...contents.values()].reduce(
      (total, source) => total + gzipSync(source).byteLength,
      0,
    );

    assert.equal(measured.gzipBytes, expected);
    assert.deepEqual(measured.files, collectStaticChunkFiles(fiveNodeManifest));
  });
});

test('rejects a scene graph one byte above the 350 KiB gzip budget', () => {
  assert.equal(SCENE_GZIP_BUDGET_BYTES, 350 * 1024);
  assert.throws(
    () => enforceBudgets({ sceneGzipBytes: SCENE_GZIP_BUDGET_BYTES + 1, initialAssetBytes: 1 }),
    /scene graph.*350 KiB/i,
  );
});

test('rejects a production-origin initial asset set one byte above the 2 MiB budget', async () => {
  await withTemporaryDirectory(async (directory) => {
    await mkdir(path.join(directory, 'en'), { recursive: true });
    await mkdir(path.join(directory, 'images'), { recursive: true });
    await mkdir(path.join(directory, 'brand'), { recursive: true });
    const html = '<!doctype html><img src="https://corsinlo.github.io/flowsolve-site/images/initial.png">';
    await writeFile(path.join(directory, 'en/index.html'), html);
    await writeFile(
      path.join(directory, 'images/initial.png'),
      deterministicBytes(INITIAL_ASSET_BUDGET_BYTES + 1 - Buffer.byteLength(html)),
    );

    const measured = await measureInitialAssets(directory, 'en/index.html');

    assert.equal(measured.totalBytes, INITIAL_ASSET_BUDGET_BYTES + 1);
    assert.throws(
      () => enforceBudgets({ sceneGzipBytes: 1, initialAssetBytes: measured.totalBytes }),
      /initial assets.*2 MiB/i,
    );
  });
});

test('counts eager JavaScript imports, stylesheets, srcset images, and brand assets once', async () => {
  await withTemporaryDirectory(async (directory) => {
    const files = new Map([
      ['en/index.html', [
        '<link rel="stylesheet" href="../_astro/base.css">',
        '<script type="module" src="/flowsolve-site/_astro/eager.js"></script>',
        '<link rel="modulepreload" href="https://corsinlo.github.io/flowsolve-site/_astro/preload.js">',
        '<img srcset="../images/direct.png 1x, https://corsinlo.github.io/flowsolve-site/images/high.png 2x, https://cdn.example.test/ignored.png 3x">',
      ].join('')],
      ['_astro/base.css', [
        '@import "https://corsinlo.github.io/flowsolve-site/_astro/generated.css";',
        '.hero { background: url(https://corsinlo.github.io/flowsolve-site/images/from-css.png); }',
        '.relative { background: url(../images/from-css-relative.png); }',
        '.root { background: url(/flowsolve-site/images/from-css-root.png); }',
        '.external { background: url(https://cdn.example.test/ignored.png); }',
      ].join('')],
      ['_astro/generated.css', '.generated { color: green; }'],
      ['_astro/eager.js', 'import "./dependency.js";'],
      ['_astro/preload.js', 'import "./dependency.js";'],
      ['_astro/dependency.js', 'export const dependency = true;'],
      ['images/direct.png', 'direct'],
      ['images/high.png', 'high'],
      ['images/from-css.png', 'css'],
      ['images/from-css-relative.png', 'css-relative'],
      ['images/from-css-root.png', 'css-root'],
      ['images/from-js.png', 'js'],
      ['brand/logo.svg', '<svg/>'],
    ]);
    for (const [file, contents] of files) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), contents);
    }
    const manifest = {
      'src/eager.js': {
        file: '_astro/eager.js',
        imports: ['src/dependency.js'],
        dynamicImports: ['src/deferred.js'],
        css: ['_astro/generated.css'],
        assets: ['images/from-js.png'],
      },
      'src/preload.js': {
        file: '_astro/preload.js',
        imports: ['src/dependency.js'],
      },
      'src/dependency.js': { file: '_astro/dependency.js' },
      'src/deferred.js': { file: '_astro/deferred.js' },
    };

    const measured = await measureInitialAssets(directory, 'en/index.html', manifest);

    assert.deepEqual(new Set(measured.files), new Set(files.keys()));
    assert.equal(
      measured.totalBytes,
      [...files.values()].reduce((total, contents) => total + Buffer.byteLength(contents), 0),
    );
  });
});

test('rejects a scene chunk whose in-root symlink resolves outside the build directory', async () => {
  await withTemporaryDirectory(async (directory) => {
    const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), 'flowsolve-outside-'));
    try {
      await mkdir(path.join(directory, '_astro'));
      const outsideFile = path.join(outsideDirectory, 'scene.js');
      await writeFile(outsideFile, 'export const leaked = true;');
      await symlink(outsideFile, path.join(directory, '_astro/scene.js'));
      const manifest = {
        'src/components/scene/ResolutionScene.client.tsx': {
          file: '_astro/scene.js',
        },
      };

      await assert.rejects(
        () => measureSceneGraph(manifest, directory),
        /outside the build directory|symbolic link/i,
      );
    } finally {
      await rm(outsideDirectory, { recursive: true, force: true });
    }
  });
});
