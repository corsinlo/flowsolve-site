import { load } from 'cheerio';
import { gzipSize } from 'gzip-size';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE } from '../src/config/site.ts';

export const SCENE_GZIP_BUDGET_BYTES = 350 * 1024;
export const INITIAL_ASSET_BUDGET_BYTES = 2 * 1024 * 1024;

const SITE_ORIGIN = new URL(SITE.origin).origin;
const BASE_PATH = `${SITE.base.replace(/\/$/, '')}/`;
const SITE_BASE_URL = `${SITE_ORIGIN}${BASE_PATH}`;
const MANIFEST_PATH = '.astro/manifest-client-assets.json';
const INITIAL_DOCUMENTS = ['en/index.html', 'it/index.html', 'nl/index.html'];

function sceneEntryKey(manifest) {
  const matches = Object.entries(manifest)
    .filter(([key, value]) => [key, value.src].some((candidate) => (
      typeof candidate === 'string' && candidate.includes('ResolutionScene.client')
    )))
    .map(([key]) => key);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ResolutionScene.client entry; found ${matches.length}`);
  }
  return matches[0];
}

function collectManifestGraph(manifest, entryKeys) {
  const visitedEntries = new Set();
  const visitedFiles = new Set();
  const files = [];
  const css = new Set();
  const assets = new Set();

  const visit = (key) => {
    if (visitedEntries.has(key)) return;
    const entry = manifest[key];
    if (!entry) throw new Error(`Static import ${key} is absent from the client manifest`);
    if (typeof entry.file !== 'string' || !entry.file.endsWith('.js')) {
      throw new Error(`Client manifest entry ${key} has no JavaScript file`);
    }
    visitedEntries.add(key);
    if (!visitedFiles.has(entry.file)) {
      visitedFiles.add(entry.file);
      files.push(entry.file);
    }
    for (const file of entry.css ?? []) css.add(file);
    for (const file of entry.assets ?? []) assets.add(file);
    for (const importedKey of entry.imports ?? []) visit(importedKey);
  };

  for (const key of entryKeys) visit(key);
  return { assets, css, files };
}

export function collectStaticChunkFiles(manifest) {
  return collectManifestGraph(manifest, [sceneEntryKey(manifest)]).files;
}

async function resolveInside(root, relativeFile) {
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(absoluteRoot, relativeFile);
  if (absoluteFile !== absoluteRoot && !absoluteFile.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes the build directory: ${relativeFile}`);
  }
  const [realRoot, realFile] = await Promise.all([realpath(absoluteRoot), realpath(absoluteFile)]);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Asset path resolves outside the build directory: ${relativeFile}`);
  }
  return realFile;
}

export async function measureSceneGraph(manifest, assetRoot = 'dist') {
  const files = collectStaticChunkFiles(manifest);
  const sizes = await Promise.all(files.map(async (file) => (
    gzipSize(await readFile(await resolveInside(assetRoot, file)))
  )));
  return {
    files,
    gzipBytes: sizes.reduce((total, bytes) => total + bytes, 0),
  };
}

function localAssetPath(value, baseUrl = SITE_BASE_URL) {
  if (!value || value.startsWith('data:') || value.startsWith('#')) return undefined;
  const url = new URL(value, baseUrl);
  if (url.origin !== SITE_ORIGIN || !url.pathname.startsWith(BASE_PATH)) {
    return undefined;
  }
  return decodeURIComponent(url.pathname.slice(BASE_PATH.length));
}

function srcsetValues(value) {
  return value.split(',').map((candidate) => candidate.trim().split(/\s+/, 1)[0]);
}

async function brandSvgFiles(distDirectory) {
  const brandDirectory = path.join(distDirectory, 'brand');
  let entries;
  try {
    entries = await readdir(brandDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.svg'))
    .map((entry) => `brand/${entry.name}`);
}

async function referencedCssAssets(distDirectory, initialCssFiles) {
  const files = new Set(initialCssFiles);
  const pending = [...files];
  while (pending.length > 0) {
    const cssFile = pending.pop();
    const css = await readFile(await resolveInside(distDirectory, cssFile), 'utf8');
    const cssUrl = new URL(cssFile, SITE_BASE_URL).href;
    const references = [
      ...css.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'"\s)]+)/gi),
      ...css.matchAll(/url\(\s*['"]?([^'"\s)]+)/gi),
    ];
    for (const match of references) {
      const raw = match[1];
      if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
      const referenced = localAssetPath(raw, cssUrl);
      if (!referenced || files.has(referenced)) continue;
      files.add(referenced);
      if (referenced.endsWith('.css')) pending.push(referenced);
    }
  }
  return files;
}

export async function measureInitialAssets(
  distDirectory = 'dist',
  htmlFile = 'en/index.html',
  manifest = {},
) {
  const htmlPath = await resolveInside(distDirectory, htmlFile);
  const html = await readFile(htmlPath, 'utf8');
  const htmlUrl = new URL(htmlFile, SITE_BASE_URL).href;
  const $ = load(html);
  const css = new Set();
  const eagerJavaScript = new Set();
  const images = new Set();

  $('link[rel~="stylesheet"][href]').each((_, element) => {
    const file = localAssetPath($(element).attr('href'), htmlUrl);
    if (file) css.add(file);
  });
  $('script[src], link[rel~="modulepreload"][href]').each((_, element) => {
    const file = localAssetPath($(element).attr('src') ?? $(element).attr('href'), htmlUrl);
    if (file) eagerJavaScript.add(file);
  });
  $('img[src], input[type="image"][src], video[poster], link[rel~="icon"][href], link[rel~="preload"][as="image"][href]').each((_, element) => {
    const file = localAssetPath(
      $(element).attr('src') ?? $(element).attr('poster') ?? $(element).attr('href'),
      htmlUrl,
    );
    if (file) images.add(file);
  });
  $('img[srcset], source[srcset], link[rel~="preload"][as="image"][imagesrcset]').each((_, element) => {
    const value = $(element).attr('srcset') ?? $(element).attr('imagesrcset') ?? '';
    for (const candidate of srcsetValues(value)) {
      const file = localAssetPath(candidate, htmlUrl);
      if (file) images.add(file);
    }
  });

  const manifestEntriesByFile = new Map(
    Object.entries(manifest).map(([key, entry]) => [entry.file, key]),
  );
  const eagerEntryKeys = [];
  for (const file of eagerJavaScript) {
    const key = manifestEntriesByFile.get(file);
    if (key) eagerEntryKeys.push(key);
    else if (file.startsWith('_astro/')) {
      throw new Error(`Eager JavaScript ${file} is absent from the client manifest`);
    }
  }
  const eagerGraph = collectManifestGraph(manifest, eagerEntryKeys);
  for (const file of eagerGraph.files) eagerJavaScript.add(file);
  for (const file of eagerGraph.css) css.add(file);
  for (const file of eagerGraph.assets) images.add(file);

  const cssAndDependencies = await referencedCssAssets(distDirectory, css);
  const brand = new Set(await brandSvgFiles(distDirectory));
  const files = [...new Set([
    htmlFile,
    ...cssAndDependencies,
    ...eagerJavaScript,
    ...images,
    ...brand,
  ])];
  const fileSizes = await Promise.all(files.map(async (file) => ({
    file,
    bytes: (await stat(await resolveInside(distDirectory, file))).size,
  })));

  return {
    htmlFile,
    files,
    fileSizes,
    totalBytes: fileSizes.reduce((total, { bytes }) => total + bytes, 0),
  };
}

export function enforceBudgets({ sceneGzipBytes, initialAssetBytes }) {
  if (sceneGzipBytes > SCENE_GZIP_BUDGET_BYTES) {
    throw new Error(
      `Deferred scene graph is ${(sceneGzipBytes / 1024).toFixed(2)} KiB gzip; budget is 350 KiB`,
    );
  }
  if (initialAssetBytes > INITIAL_ASSET_BUDGET_BYTES) {
    throw new Error(
      `Initial assets are ${(initialAssetBytes / 1024 / 1024).toFixed(2)} MiB; budget is 2 MiB`,
    );
  }
}

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const scene = await measureSceneGraph(manifest);
  const initialPages = await Promise.all(
    INITIAL_DOCUMENTS.map((document) => measureInitialAssets('dist', document, manifest)),
  );

  for (const initial of initialPages) {
    enforceBudgets({ sceneGzipBytes: scene.gzipBytes, initialAssetBytes: initial.totalBytes });
  }

  process.stdout.write(
    `Deferred scene graph: ${kibibytes(scene.gzipBytes)} gzip / 350.00 KiB (${scene.files.length} files)\n`,
  );
  for (const initial of initialPages) {
    process.stdout.write(
      `Initial assets ${initial.htmlFile}: ${kibibytes(initial.totalBytes)} / 2048.00 KiB (${initial.files.length} files)\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
