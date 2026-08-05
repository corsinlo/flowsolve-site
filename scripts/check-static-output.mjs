import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePagesRelease } from './check-pages-cta.mjs';

const BASE = '/flowsolve-site/';
const PAGES_ORIGIN = 'https://corsinlo.github.io';
const approvedBrandAssets = new Set([
  '/flowsolve-site/brand/flowsolve-mark.svg',
  '/flowsolve-site/brand/flowsolve-logo-horizontal.svg',
  '/flowsolve-site/brand/flowsolve-logo-horizontal-reversed.svg',
  '/flowsolve-site/brand/flowsolve-logo-monochrome.svg',
  '/flowsolve-site/brand/flowsolve-app-icon.svg',
]);
const approvedDistBrandAssets = new Set(
  [...approvedBrandAssets].map((asset) => `dist${asset.replace(BASE, '/')}`),
);
const staticExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.webp', '.avif', '.ico', '.txt', '.xml', '.woff2', '.map',
]);
const publicRepositoryBoundary = Object.freeze({
  packageName: '@flowsolve/site',
  repositoryOwner: 'corsinlo',
  repositoryName: 'flowsolve-site',
});
/** @typedef {{ file: string, rule: string, detail: string }} Violation */
const emittedModuleRules = [
  ['analytics_tracker', /\b(?:gtag|fbq|plausible|clarity)\s*\(|\b(?:dataLayer|_paq)\s*\.|\b(?:posthog|mixpanel|hotjar|amplitude)\s*\./i],
  ['fingerprinting', /\b(?:FingerprintJS|canvasFingerprint|deviceFingerprint)\b/i],
  ['private_api', /["'`]\/api\//],
  ['private_package', null],
  ['private_repository', null],
  ['secret_name', /\b(?:SUPABASE_[A-Z0-9_]*|OPENAI_[A-Z0-9_]*|DATABASE_URL|SERVICE_ROLE(?:_KEY)?|[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN))\b/],
  ['email_value', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['vin_value', /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/],
  ['nl_plate_value', /\b(?:[A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-[A-Z]{2}-\d{2}|\d{2}-[A-Z]{2}-[A-Z]{2}|\d-[A-Z]{3}-\d{2}|[A-Z]{2}-\d{3}-[A-Z]|[A-Z]-\d{3}-[A-Z]{2})\b/i],
  ['jwt_value', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
  ['token_value', /\b(?:Bearer\s+[A-Za-z0-9._-]{16,}|(?:sk-(?:proj-)?|github_pat_|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,})\b/],
];
const runtimeAccessRules = [
  ['network_fetch', /\bfetch\s*\(/],
  ['network_xhr', /\bXMLHttpRequest\b/],
  ['network_websocket', /\bWebSocket\s*\(/],
  ['network_eventsource', /\bEventSource\s*\(/],
  ['network_beacon', /\bnavigator\s*(?:\.\s*sendBeacon|\[\s*['"]sendBeacon['"]\s*\])\s*\(/],
  ['navigation_open', /\bwindow\s*\.\s*open\s*\(/],
  ['navigation_assign', /\b(?:window\s*\.\s*)?location\s*\.\s*assign\s*\(/],
  ['navigation_location', /\b(?:window\s*\.\s*)?location\s*\.\s*href\s*=/],
  ['browser_storage', /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/],
  ['three_loader', /\b(?:useLoader|useGLTF|FileLoader|ImageLoader|TextureLoader|GLTFLoader)\b/],
];
const firstPartyModuleRules = [
  ...runtimeAccessRules,
  ['server_output', /\boutput\s*:\s*["']server["']/],
  ...emittedModuleRules,
];

/** @returns {Violation[]} */
export function inspectPrivateReferences(file, source, boundary = publicRepositoryBoundary) {
  const violations = [];
  const scopeEnd = boundary.packageName.lastIndexOf('/');
  const publicScope = boundary.packageName.slice(0, scopeEnd);
  const publicBrand = publicScope.startsWith('@') ? publicScope.slice(1) : publicScope;
  const privateToken = /(?:^|[\/@._-])(?:internal|private)(?:[\/._-]|$)/i;
  const importSpecifier = /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["'`]([^"'`]+)["'`]/g;
  const hasPrivatePackage = [...source.matchAll(importSpecifier)].some((match) => {
    const specifier = match[1];
    const violatesPublicScope = specifier.startsWith(`${publicScope}/`)
      && specifier !== boundary.packageName
      && !specifier.startsWith(`${boundary.packageName}/`);
    const violatesBrandPrefix = specifier.startsWith(`${publicBrand}-`);
    return violatesPublicScope || violatesBrandPrefix || privateToken.test(specifier);
  });
  if (hasPrivatePackage) {
    violations.push({ file, rule: 'private_package', detail: 'non-public module import' });
  }

  const repositoryReference = /github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)/gi;
  const hasPrivateRepository = [...source.matchAll(repositoryReference)].some((match) => {
    const owner = match[1].toLowerCase();
    const repository = match[2].replace(/\.git$/i, '').toLowerCase();
    const violatesPublicOwner = owner === boundary.repositoryOwner.toLowerCase()
      && repository !== boundary.repositoryName.toLowerCase();
    return violatesPublicOwner || privateToken.test(owner) || privateToken.test(repository);
  });
  if (hasPrivateRepository) {
    violations.push({ file, rule: 'private_repository', detail: 'non-public repository reference' });
  }

  return violations;
}

/** @returns {Violation[]} */
function inspectRuleSet(file, source, rules) {
  const privateViolations = inspectPrivateReferences(file, source);
  return rules.flatMap(([rule, pattern]) => (
    pattern === null
      ? privateViolations.filter((violation) => violation.rule === rule)
      : (pattern.test(source) ? [{ file, rule, detail: pattern.source }] : [])
  ));
}

/** @returns {Violation[]} */
function inspectUrlValue(file, value, allowedCtas, context = {}) {
  if (!value || value.startsWith('#')) return [];
  if (/^data:/i.test(value)) {
    const { tag, attribute } = context;
    const isPermittedImageData = /^data:image\//i.test(value)
      && ((tag === 'img' && (attribute === 'src' || attribute === 'srcset'))
        || (tag === 'source' && attribute === 'srcset'));
    return isPermittedImageData
      ? []
      : [{ file, rule: 'executable_data_url', detail: value }];
  }

  let url;
  try {
    url = new URL(value, `${PAGES_ORIGIN}${BASE}`);
  } catch {
    return [{ file, rule: 'invalid_url', detail: value }];
  }

  if (url.origin === PAGES_ORIGIN && !url.pathname.startsWith(BASE)) {
    return [{ file, rule: 'base_path_escape', detail: value }];
  }
  if (url.origin === PAGES_ORIGIN && url.pathname.startsWith(`${BASE}brand/`) && !approvedBrandAssets.has(url.pathname)) {
    return [{ file, rule: 'unapproved_local_brand_asset', detail: value }];
  }
  if (url.origin !== PAGES_ORIGIN && (!context.isCta || !allowedCtas.has(url.href))) {
    return [{ file, rule: 'unapproved_external_url', detail: value }];
  }
  return [];
}

function srcsetUrls(value) {
  const urls = [];
  let position = 0;
  const isSpace = (character) => /[\t\n\f\r ]/.test(character);

  while (position < value.length) {
    while (position < value.length && (isSpace(value[position]) || value[position] === ',')) position += 1;
    if (position >= value.length) break;

    const urlStart = position;
    while (position < value.length && !isSpace(value[position])) position += 1;
    let url = value.slice(urlStart, position);
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
      if (url) urls.push(url);
      continue;
    }

    while (position < value.length && isSpace(value[position])) position += 1;
    let parentheses = 0;
    while (position < value.length) {
      const character = value[position];
      if (character === '(') parentheses += 1;
      else if (character === ')') parentheses = Math.max(0, parentheses - 1);
      else if (character === ',' && parentheses === 0) {
        position += 1;
        break;
      }
      position += 1;
    }
    urls.push(url);
  }

  return urls;
}

function isCodePosition(source, position) {
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < position; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character;
    }
  }
  return !quote && !lineComment && !blockComment;
}

function hasCodePattern(source, pattern) {
  for (const match of source.matchAll(pattern)) {
    if (isCodePosition(source, match.index ?? 0)) return true;
  }
  return false;
}

/** @returns {Violation[]} */
export function inspectCss(file, css, allowedCtas) {
  const violations = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const normalized = withoutComments.replace(/(['"])(?:\\.|(?!\1)[\s\S])*\1/g, (value, _quote, offset, source) => {
    const before = source.slice(0, offset).replace(/\s+$/, '');
    return /(?:url\(|@import)$/i.test(before) ? value : '"text"';
  });
  const urls = /@import\s+(?:url\(\s*)?['"]?([^'"\s)]+)|url\(\s*['"]?([^'"\s)]+)/gi;
  for (const match of normalized.matchAll(urls)) {
    violations.push(...inspectUrlValue(file, match[1] ?? match[2], allowedCtas));
  }
  return violations;
}

/** @returns {Violation[]} */
export function inspectHtml(file, html, allowedCtas) {
  const $ = load(html);
  const violations = [];
  const add = (rule, detail) => violations.push({ file, rule, detail });
  const inspectUrl = (element, attribute, value) => violations.push(...inspectUrlValue(
    file,
    value,
    allowedCtas,
    {
      tag: element.tagName.toLowerCase(),
      attribute,
      isCta: attribute === 'href' && $(element).is('a'),
    },
  ));

  if ($('form').length > 0) add('form_forbidden', 'Static preview must not contain forms');
  $('form[action]').each((_, element) => {
    add('form_action_forbidden', $(element).attr('action') ?? '');
  });
  $('[formaction]').each((_, element) => {
    add('form_action_forbidden', $(element).attr('formaction') ?? '');
  });
  $('input, textarea, select, button[type="submit"]').each((_, element) => {
    add('data_collection_control', $.html(element).slice(0, 120));
  });
  $('script:not([src])').each((index, element) => {
    violations.push(...inspectFirstPartyModule(
      `${file}#inline-script-${index}`,
      $(element).html() ?? '',
    ));
  });
  $('*').each((index, element) => {
    for (const [attribute, value] of Object.entries(element.attribs)) {
      if (attribute.toLowerCase().startsWith('on')) {
        violations.push(...inspectFirstPartyModule(`${file}#handler-${index}-${attribute}`, value));
      }
    }
  });
  $('style').each((_, element) => violations.push(...inspectCss(file, $(element).html() ?? '', allowedCtas)));
  $('[style]').each((_, element) => violations.push(...inspectCss(file, $(element).attr('style') ?? '', allowedCtas)));
  $('iframe[srcdoc]').each((index, element) => {
    violations.push(...inspectHtml(
      `${file}#iframe-srcdoc-${index}`,
      $(element).attr('srcdoc') ?? '',
      allowedCtas,
    ));
  });
  $('meta[http-equiv="refresh" i]').each((_, element) => {
    const match = ($(element).attr('content') ?? '').match(/^\s*\d+\s*;\s*url\s*=\s*(.+?)\s*$/i);
    if (match) inspectUrl(element, 'content', match[1]);
  });
  $('[href], [src], [srcset], [imagesrcset], [poster], [data], [action], [formaction], [ping]').each((_, element) => {
    for (const attribute of ['href', 'src', 'poster', 'data', 'action', 'formaction']) {
      const value = element.attribs[attribute];
      if (value !== undefined) inspectUrl(element, attribute, value);
    }
    const ping = element.attribs.ping;
    if (ping !== undefined) {
      for (const value of ping.trim().split(/\s+/)) inspectUrl(element, 'ping', value);
    }
    for (const attribute of ['srcset', 'imagesrcset']) {
      const value = element.attribs[attribute];
      if (value === undefined) continue;
      for (const url of srcsetUrls(value)) inspectUrl(element, attribute, url);
    }
  });

  return violations;
}

/** @returns {Violation[]} */
export function inspectFirstPartyModule(file, source) {
  const violations = inspectRuleSet(file, source, firstPartyModuleRules);
  if (/(?:^|\/)astro\.config\.[cm]?[jt]s$/.test(file)) {
    const staticConstants = new Set([...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['"]static['"]/g)].map((match) => match[1]));
    const undefinedAdapters = new Set([...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*undefined\b/g)].map((match) => match[1]));
    const computedKeys = new Map([...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['"](output|adapter)['"]/g)].map((match) => [match[1], match[2]]));
    const outputProperty = source.match(/\boutput\s*:\s*([^,}\n]+)/)?.[1]?.trim();
    const safeOutput = outputProperty === 'SITE.output'
      || /^['"]static['"]$/.test(outputProperty ?? '')
      || staticConstants.has(outputProperty ?? '');
    const shorthandOutput = /defineConfig\s*\(\s*\{[\s\S]*?(?:[,{]\s*)output\s*(?:[,}])/.test(source);
    const hasComputedOutput = /\[\s*['"]output['"]\s*\]\s*:/.test(source)
      || [...computedKeys].some(([key, value]) => value === 'output' && new RegExp(`\\[\\s*${key}\\s*\\]\\s*:`).test(source));
    const hasServerOutput = (Boolean(outputProperty) && !safeOutput)
      || hasComputedOutput
      || /\bconst\s+output\s*=\s*['"]server['"]/.test(source)
      || shorthandOutput;
    const adapterProperty = source.match(/\badapter\s*:\s*([^,}\n]+)/)?.[1]?.trim();
    const shorthandAdapter = /defineConfig\s*\(\s*\{[\s\S]*?(?:[,{]\s*)adapter\s*(?:[,}])/.test(source);
    const hasComputedAdapter = /\[\s*(?:['"]adapter['"]|adapter(?:Key)?)\s*\]\s*:/.test(source)
      || [...computedKeys].some(([key, value]) => value === 'adapter' && new RegExp(`\\[\\s*${key}\\s*\\]\\s*:`).test(source));
    const hasAdapter = (Boolean(adapterProperty) && adapterProperty !== 'undefined')
      || hasComputedAdapter
      || (shorthandAdapter && !undefinedAdapters.has('adapter'));
    if (hasServerOutput && !violations.some(({ rule }) => rule === 'server_output')) {
      violations.push({ file, rule: 'server_output', detail: 'non-static Astro output configuration' });
    }
    if (hasAdapter && !violations.some(({ rule }) => rule === 'server_adapter')) {
      violations.push({ file, rule: 'server_adapter', detail: 'Astro adapter configuration' });
    }
  }
  const aliasPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*navigator\s*(?:\.\s*sendBeacon|\[\s*['"]sendBeacon['"]\s*\])/g;
  for (const match of source.matchAll(aliasPattern)) {
    const aliasCall = new RegExp(`\\b${match[1]}\\s*\\(`);
    if (aliasCall.test(source.slice((match.index ?? 0) + match[0].length))) {
      violations.push({ file, rule: 'network_beacon', detail: 'aliased navigator.sendBeacon' });
      break;
    }
  }
  const fetchAliasPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:fetch|globalThis\s*\[\s*['"]fetch['"]\s*\])\s*;/g;
  const hasAliasedFetch = [...source.matchAll(fetchAliasPattern)].some((match) => {
    const start = match.index ?? 0;
    const afterBinding = start + match[0].length;
    const call = new RegExp(`\\b${match[1]}\\s*\\(`).exec(source.slice(afterBinding));
    return isCodePosition(source, start)
      && call !== null
      && isCodePosition(source, afterBinding + call.index);
  });
  if (hasAliasedFetch || hasCodePattern(source, /\bglobalThis\s*\[\s*['"]fetch['"]\s*\]\s*\(/g)) {
    violations.push({ file, rule: 'network_fetch', detail: 'aliased or computed fetch call' });
  }
  const imageBindingPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Image\s*\(\s*\)\s*;/g;
  const hasBoundImageAssignment = [...source.matchAll(imageBindingPattern)].some((match) => {
    const start = match.index ?? 0;
    const afterBinding = start + match[0].length;
    const assignment = new RegExp(`\\b${match[1]}\\s*\\.src\\s*=\\s*['"]https?:\\/\\/`).exec(source.slice(afterBinding));
    return isCodePosition(source, start)
      && assignment !== null
      && isCodePosition(source, afterBinding + assignment.index);
  });
  if (hasBoundImageAssignment || hasCodePattern(source, /\bnew\s+Image\s*\(\s*\)\s*\.src\s*=\s*['"]https?:\/\//g)) {
    violations.push({ file, rule: 'network_image', detail: 'new Image().src remote assignment' });
  }
  if (hasCodePattern(source, /\bimport\s*\(\s*['"]https?:\/\//g)) {
    violations.push({ file, rule: 'network_dynamic_import', detail: 'remote dynamic import' });
  }
  return violations;
}

/** @returns {Violation[]} */
export function inspectEmittedModule(file, source, dependencyFiles = new Set()) {
  const rules = dependencyFiles.has(file) ? emittedModuleRules : [...runtimeAccessRules, ...emittedModuleRules];
  return inspectRuleSet(file, source, rules);
}

/** @returns {Violation[]} */
export function inspectStaticContent(file, source) {
  return inspectRuleSet(file, source, emittedModuleRules);
}

/** @returns {Violation[]} */
export function inspectDistEntry(file) {
  const normalized = file.replaceAll('\\', '/');
  const lower = normalized.toLowerCase();
  if (normalized.startsWith('dist/brand/') && !approvedDistBrandAssets.has(normalized)) {
    return [{ file, rule: 'unapproved_brand_output', detail: normalized }];
  }
  if (/(?:^|\/)(?:server|functions|api|\.netlify\/functions-internal)(?:\/|$)|\/_worker\.[^/]+$/.test(lower)) {
    return [{ file, rule: 'server_output', detail: normalized }];
  }
  if (/(?:^|\/)(?:_astro\/)?(?:server-)?manifest(?:[-._][^/]*)?$|\/_routes\.json$/.test(lower)) {
    return [{ file, rule: 'server_manifest', detail: normalized }];
  }
  const segments = lower.split('/');
  const filename = segments.at(-1) ?? '';
  const dataFixtureDirectory = segments.slice(0, -1).some((segment) => /^(?:data|fixtures?)$/.test(segment));
  const fixtureName = /(?:customer[-_]?fixtures?|fixture[-_]?customers?)\.[^.]+$/.test(filename);
  if ((dataFixtureDirectory && /(?:customer|fixture)/.test(filename)) || fixtureName) {
    return [{ file, rule: 'customer_fixture_output', detail: normalized }];
  }
  const extension = path.extname(file).toLowerCase();
  return staticExtensions.has(extension)
    ? []
    : [{ file, rule: 'non_static_output', detail: extension || '(no extension)' }];
}

export function isFirstPartyModuleFile(file) {
  return /\.(?:[cm]?js|jsx|[cm]?ts|tsx|astro)$/.test(file)
    && !/(?:^|\/)node_modules\//.test(file)
    && !/\.(?:test|spec)\.(?:[cm]?js|jsx|[cm]?ts|tsx|astro)$/.test(file)
    && !/\.d\.[cm]?ts$/.test(file);
}

export function isStaticContentFile(file) {
  return /\.(?:html|css|json|svg|xml|txt|map)$/i.test(file);
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return nested.flat();
}

export async function dependencyOutputFiles(files) {
  const dependencyFiles = new Set();
  for (const file of files) {
    if (!/\.(?:js|mjs)\.map$/.test(file)) continue;
    try {
      const sourceMap = JSON.parse(await readFile(file, 'utf8'));
      const sources = sourceMap.sources ?? [];
      if (sources.length > 0 && sources.every((source) => /(?:^|\/)node_modules\//.test(source))) {
        dependencyFiles.add(file.slice(0, -4));
      }
    } catch {
      // A malformed source map is scanned as untrusted emitted output.
    }
  }
  return dependencyFiles;
}

export function allowedCtasForEnvironment(env) {
  const release = validatePagesRelease(env);
  return release.mode === 'preview'
    ? new Set()
    : new Set([release.requestPilot, release.pilotSignIn]);
}

async function main() {
  const allowedCtas = allowedCtasForEnvironment(process.env);
  const violations = [];

  const distFiles = await walk('dist');
  const dependencyFiles = await dependencyOutputFiles(distFiles);
  for (const file of distFiles) {
    violations.push(...inspectDistEntry(file));
    const source = isStaticContentFile(file) || /\.(?:js|mjs)$/.test(file)
      ? await readFile(file, 'utf8')
      : undefined;
    if (file.endsWith('.html')) {
      violations.push(...inspectHtml(file, source, allowedCtas));
    }
    if (file.endsWith('.css')) violations.push(...inspectCss(file, source, allowedCtas));
    if (/\.(?:js|mjs)$/.test(file)) {
      violations.push(...inspectEmittedModule(file, source, dependencyFiles));
    }
    if (isStaticContentFile(file)) violations.push(...inspectStaticContent(file, source));
  }

  for (const file of await walk('src')) {
    if (!isFirstPartyModuleFile(file)) continue;
    violations.push(...inspectFirstPartyModule(file, await readFile(file, 'utf8')));
  }

  for (const file of ['astro.config.ts']) {
    violations.push(...inspectFirstPartyModule(file, await readFile(file, 'utf8')));
  }

  if (violations.length > 0) {
    for (const violation of violations) process.stderr.write(`${JSON.stringify(violation)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
