import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const readText = (file: string) => readFile(file, 'utf8');
const readJson = async (file: string) => JSON.parse(await readText(file));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findUnauthorizedPublicScopePackages(source: string, publicPackage: string) {
  const separator = publicPackage.indexOf('/');
  const publicScope = publicPackage.slice(0, separator);
  const scopedPackage = new RegExp(`${escapeRegExp(publicScope)}/[a-z0-9][a-z0-9._/-]*`, 'gi');

  return [...source.matchAll(scopedPackage)]
    .map((match) => match[0])
    .filter((specifier) => (
      specifier !== publicPackage && !specifier.startsWith(`${publicPackage}/`)
    ));
}

function findLegacyActionsRunReferences(source: string) {
  return [...source.matchAll(/\bactions\/runs\/\d+\b/gi)].map((match) => match[0]);
}

function isReservedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  const reservedHosts = ['example.com', 'example.net', 'example.org'];
  const reservedSuffixes = ['test', 'example', 'invalid', 'localhost'];

  return reservedHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))
    || reservedSuffixes.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

const approvedPublicMaintainerEmail = ['i', ['izs', 'me'].join('.')].join('@');

function approvedDeprecatedEmailOffsets(source: string) {
  const offsets = new Set<number>();
  const sourceFile = ts.createSourceFile(
    'package-lock.json',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSON,
  );
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
      && node.name.text === 'deprecated'
      && ts.isStringLiteral(node.initializer)) {
      const start = node.initializer.getStart(sourceFile);
      const fieldSource = source.slice(start, node.initializer.getEnd());
      for (let index = fieldSource.indexOf(approvedPublicMaintainerEmail);
        index >= 0;
        index = fieldSource.indexOf(approvedPublicMaintainerEmail, index + 1)) {
        offsets.add(start + index);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offsets;
}

function findNonReservedEmailValues(source: string, file = '') {
  const approvedOffsets = file === 'package-lock.json'
    ? approvedDeprecatedEmailOffsets(source)
    : new Set<number>();
  const emailValue = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
  return [...source.matchAll(emailValue)]
    .filter((match) => (
      !isReservedHostname(match[1])
      && !(match[0] === approvedPublicMaintainerEmail
        && approvedOffsets.has(match.index ?? -1))
    ))
    .map((match) => match[0]);
}

function findUnapprovedLockfileResolvedUrls(lockfile: unknown) {
  const resolvedUrls: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'resolved' && typeof child === 'string') resolvedUrls.push(child);
      else visit(child);
    }
  };
  visit(lockfile);

  return resolvedUrls.filter((value) => {
    try {
      const url = new URL(value);
      return !value.startsWith('https://registry.npmjs.org/')
        || url.origin !== 'https://registry.npmjs.org'
        || value !== `${url.origin}${url.pathname}`
        || Boolean(url.username || url.password || url.search || url.hash);
    } catch {
      return true;
    }
  });
}

const intentionalPublicBoundaryTokens = new Set([
  ['document', 'cookie'].join('.'),
  ['location', 'assign'].join('.'),
  ['posthog', 'capture'].join('.'),
]);

function findUnauthorizedDottedTokens(source: string, publicHosts: Set<string>, file = '') {
  const contextPublicHosts = new Set(publicHosts);
  if (file === 'tests/static/public-boundary.test.ts') {
    for (const token of intentionalPublicBoundaryTokens) contextPublicHosts.add(token);
  }
  const sourceExtensions = new Set([
    'astro', 'cjs', 'css', 'cts', 'ico', 'jpeg', 'jpg', 'js', 'json', 'jsonc',
    'map', 'md', 'mdx', 'mjs', 'mts', 'png', 'svg', 'tgz', 'ts', 'tsx', 'txt',
    'woff2', 'webp', 'xml', 'yaml', 'yml',
  ]);
  const publicDomainSuffixes = new Set([
    'ai', 'app', 'biz', 'cloud', 'co', 'com', 'de', 'dev', 'edu', 'eu', 'io',
    'it', 'me', 'net', 'nl', 'org', 'tech', 'uk', 'xyz',
  ]);
  const dottedToken = /\b[a-z][a-z0-9-]{1,}(?:\.[a-z][a-z0-9-]{1,})+\b/g;

  return [...new Set([...source.matchAll(dottedToken)]
    .filter((match) => source[(match.index ?? 0) - 1] !== '@')
    .filter((match) => {
      const token = match[0];
      const normalized = token.toLowerCase();
      const extension = normalized.slice(normalized.lastIndexOf('.') + 1);
      if (contextPublicHosts.has(normalized)
        || isReservedHostname(normalized)
        || sourceExtensions.has(extension)) return false;

      const labels = normalized.split('.');
      const looksLikeWorkIdentity = labels.length === 2
        && labels.every((label) => /^[a-z]{5,}$/.test(label));
      return publicDomainSuffixes.has(extension) || looksLikeWorkIdentity;
    })
    .map((match) => match[0]))];
}

function humanTextFromCode(file: string, source: string) {
  const segments: string[] = [];
  const usesJsx = /\.(?:jsx|tsx)$/i.test(file);
  const scriptKind = usesJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      segments.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      segments.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
      for (const span of node.templateSpans) visit(span.expression);
      return;
    } else if (ts.isJsxText(node)) {
      segments.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    usesJsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia
      || token === ts.SyntaxKind.MultiLineCommentTrivia) segments.push(scanner.getTokenText());
  }
  return segments.join('\n');
}

function findBalancedEnd(source: string, start: number, opening: string, closing: string) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length - 1;
}

function findAstroTagEnd(source: string, start: number) {
  let quote = '';
  let escaped = false;
  let braceDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (character === '>' && braceDepth === 0) return index;
  }
  return source.length - 1;
}

function humanTextFromAstro(file: string, source: string) {
  const segments: string[] = [];
  const frontmatter = source.match(/^(?:\uFEFF)?---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  let templateStart = 0;
  if (frontmatter) {
    segments.push(humanTextFromCode(`${file}.ts`, frontmatter[1]));
    templateStart = frontmatter[0].length;
  }

  const template = source.slice(templateStart);
  for (let index = 0; index < template.length;) {
    if (template.startsWith('<!--', index)) {
      const end = template.indexOf('-->', index + 4);
      const commentEnd = end < 0 ? template.length : end;
      segments.push(template.slice(index + 4, commentEnd));
      index = end < 0 ? template.length : end + 3;
      continue;
    }
    if (template[index] === '<') {
      const end = findAstroTagEnd(template, index);
      const tag = template.slice(index, end + 1);
      for (const match of tag.matchAll(/\b[\w:-]+\s*=\s*(["'])([\s\S]*?)\1/g)) segments.push(match[2]);
      for (let braceStart = tag.indexOf('{'); braceStart >= 0; braceStart = tag.indexOf('{', braceStart + 1)) {
        const braceEnd = findBalancedEnd(tag, braceStart, '{', '}');
        segments.push(humanTextFromCode(`${file}.ts`, tag.slice(braceStart + 1, braceEnd)));
        braceStart = braceEnd;
      }
      const codeTag = tag.match(/^<\s*(script)\b/i);
      if (codeTag && !/\/\s*>$/.test(tag)) {
        const closingStart = template.toLowerCase().indexOf(`</${codeTag[1].toLowerCase()}`, end + 1);
        if (closingStart >= 0) {
          segments.push(humanTextFromCode(
            `${file}.ts`,
            template.slice(end + 1, closingStart),
          ));
          index = findAstroTagEnd(template, closingStart) + 1;
          continue;
        }
      }
      index = end + 1;
      continue;
    }
    if (template[index] === '{') {
      const end = findBalancedEnd(template, index, '{', '}');
      segments.push(humanTextFromCode(`${file}.ts`, template.slice(index + 1, end)));
      index = end + 1;
      continue;
    }
    const nextTag = template.indexOf('<', index);
    const nextExpression = template.indexOf('{', index);
    const candidates = [nextTag, nextExpression].filter((value) => value >= 0);
    const end = candidates.length > 0 ? Math.min(...candidates) : template.length;
    segments.push(template.slice(index, end));
    index = end;
  }
  return segments.join('\n');
}

function humanTextForDottedInspection(file: string, source: string) {
  if (/\.astro$/i.test(file)) return humanTextFromAstro(file, source);
  if (/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i.test(file)) return humanTextFromCode(file, source);
  if (/\.ya?ml$/i.test(file)) {
    const expressionText: string[] = [];
    const prose = source.replace(/\$\{\{([\s\S]*?)\}\}/g, (_expression, code: string) => {
      expressionText.push(humanTextFromCode(`${file}.ts`, code));
      return '';
    });
    return [prose, ...expressionText].join('\n');
  }
  return source;
}

function dottedSourceForInspection(file: string, source: string) {
  if (file !== 'package-lock.json') return humanTextForDottedInspection(file, source);
  const lockfile = JSON.parse(source);
  const approvedFundingHosts = new Set([
    ['feross', 'org'].join('.'),
    ['opencollective', 'com'].join('.'),
    ['paulmillr', 'com'].join('.'),
    ['tidelift', 'com'].join('.'),
    ['www', 'patreon', 'com'].join('.'),
  ]);
  const sanitizeFundingUrl = (value: string) => {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (!approvedFundingHosts.has(hostname)) return value;
      const authorityStart = value.indexOf('//') + 2;
      const authorityEndOffset = value.slice(authorityStart).search(/[/?#]/);
      const authorityEnd = authorityEndOffset < 0
        ? value.length
        : authorityStart + authorityEndOffset;
      const authority = value.slice(authorityStart, authorityEnd);
      const credentialsEnd = authority.lastIndexOf('@') + 1;
      const hostnameStart = authorityStart + credentialsEnd;
      const rawHostname = value.slice(hostnameStart, hostnameStart + hostname.length);
      if (rawHostname.toLowerCase() !== hostname) return value;
      return `${value.slice(0, hostnameStart)}${rawHostname.replaceAll('.', '-')}${value.slice(hostnameStart + hostname.length)}`;
    } catch {
      return value;
    }
  };
  const sanitizeFundingValue = (value: unknown): unknown => {
    if (typeof value === 'string') return sanitizeFundingUrl(value);
    if (Array.isArray(value)) return value.map(sanitizeFundingValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      sanitizeFundingValue(child),
    ]));
  };
  const sanitizeLockfile = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitizeLockfile);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      key === 'funding' ? sanitizeFundingValue(child) : sanitizeLockfile(child),
    ]));
  };
  return JSON.stringify(sanitizeLockfile(lockfile));
}

function findAbsoluteHomeDirectoryPaths(source: string) {
  const absoluteHome = /(?<![A-Za-z0-9.:])\/(?:Users|home)\/[^/\\\s"'`]+(?:\/|(?=$|[\s,;:!?)\]}"'`]))|(?<![A-Za-z0-9])[A-Z]:\\{1,2}Users\\{1,2}[^/\\\s"'`]+(?:\\{1,2}|(?=$|[\s,;:!?)\]}"'`]))/gi;
  return [...source.matchAll(absoluteHome)].map((match) => match[0]);
}

const approvedBrandTokens = new Set([
  'flowsolve-app-icon',
  'flowsolve-app-icon-desc',
  'flowsolve-app-icon-title',
  'flowsolve-app-icon.svg',
  'flowsolve-boundary',
  'flowsolve-bundles',
  'flowsolve-client-asset-manifest',
  'flowsolve-finalize',
  'flowsolve-logo-desc',
  'flowsolve-logo-horizontal-reversed.svg',
  'flowsolve-logo-horizontal.svg',
  'flowsolve-logo-monochrome-desc',
  'flowsolve-logo-monochrome-title',
  'flowsolve-logo-monochrome.svg',
  'flowsolve-logo-reversed-desc',
  'flowsolve-logo-reversed-title',
  'flowsolve-logo-title',
  'flowsolve-mark-desc',
  'flowsolve-mark-title',
  'flowsolve-mark.svg',
  'flowsolve-og.png',
  'flowsolve-outside',
  'flowsolve-site',
  'flowsolve-wordmark',
]);

function findUnauthorizedBrandTokens(source: string) {
  const brandToken = /\bflowsolve-[a-z0-9][a-z0-9._-]*\b/gi;
  return [...source.matchAll(brandToken)]
    .map((match) => match[0].toLowerCase())
    .filter((token) => !approvedBrandTokens.has(token));
}

function findUnauthorizedOwnerRepositories(source: string, owner: string, publicRepository: string) {
  const repositories = new RegExp(`github\\.com/${escapeRegExp(owner)}/([a-z0-9_.-]+)`, 'gi');

  return [...source.matchAll(repositories)]
    .map((match) => match[1].replace(/\.git$/i, ''))
    .filter((repository) => repository.toLowerCase() !== publicRepository.toLowerCase());
}

function permissionBlocks(workflow: string) {
  const lines = workflow.split('\n');
  const blocks: string[][] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)permissions:\s*(\S+)?\s*$/);
    if (!match) continue;
    if (match[2]) {
      blocks.push([match[2]]);
      continue;
    }
    const indentation = match[1].length;
    const entries = [];
    while (index + 1 < lines.length) {
      const entry = lines[index + 1].match(/^(\s*)([a-z-]+):\s*(read|write|none)\s*$/);
      if (!entry || entry[1].length <= indentation) break;
      entries.push(`${entry[2]}: ${entry[3]}`);
      index += 1;
    }
    blocks.push(entries);
  }
  return blocks;
}

function workflowRunCommands(workflow: string) {
  return [...workflow.matchAll(/^\s*-\s*run:\s*([^\n]+?)\s*$/gm)].map((match) => match[1]);
}

describe('public repository guardrails', () => {
  it('pins the package manager, dependency overrides, and lockfile identity', async () => {
    const packageJson = await readJson('package.json');
    const lockfile = await readJson('package-lock.json');

    expect(packageJson.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(packageJson.overrides).toEqual({ tmp: '0.2.7', uuid: '11.1.1' });
    expect(lockfile.name).toBe('@flowsolve/site');
    expect(findUnapprovedLockfileResolvedUrls(lockfile)).toEqual([]);
  });

  it('ignores local secrets while preserving the public environment example', async () => {
    const gitignore = await readText('.gitignore');

    expect(gitignore).toContain('.env*');
    expect(gitignore).toContain('!.env.example');
  });

  it('allows only the exact public package contract and its subpaths', () => {
    const publicPackage = '@flowsolve/site';
    const lookalikes = [
      [publicPackage, '-tools'].join(''),
      [publicPackage, '.foo'].join(''),
    ];

    expect(findUnauthorizedPublicScopePackages(
      `import '${publicPackage}'; import '${publicPackage}/runtime';`,
      publicPackage,
    )).toEqual([]);
    expect(findUnauthorizedPublicScopePackages(
      lookalikes.map((specifier) => `import '${specifier}';`).join('\n'),
      publicPackage,
    )).toEqual(lookalikes);
  });

  it('recognizes generic legacy Actions run references', () => {
    const legacyRun = ['actions/runs/', '123456'].join('');

    expect(findLegacyActionsRunReferences(`Previous run: ${legacyRun}`)).toEqual([legacyRun]);
    expect(findLegacyActionsRunReferences('No historical workflow URL')).toEqual([]);
  });

  it('rejects non-reserved email values including public maintainer and URL credentials', () => {
    const workEmail = [['person', 'sample-corp'].join('@'), 'com'].join('.');
    const credentialEmail = [['account', 'github'].join('@'), 'com'].join('.');
    const publicMaintainerEmail = ['i', ['izs', 'me'].join('.')].join('@');
    const credentialUrl = ['https://', credentialEmail, '/public/repository'].join('');

    expect(findNonReservedEmailValues([
      'person@example.test',
      'person@example.com',
      publicMaintainerEmail,
      workEmail,
      credentialUrl,
    ].join('\n'))).toEqual([publicMaintainerEmail, workEmail, credentialEmail]);
  });

  it('exempts the exact public maintainer email only in package-lock deprecated fields', () => {
    const publicMaintainerEmail = ['i', ['izs', 'me'].join('.')].join('@');
    const neutralEmail = [['person', 'sample-corp'].join('@'), 'com'].join('.');
    const lockfileSource = JSON.stringify({
      packages: {
        approved: { deprecated: `Contact ${publicMaintainerEmail}` },
        neutral: { deprecated: `Contact ${neutralEmail}` },
        outside: { maintainer: publicMaintainerEmail },
      },
    });

    expect(findNonReservedEmailValues(lockfileSource, 'package-lock.json')).toEqual([
      neutralEmail,
      publicMaintainerEmail,
    ]);
    expect(findNonReservedEmailValues(
      JSON.stringify({ deprecated: `Contact ${publicMaintainerEmail}` }),
      'fixture.json',
    )).toEqual([publicMaintainerEmail]);
  });

  it('allows lockfile resolution only through credential-free public-registry URLs', () => {
    const credentialUrl = ['https://', 'account:secret', '@registry.npmjs.org/package/-/package.tgz'].join('');
    const alternateUrl = ['https://packages', 'example.test/package.tgz'].join('.');
    const queryUrl = ['https://registry.npmjs.org/package/-/package.tgz', '?download=1'].join('');
    const fragmentUrl = ['https://registry.npmjs.org/package/-/package.tgz', '#archive'].join('');
    const emptyQueryUrl = ['https://registry.npmjs.org/package/-/package.tgz', '?'].join('');
    const emptyFragmentUrl = ['https://registry.npmjs.org/package/-/package.tgz', '#'].join('');
    const lockfileFixture = {
      packages: {
        safe: { resolved: 'https://registry.npmjs.org/package/-/package-1.0.0.tgz' },
        credential: { resolved: credentialUrl },
        alternate: { resolved: alternateUrl },
        query: { resolved: queryUrl },
        fragment: { resolved: fragmentUrl },
        emptyQuery: { resolved: emptyQueryUrl },
        emptyFragment: { resolved: emptyFragmentUrl },
      },
    };

    expect(findUnapprovedLockfileResolvedUrls(lockfileFixture)).toEqual([
      credentialUrl,
      alternateUrl,
      queryUrl,
      fragmentUrl,
      emptyQueryUrl,
      emptyFragmentUrl,
    ]);
  });

  it('keeps generated deprecation prose in the lockfile dotted-token view', () => {
    const deprecatedDottedValue = ['generated', 'message'].join('.');
    const trackedDottedValue = ['release', 'reviewer'].join('.');
    const deprecatedEmail = [['person', 'sample-corp'].join('@'), 'com'].join('.');
    const lockfileSource = JSON.stringify({
      packages: {
        dependency: {
          deprecated: `Contact ${deprecatedEmail} about ${deprecatedDottedValue}`,
          reviewer: trackedDottedValue,
        },
      },
    });

    expect(findUnauthorizedDottedTokens(
      dottedSourceForInspection('package-lock.json', lockfileSource),
      new Set<string>(),
    )).toEqual([deprecatedDottedValue, trackedDottedValue]);
    expect(findNonReservedEmailValues(lockfileSource)).toEqual([deprecatedEmail]);
  });

  it('sanitizes only exact funding hosts in package-lock funding fields', () => {
    const approvedFundingHosts = [
      ['feross', 'org'].join('.'),
      ['opencollective', 'com'].join('.'),
      ['paulmillr', 'com'].join('.'),
      ['tidelift', 'com'].join('.'),
      ['www', 'patreon', 'com'].join('.'),
    ];
    const fundingLockfileSource = JSON.stringify({
      packages: Object.fromEntries(approvedFundingHosts.map((host, index) => [
        `dependency-${index}`,
        { funding: { url: `https://${host}/project` } },
      ])),
    });
    const approvedOutsideFunding = approvedFundingHosts[0];
    const outsideLockfileSource = JSON.stringify({
      packages: { dependency: { homepage: `https://${approvedOutsideFunding}/project` } },
    });
    const fundingLookalike = ['preview', approvedFundingHosts[1]].join('.');
    const lookalikeLockfileSource = JSON.stringify({
      packages: { dependency: { funding: `https://${fundingLookalike}/project` } },
    });

    expect(findUnauthorizedDottedTokens(
      dottedSourceForInspection('package-lock.json', fundingLockfileSource),
      new Set<string>(),
    )).toEqual([]);
    expect(findUnauthorizedDottedTokens(
      dottedSourceForInspection('package-lock.json', outsideLockfileSource),
      new Set<string>(),
    )).toEqual([approvedOutsideFunding]);
    expect(findUnauthorizedDottedTokens(
      dottedSourceForInspection('package-lock.json', lookalikeLockfileSource),
      new Set<string>(),
    )).toEqual([fundingLookalike]);
  });

  it('allows intentional scanner tokens only in the exact public-boundary test', () => {
    const intentionalScannerTokens = [
      ['document', 'cookie'].join('.'),
      ['location', 'assign'].join('.'),
      ['posthog', 'capture'].join('.'),
    ];
    const source = intentionalScannerTokens.map((token) => `'${token}'`).join('\n');
    const lookalikes = intentionalScannerTokens.map((token) => [token, 'com'].join('.'));
    const lookalikeSource = lookalikes.map((token) => `'${token}'`).join('\n');
    const targetFile = 'tests/static/public-boundary.test.ts';

    expect(findUnauthorizedDottedTokens(
      humanTextForDottedInspection(targetFile, source),
      new Set<string>(),
      targetFile,
    )).toEqual([]);
    expect(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('tests/static/other.test.ts', source),
      new Set<string>(),
      'tests/static/other.test.ts',
    )).toEqual(intentionalScannerTokens);
    expect(findUnauthorizedDottedTokens(
      humanTextForDottedInspection(targetFile, lookalikeSource),
      new Set<string>(),
      targetFile,
    )).toEqual(lookalikes);
  });

  it('rejects work-identity and unknown domain tokens without flagging public or source tokens', () => {
    const workIdentity = ['given', 'surname'].join('.');
    const commentIdentity = ['review', 'ownername'].join('.');
    const workDomain = ['sample-corp', 'com'].join('.');
    const publicHosts = new Set([
      'github.com',
      'registry.npmjs.org',
    ]);

    const source = [
      'source.matchAll(pattern);',
      ['const workflow = github', 'workflow;'].join('.'),
      "const publicRepository = 'github.com';",
      "const registry = 'registry.npmjs.org';",
      "const reservedEmail = 'person@example.test';",
      "const reservedHost = 'pilot.example.com';",
      "const sourceFiles = 'src/client.ts tests/client.test.ts scripts/check-output.mjs README.md';",
      "const brandAsset = 'brand/flowsolve-app-icon.svg';",
      `const identity = '${workIdentity}';`,
      `const domain = '${workDomain}';`,
      `// reviewer identity: ${commentIdentity}`,
    ].join('\n');

    expect(new Set(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('fixture.ts', source),
      publicHosts,
    ))).toEqual(new Set([workIdentity, workDomain, commentIdentity]));
  });

  it('extracts human-readable JavaScript, TypeScript, and JSX content without member access', () => {
    const stringIdentity = ['string', 'reviewer'].join('.');
    const templateIdentity = ['template', 'reviewer'].join('.');
    const trailingCommentIdentity = ['trailing', 'reviewer'].join('.');
    const blockCommentIdentity = ['blocked', 'reviewer'].join('.');
    const jsxTextIdentity = ['visible', 'reviewer'].join('.');
    const jsxAttributeIdentity = ['attribute', 'reviewer'].join('.');
    const jsxCommentIdentity = ['comment', 'reviewer'].join('.');
    const executableMemberAccess = ['runtime', 'property'].join('.');
    const publicHosts = new Set<string>();
    const source = [
      `const stringValue = '${stringIdentity}';`,
      `const templateValue = \`${templateIdentity}\`;`,
      `const value = ${executableMemberAccess}; // ${trailingCommentIdentity}.`,
      `/* ${blockCommentIdentity}: */`,
      `<section title="${jsxAttributeIdentity}">${jsxTextIdentity}<span>{${executableMemberAccess}}</span>{/* ${jsxCommentIdentity} */}</section>;`,
    ].join('\n');

    expect(new Set(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('fixture.tsx', source),
      publicHosts,
    ))).toEqual(new Set([
      stringIdentity,
      templateIdentity,
      trailingCommentIdentity,
      blockCommentIdentity,
      jsxTextIdentity,
      jsxAttributeIdentity,
      jsxCommentIdentity,
    ]));
    expect(humanTextForDottedInspection('fixture.tsx', source)).not.toContain(executableMemberAccess);
  });

  it('extracts Astro frontmatter and human-readable template content without member access', () => {
    const frontmatterIdentity = ['frontmatter', 'reviewer'].join('.');
    const trailingCommentIdentity = ['servercode', 'reviewer'].join('.');
    const templateTextIdentity = ['template', 'identity'].join('.');
    const attributeIdentity = ['attribute', 'identity'].join('.');
    const htmlCommentIdentity = ['markup', 'reviewer'].join('.');
    const expressionStringIdentity = ['expression', 'reviewer'].join('.');
    const executableMemberAccess = ['runtime', 'property'].join('.');
    const publicHosts = new Set<string>();
    const source = [
      '---',
      `const reviewer = '${frontmatterIdentity}'; // ${trailingCommentIdentity}:`,
      '---',
      `<section data-review="${attributeIdentity}">`,
      `  ${templateTextIdentity}.`,
      `  <!-- ${htmlCommentIdentity}: -->`,
      `  <span>{${executableMemberAccess}}</span>`,
      `  <span>{'${expressionStringIdentity}'}</span>`,
      `  <script>${executableMemberAccess};</script>`,
      '</section>',
    ].join('\n');

    expect(new Set(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('fixture.astro', source),
      publicHosts,
    ))).toEqual(new Set([
      frontmatterIdentity,
      trailingCommentIdentity,
      templateTextIdentity,
      attributeIdentity,
      htmlCommentIdentity,
      expressionStringIdentity,
    ]));
    expect(humanTextForDottedInspection('fixture.astro', source)).not.toContain(executableMemberAccess);
  });

  it('scans plain prose and YAML configuration as human-readable text', () => {
    const proseIdentity = ['prose', 'reviewer'].join('.');
    const yamlIdentity = ['config', 'reviewer'].join('.');
    const yamlMemberAccess = ['github', 'workflow'].join('.');
    const publicHosts = new Set<string>();
    const yamlSource = [
      `reviewer: ${yamlIdentity}:`,
      ['expression: ${{ ', yamlMemberAccess, ' }}'].join(''),
    ].join('\n');

    expect(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('fixture.md', `Reviewer: ${proseIdentity}.`),
      publicHosts,
    )).toEqual([proseIdentity]);
    expect(findUnauthorizedDottedTokens(
      humanTextForDottedInspection('fixture.yml', yamlSource),
      publicHosts,
    )).toEqual([yamlIdentity]);
    expect(humanTextForDottedInspection('fixture.yml', yamlSource)).not.toContain(yamlMemberAccess);
  });

  it('rejects absolute macOS, Linux, and Windows home-directory paths', () => {
    const macHome = ['', 'Users', 'sample-user'].join('/');
    const linuxHome = ['', 'home', 'sample-user'].join('/');
    const windowsHome = ['C:', 'Users', 'sample-user'].join('\\');
    const escapedWindowsHome = windowsHome.replaceAll('\\', '\\\\');

    expect(findAbsoluteHomeDirectoryPaths([
      macHome,
      linuxHome,
      windowsHome,
      escapedWindowsHome,
    ].join('\n'))).toEqual([macHome, linuxHome, windowsHome, escapedWindowsHome]);
    expect(findAbsoluteHomeDirectoryPaths([
      `${macHome}/project/file.ts`,
      `${linuxHome}/project/file.ts`,
      `${windowsHome}\\project\\file.ts`,
      `${escapedWindowsHome}\\\\project\\\\file.ts`,
    ].join('\n'))).toEqual([
      `${macHome}/`,
      `${linuxHome}/`,
      `${windowsHome}\\`,
      `${escapedWindowsHome}\\\\`,
    ]);
    const delimitedRoots = [macHome, linuxHome, windowsHome, escapedWindowsHome]
      .flatMap((home) => ["'", '"', '`'].map((delimiter) => `${home}${delimiter}`));
    expect(findAbsoluteHomeDirectoryPaths(delimitedRoots.join('\n'))).toEqual(
      delimitedRoots.map((value) => value.slice(0, -1)),
    );
    expect(findAbsoluteHomeDirectoryPaths([
      'Users/sample-user/project/file.ts',
      './home/sample-user/project/file.ts',
      'C:Users\\sample-user\\project\\file.ts',
      '/Users/',
      '/home/',
    ].join('\n'))).toEqual([]);
  });

  it('rejects unknown brand-prefixed tokens anywhere while preserving public brand and tooling tokens', () => {
    const unknownBrandToken = ['flowsolve', 'shadow-console'].join('-');

    expect(findUnauthorizedBrandTokens([
      'flowsolve-site',
      'flowsolve-app-icon.svg',
      'flowsolve-app-icon-title',
      'flowsolve-logo-horizontal-reversed.svg',
      'flowsolve-logo-monochrome-desc',
      'flowsolve-mark.svg',
      'flowsolve-wordmark',
      'flowsolve-og.png',
      'flowsolve-client-asset-manifest',
      'flowsolve-boundary-',
      'flowsolve-bundles-',
      'flowsolve-finalize-',
      'flowsolve-outside-',
      unknownBrandToken,
    ].join('\n'))).toEqual([unknownBrandToken]);
  });

  it('allows only the reviewed workflow actions, ordered audits, and least privileges', async () => {
    const ci = await readText('.github/workflows/ci.yml');
    const pages = await readText('.github/workflows/pages.yml');
    const workflows = `${ci}\n${pages}`;
    const approvedUses = [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
      'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
    ].sort();
    const actualUses = [...workflows.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)]
      .map((match) => match[1])
      .sort();
    const cleanInstall = 'npm ci --registry=https://registry.npmjs.org';
    const highAudit = 'npm audit --audit-level=high --registry=https://registry.npmjs.org';

    expect(actualUses).toEqual(approvedUses);
    for (const workflow of [ci, pages]) {
      const commands = workflowRunCommands(workflow);
      expect(commands.filter((command) => command === cleanInstall)).toHaveLength(1);
      expect(commands.filter((command) => command === highAudit)).toHaveLength(1);
      expect(commands.indexOf(highAudit)).toBeGreaterThan(commands.indexOf(cleanInstall));
    }
    expect(permissionBlocks(ci)).toEqual([['contents: read']]);
    expect(permissionBlocks(pages)).toEqual([
      ['contents: read'],
      ['contents: read', 'pages: read'],
      ['pages: write', 'id-token: write'],
    ]);
  });

  it('builds only the approved CTA-less Pages preview artifact', async () => {
    const packageJson = await readJson('package.json');
    const pages = await readText('.github/workflows/pages.yml');

    expect(pages).toContain('PUBLIC_PREVIEW_MODE: ${{ vars.PUBLIC_PREVIEW_MODE }}');
    expect(pages).not.toContain('PUBLIC_PILOT_REQUEST_URL');
    expect(pages).not.toContain('PUBLIC_PILOT_SIGN_IN_URL');
    expect(packageJson.scripts['test:e2e']).toContain('PUBLIC_PREVIEW_MODE=');

    const orderedSteps = [
      'npm run pages:preflight',
      'npm run verify',
      'npm run build',
      'npm run test:static',
      'actions/upload-pages-artifact@',
    ];
    let previous = -1;
    for (const step of orderedSteps) {
      const current = pages.indexOf(step);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('scopes the explicit live fixture environment to build and browser commands', async () => {
    const packageJson = await readJson('package.json');
    const fixtureEnvironment = [
      'PUBLIC_PREVIEW_MODE=',
      'PUBLIC_PILOT_REQUEST_URL=https://github.com/corsinlo/flowsolve-site/issues/new',
      'PUBLIC_PILOT_SIGN_IN_URL=https://www.linkedin.com/login',
    ];

    for (const scriptName of ['test:e2e', 'test:perf:interaction']) {
      const segments = packageJson.scripts[scriptName].split('&&').map((segment: string) => segment.trim());
      expect(segments).toHaveLength(2);
      for (const segment of segments) {
        for (const variable of fixtureEnvironment) expect(segment).toContain(variable);
      }
    }
  });

  it('ships public project, disclosure, and dependency-update documentation', async () => {
    await expect(access('README.md')).resolves.toBeUndefined();
    await expect(access('SECURITY.md')).resolves.toBeUndefined();
    await expect(access('.github/dependabot.yml')).resolves.toBeUndefined();

    const [readme, security, dependabot, previewGate] = await Promise.all([
      readText('README.md'),
      readText('SECURITY.md'),
      readText('.github/dependabot.yml'),
      readText('docs/pages-preview-gate.md'),
    ]);
    for (const route of ['/flowsolve-site/en/', '/flowsolve-site/it/', '/flowsolve-site/nl/']) {
      expect(readme).toContain(route);
    }
    expect(readme).toMatch(/collects no\s+data/i);
    expect(readme).toMatch(/temporary/i);
    expect(readme).toMatch(/no license is granted/i);
    expect(security).toContain('https://github.com/corsinlo/flowsolve-site/security/advisories/new');
    expect(security).toMatch(/do not open a public issue/i);
    expect(dependabot.match(/package-ecosystem:/g)).toHaveLength(2);
    expect(dependabot.match(/directory: \//g)).toHaveLength(2);
    expect(dependabot.match(/interval: weekly/g)).toHaveLength(2);
    expect(dependabot.match(/day: monday/g)).toHaveLength(2);
    expect(dependabot.match(/open-pull-requests-limit: 5/g)).toHaveLength(2);
    expect(previewGate).toContain('Pages preview preflight passed');
    expect(previewGate).not.toContain('Pages CTA preflight passed');
  });

  it('contains no non-public identity, path, brand, package, repository, or legacy run markers in release source', async () => {
    const { stdout } = await execFileAsync('git', [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
    ]);
    const releaseFiles = stdout.trim().split('\n').filter((file) => (
      file && !file.startsWith('docs/superpowers/')
    ));
    const sources = await Promise.all(releaseFiles.map(async (file) => ({
      file,
      source: await readText(file),
    })));
    const publicPackage = '@flowsolve/site';
    const publicHosts = new Set([
      'corsinlo.github.io',
      'docs.github.com',
      'github.com',
      'registry.npmjs.org',
      'www.linkedin.com',
      'www.w3.org',
    ]);
    const violations = sources.flatMap(({ file, source }) => {
      const dottedSource = dottedSourceForInspection(file, source);
      return [
        ...findNonReservedEmailValues(source, file)
          .map((email) => ({ file, rule: 'private_identity', detail: email })),
        ...findUnauthorizedDottedTokens(dottedSource, publicHosts, file)
          .map((token) => ({ file, rule: 'private_domain', detail: token })),
        ...findAbsoluteHomeDirectoryPaths(source)
          .map((path) => ({ file, rule: 'local_home_path', detail: path })),
        ...findUnauthorizedBrandTokens(source)
          .map((token) => ({ file, rule: 'private_brand', detail: token })),
        ...findUnauthorizedPublicScopePackages(source, publicPackage)
          .map((specifier) => ({ file, rule: 'private_package', detail: specifier })),
        ...findUnauthorizedOwnerRepositories(source, 'corsinlo', 'flowsolve-site')
          .map((repository) => ({ file, rule: 'private_repository', detail: repository })),
        ...findLegacyActionsRunReferences(source)
          .map((reference) => ({ file, rule: 'legacy_actions_run', detail: reference })),
      ];
    });

    expect(violations).toEqual([]);
  });
});
