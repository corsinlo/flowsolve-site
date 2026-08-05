import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  allowedCtasForEnvironment,
  dependencyOutputFiles,
  inspectDistEntry,
  inspectCss,
  inspectEmittedModule,
  inspectFirstPartyModule,
  inspectHtml,
  inspectStaticContent,
  isFirstPartyModuleFile,
  isStaticContentFile,
} from '../../scripts/check-static-output.mjs';

describe('public static-site boundary', () => {
  it('allows no external CTAs in preview mode and only validated CTAs in live mode', () => {
    expect(allowedCtasForEnvironment({ PUBLIC_PREVIEW_MODE: 'true' })).toEqual(new Set());
    expect(allowedCtasForEnvironment({
      PUBLIC_PILOT_REQUEST_URL: 'https://github.com/corsinlo/flowsolve-site/issues/new',
      PUBLIC_PILOT_SIGN_IN_URL: 'https://www.linkedin.com/login',
    })).toEqual(new Set([
      'https://github.com/corsinlo/flowsolve-site/issues/new',
      'https://www.linkedin.com/login',
    ]));
  });

  it('classifies only dependency-only emitted chunks from valid source maps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flowsolve-boundary-'));
    const dependencyMap = join(directory, 'dependency.js.map');
    const mixedMap = join(directory, 'mixed.js.map');
    const malformedMap = join(directory, 'malformed.js.map');
    const unmarked = join(directory, 'unmarked.js');

    try {
      await writeFile(dependencyMap, JSON.stringify({ sources: ['../../node_modules/three/src/loaders/FileLoader.js'] }));
      await writeFile(mixedMap, JSON.stringify({ sources: ['../../node_modules/three/src/loaders/FileLoader.js', '../../src/client.ts'] }));
      await writeFile(malformedMap, '{not json');
      await writeFile(unmarked, 'fetch("/x")');

      await expect(dependencyOutputFiles([dependencyMap, mixedMap, malformedMap, unmarked]))
        .resolves.toEqual(new Set([dependencyMap.slice(0, -4)]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('includes first-party JavaScript modules and excludes test, declaration, and dependency files', () => {
    expect([
      isFirstPartyModuleFile('src/client.js'),
      isFirstPartyModuleFile('src/client.jsx'),
      isFirstPartyModuleFile('src/client.mjs'),
      isFirstPartyModuleFile('src/client.mts'),
      isFirstPartyModuleFile('src/client.cts'),
      isFirstPartyModuleFile('src/client.test.js'),
      isFirstPartyModuleFile('src/client.spec.tsx'),
      isFirstPartyModuleFile('src/env.d.ts'),
      isFirstPartyModuleFile('src/env.d.mts'),
      isFirstPartyModuleFile('src/env.d.cts'),
      isFirstPartyModuleFile('src/vendor/node_modules/client.js'),
    ]).toEqual([true, true, true, true, true, false, false, false, false, false, false]);
  });

  it('identifies emitted text formats that need high-signal content scanning', () => {
    expect([
      isStaticContentFile('dist/en/index.html'),
      isStaticContentFile('dist/_astro/site.css'),
      isStaticContentFile('dist/customer.json'),
      isStaticContentFile('dist/logo.svg'),
      isStaticContentFile('dist/sitemap.xml'),
      isStaticContentFile('dist/robots.txt'),
      isStaticContentFile('dist/flowsolve-og.png'),
    ]).toEqual([true, true, true, true, true, true, false]);
  });

  it('finds high-signal private data in static text without flagging ordinary Amplitude copy', () => {
    const violations = inspectStaticContent(
      'dist/customer.svg',
      '<svg><text>Amplitude is visible copy</text><metadata>driver@example.test OPENAI_API_KEY eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature sk-proj_ABCDEFGHJK</metadata></svg>',
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'secret_name',
      'email_value',
      'jwt_value',
      'token_value',
    ]);
  });

  it('does not confuse the approved app-icon asset name with a private package import', () => {
    expect(inspectStaticContent(
      'dist/brand/flowsolve-app-icon.svg',
      'aria-labelledby="flowsolve-app-icon-title"',
    )).toEqual([]);
  });

  it('detects newer Dutch plate sidecodes in static content', () => {
    expect(inspectStaticContent('dist/customer.json', '1-ABC-23 AB-123-C A-123-BC')
      .map(({ rule }) => rule)).toEqual(['nl_plate_value']);
  });

  it('detects bearer token values in static content', () => {
    expect(inspectStaticContent('dist/customer.json', 'Authorization: Bearer opaque-secret-token-value')
      .map(({ rule }) => rule)).toEqual(['token_value']);
  });

  it('detects GitHub fine-grained token values in static content', () => {
    expect(inspectStaticContent('dist/customer.json', 'github_pat_0123456789ABCDEF0123456789')
      .map(({ rule }) => rule)).toEqual(['token_value']);
  });

  it('inspects standalone emitted CSS URLs', () => {
    expect(inspectCss(
      'dist/_astro/site.css',
      '@import url("https://fonts.example.test/site.css"); .hero { background: url(/outside.png); }',
      new Set(),
    ).map(({ rule }) => rule)).toEqual(['unapproved_external_url', 'base_path_escape']);
  });

  it('ignores CSS comments and quoted text that merely contain url syntax', () => {
    expect(inspectCss(
      'dist/_astro/site.css',
      '/* url(https://comment.example.test/x.png) */ .note::before { content: "url(https://copy.example.test/x.png)"; }',
      new Set(),
    )).toEqual([]);
  });

  it('rejects forms and personal-data controls in generated HTML', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<form action="/flowsolve-site/submit"><input name="email"><textarea></textarea><select></select></form>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'form_forbidden',
      'form_action_forbidden',
      'data_collection_control',
      'data_collection_control',
      'data_collection_control',
    ]);
  });

  it('rejects controls that submit through a formaction override', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<button type="submit" formaction="https://collect.example.test/lead">Send</button>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'form_action_forbidden',
      'data_collection_control',
      'unapproved_external_url',
    ]);
  });

  it('allows only the approved conversion destinations as external anchors', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      [
        '<a href="https://request.example.test/pilot">Request</a>',
        '<a href="https://app.example.test/sign-in">Sign in</a>',
        '<img src="https://cdn.example.test/brand.svg">',
        '<a href="https://other.example.test/">Other</a>',
      ].join(''),
      new Set(['https://request.example.test/pilot', 'https://app.example.test/sign-in']),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'unapproved_external_url',
      'unapproved_external_url',
    ]);
  });

  it('rejects remote URLs in every network-capable HTML attribute', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<img srcset="https://cdn.example.test/one.png 1x"><link imagesrcset="https://cdn.example.test/two.png 2x"><video poster="https://cdn.example.test/poster.jpg"></video><object data="https://cdn.example.test/document.pdf"></object><a ping="https://collect.example.test/ping">Go</a><form action="https://collect.example.test/submit"></form>',
      new Set(),
    );

    expect(violations.filter(({ rule }) => rule === 'unapproved_external_url')).toHaveLength(6);
  });

  it('rejects executable data URLs while allowing embedded image data', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      [
        '<script src="data:text/javascript,alert(1)"></script>',
        '<iframe src="data:text/html,<form></form>"></iframe>',
        '<object data="data:text/html,unsafe"></object>',
        '<img src="data:image/png;base64,AA==">',
        '<img srcset="data:text/html,alert(1) 1x">',
        '<source src="data:image/png;base64,AA==">',
        '<link imagesrcset="data:image/png;base64,AA== 1x">',
      ].join(''),
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'executable_data_url',
      'executable_data_url',
      'executable_data_url',
      'executable_data_url',
      'executable_data_url',
      'executable_data_url',
    ]);
  });

  it('preserves realistic data image candidates in img and source srcset values', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      [
        '<img srcset="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD 1x, /flowsolve-site/brand/flowsolve-mark.svg 2x">',
        '<picture><source srcset="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD 1x, /flowsolve-site/brand/flowsolve-mark.svg 2x"></picture>',
      ].join(''),
      new Set(),
    );

    expect(violations).toEqual([]);
  });

  it('rejects meta refresh and every URL in a whitespace-delimited ping list', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<meta http-equiv="refresh" content="0; url=https://redirect.example.test/next"><a ping="https://collect.example.test/one https://collect.example.test/two">Go</a>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'unapproved_external_url',
      'unapproved_external_url',
      'unapproved_external_url',
    ]);
  });

  it('recursively inspects iframe srcdoc content', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<iframe srcdoc="&lt;form&gt;&lt;input name=&#39;email&#39;&gt;&lt;/form&gt;&lt;img src=&#39;https://collect.example.test/pixel.png&#39;&gt;"></iframe>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'form_forbidden',
      'data_collection_control',
      'unapproved_external_url',
    ]);
  });

  it('rejects remote CSS imports and URL values without treating visible copy as a URL', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<style>@import "https://fonts.example.test/site.css"; .poster { background: url(https://cdn.example.test/poster.png); }</style><div style="background-image: url(https://cdn.example.test/inline.png)"></div><p>https://docs.example.test is visible copy.</p>',
      new Set(),
    );

    expect(violations.filter(({ rule }) => rule === 'unapproved_external_url')).toHaveLength(3);
  });

  it('applies first-party runtime rules to inline scripts and event handlers', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<button onclick="fetch(\'/preview\'); localStorage.setItem(\'seen\', \'1\')">Preview</button><script>navigator[\'sendBeacon\'](\'/collect\')</script>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'network_beacon',
      'network_fetch',
      'browser_storage',
    ]);
  });

  it('keeps first-party links below the published base path', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<a href="/flowsolve-site/it/">Italiano</a><img src="/favicon.svg"><a href="#pilot">Pilot</a>',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['base_path_escape']);
  });

  it('rejects first-party runtime access and Three loader primitives', () => {
    const violations = inspectFirstPartyModule(
      'src/scene/client.tsx',
      'fetch("/preview"); new XMLHttpRequest(); new WebSocket("wss://example.test"); new EventSource("/events"); navigator.sendBeacon("/analytics"); useLoader(FileLoader, "/asset.glb");',
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'network_fetch',
      'network_xhr',
      'network_websocket',
      'network_eventsource',
      'network_beacon',
      'three_loader',
    ]);
  });

  it('rejects first-party navigation sinks with stable rule codes', () => {
    const violations = inspectFirstPartyModule(
      'src/navigation.ts',
      "window.open('https://example.test'); location.assign('https://example.test'); window.location.href = 'https://example.test';",
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'navigation_open',
      'navigation_assign',
      'navigation_location',
    ]);
  });

  it('rejects comment-only appearances of every navigation sink', () => {
    const violations = inspectFirstPartyModule(
      'src/navigation-comments.ts',
      "// window.open('https://example.test')\n/* location.assign('https://example.test') */\n// window.location.href = 'https://example.test'",
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'navigation_open',
      'navigation_assign',
      'navigation_location',
    ]);
  });

  it('rejects string-only appearances of every navigation sink', () => {
    const violations = inspectFirstPartyModule(
      'src/navigation-copy.ts',
      "const copy = \"window.open('https://example.test'); location.assign('https://example.test'); window.location.href = 'https://example.test'\";",
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'navigation_open',
      'navigation_assign',
      'navigation_location',
    ]);
  });

  it('rejects executable remote image and dynamic-import sinks without scanning prose', () => {
    const violations = inspectFirstPartyModule(
      'src/client.mts',
      'new Image().src = "https://track.example.test/pixel"; import("https://cdn.example.test/payload.js"); const copy = "new Image().src = https://docs.example.test and import(https://docs.example.test)"; const prose = "const request = fetch; request()";',
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['network_image', 'network_dynamic_import']);
  });

  it('rejects remote assignments through an Image binding', () => {
    expect(inspectFirstPartyModule(
      'src/client.ts',
      'const image = new Image(); image.src = "https://evil.example.test/pixel";',
    ).map(({ rule }) => rule)).toEqual(['network_image']);
  });

  it('rejects first-party tracking and browser storage primitives', () => {
    const violations = inspectFirstPartyModule(
      'src/analytics.ts',
      'gtag("config", "id"); dataLayer.push({}); localStorage.setItem("seen", "yes"); document.cookie = "id=1";',
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'browser_storage',
      'analytics_tracker',
    ]);
  });

  it('rejects an aliased computed navigator sendBeacon call', () => {
    const violations = inspectFirstPartyModule(
      'src/telemetry.js',
      'const beacon = navigator["sendBeacon"]; beacon("/collect");',
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['network_beacon']);
  });

  it('rejects aliased and global fetch with _paq and Clarity tracker calls', () => {
    const violations = inspectFirstPartyModule(
      'src/telemetry.cts',
      'const request = fetch; request("/collect"); globalThis["fetch"]("/preview"); _paq.push(["trackPageView"]); clarity("event");',
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['analytics_tracker', 'network_fetch']);
  });

  it('rejects a binding to computed globalThis fetch', () => {
    expect(inspectFirstPartyModule(
      'src/telemetry.ts',
      'const request = globalThis["fetch"]; request("/collect");',
    ).map(({ rule }) => rule)).toEqual(['network_fetch']);
  });

  it('rejects first-party secrets and private-application coupling', () => {
    const violations = inspectFirstPartyModule(
      'src/private.ts',
      [
        'import app from "@example-internal/pilot"; const endpoint = "/api/quotes";',
        ' const repo = "github.com/example-internal/private-app"; const key = SUPABASE_SERVICE_ROLE_KEY;',
      ].join(''),
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'private_api',
      'private_package',
      'private_repository',
      'secret_name',
    ]);
  });

  it('rejects side-effect private package imports', () => {
    expect(inspectFirstPartyModule(
      'src/private.ts',
      'import "@example-internal/pilot";',
    ).map(({ rule }) => rule)).toEqual(['private_package']);
  });

  it('rejects public-scope package lookalikes while allowing the exact public package and subpaths', () => {
    const publicPackage = '@flowsolve/site';
    const lookalike = [publicPackage, '-tools'].join('');
    expect(inspectFirstPartyModule(
      'src/private.ts',
      `import "${lookalike}";`,
    ).map(({ rule }) => rule)).toEqual(['private_package']);
    expect(inspectFirstPartyModule(
      'src/public.ts',
      `import "${publicPackage}"; import "${publicPackage}/runtime";`,
    )).toEqual([]);
  });

  it('rejects generic brand-prefixed module imports', () => {
    const brandPrefixedModule = ['flowsolve', '-worker'].join('');
    expect(inspectFirstPartyModule(
      'src/private.ts',
      `import "${brandPrefixedModule}";`,
    ).map(({ rule }) => rule)).toEqual(['private_package']);
  });

  it('rejects owner repository URLs other than the approved public site', () => {
    const unapprovedRepository = ['github.com/corsinlo/', 'example-sandbox'].join('');
    expect(inspectFirstPartyModule(
      'src/private.ts',
      `const repository = "${unapprovedRepository}";`,
    ).map(({ rule }) => rule)).toEqual(['private_repository']);
    expect(inspectFirstPartyModule(
      'src/public.ts',
      'const repository = "github.com/corsinlo/flowsolve-site/security/advisories/new";',
    )).toEqual([]);
  });

  it('allows dormant dependency loader capability but rejects high-signal emitted privacy data', () => {
    const directDependency = 'dist/node_modules/three/src/loaders/FileLoader.js';
    expect(inspectEmittedModule(directDependency, 'class FileLoader { load() { return fetch(url); } }', new Set([directDependency])))
      .toEqual([]);
    expect(inspectEmittedModule('dist/_astro/site.js', 'new FileLoader().load(); fetch("/preview");')
      .map(({ rule }) => rule)).toEqual(['network_fetch', 'three_loader']);
    const dependencyChunk = 'dist/_astro/three.DEPENDENCY.js';
    expect(inspectEmittedModule(
      dependencyChunk,
      'class FileLoader { load() { return fetch(url); } }',
      new Set([dependencyChunk]),
    )).toEqual([]);

    const violations = inspectEmittedModule(
      'dist/_astro/site.js',
      'posthog.capture(); FingerprintJS.load(); const api = "/api/orders"; import app from "example-private-app"; const repo = "github.com/example-internal/private-app"; const secret = OPENAI_API_KEY; const email = "driver@example.test"; const vin = "WVWZZZ1JZXW000001"; const plate = "AB-12-CD";',
    );

    expect(violations.map(({ rule }) => rule)).toEqual([
      'analytics_tracker',
      'fingerprinting',
      'private_api',
      'private_package',
      'private_repository',
      'secret_name',
      'email_value',
      'vin_value',
      'nl_plate_value',
    ]);
  });

  it('allows only the approved local brand assets', () => {
    const violations = inspectHtml(
      'dist/en/index.html',
      '<img src="/flowsolve-site/brand/flowsolve-mark.svg"><img src="/flowsolve-site/brand/unapproved.svg">',
      new Set(),
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['unapproved_local_brand_asset']);
  });

  it('rejects non-static files in the built output', () => {
    expect(inspectDistEntry('dist/en/index.html')).toEqual([]);
    expect(inspectDistEntry('dist/server/entry.cjs').map(({ rule }) => rule)).toEqual(['server_output']);
  });

  it('rejects unapproved brand files and server-shaped static output paths', () => {
    expect(inspectDistEntry('dist/brand/unapproved.svg').map(({ rule }) => rule))
      .toEqual(['unapproved_brand_output']);
    expect(inspectDistEntry('dist/server/entry.mjs').map(({ rule }) => rule))
      .toEqual(['server_output']);
    expect(inspectDistEntry('dist/_astro/manifest.json').map(({ rule }) => rule))
      .toEqual(['server_manifest']);
    expect(inspectDistEntry('dist/customer-fixture.json').map(({ rule }) => rule))
      .toEqual(['customer_fixture_output']);
  });

  it('rejects worker, routes, Netlify, manifest variants, and normalized customer fixtures', () => {
    expect(inspectDistEntry('dist/_worker.js').map(({ rule }) => rule)).toEqual(['server_output']);
    expect(inspectDistEntry('dist/_routes.json').map(({ rule }) => rule)).toEqual(['server_manifest']);
    expect(inspectDistEntry('dist/.netlify/functions-internal/handler.js').map(({ rule }) => rule)).toEqual(['server_output']);
    expect(inspectDistEntry('dist/_astro/manifest-client.json').map(({ rule }) => rule)).toEqual(['server_manifest']);
    expect(inspectDistEntry('dist/fixtures/customers.json').map(({ rule }) => rule)).toEqual(['customer_fixture_output']);
    expect(inspectDistEntry('dist/data/customerFixtures.json').map(({ rule }) => rule)).toEqual(['customer_fixture_output']);
    expect(inspectDistEntry('dist/_astro/manifest_abc.mjs').map(({ rule }) => rule)).toEqual(['server_manifest']);
    expect(inspectDistEntry('dist/assets/customer-success.svg')).toEqual([]);
    expect(inspectDistEntry('dist/_astro/fixture-grid.css')).toEqual([]);
  });

  it('rejects server rendering and deployment adapters in first-party config', () => {
    const violations = inspectFirstPartyModule(
      'astro.config.ts',
      'export default defineConfig({ output: "server", adapter: vercel() });',
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['server_output', 'server_adapter']);
  });

  it('rejects shorthand and computed server configuration keys', () => {
    const violations = inspectFirstPartyModule(
      'astro.config.ts',
      'const output = "server"; const adapter = deploy(); defineConfig({ output, adapter, ["output"]: "server", [adapterKey]: adapter });',
    );

    expect(violations.map(({ rule }) => rule)).toEqual(['server_output', 'server_adapter']);
  });

  it('accepts safe static constants and an undefined adapter', () => {
    expect(inspectFirstPartyModule(
      'astro.config.ts',
      'const STATIC = "static"; const adapter = undefined; defineConfig({ output: STATIC, adapter });',
    )).toEqual([]);
  });

  it('resolves computed config keys bound to output and adapter', () => {
    expect(inspectFirstPartyModule(
      'astro.config.ts',
      'const outputKey = "output"; const deploymentKey = "adapter"; defineConfig({ [outputKey]: "server", [deploymentKey]: node() });',
    ).map(({ rule }) => rule)).toEqual(['server_output', 'server_adapter']);
  });

  it('reports stable rule codes for an intentionally unsafe fixture', () => {
    const unsafe = {
      html: '<form action="/submit"><input name="email"></form><img src="https://cdn.example.test/font.woff2"><a href="https://other.example.test/">Other</a><img src="/favicon.svg"><img src="/flowsolve-site/brand/unknown.svg"><a href="http://[invalid">Broken</a><script>posthog.capture()</script>',
      source: 'fetch("/x"); new XMLHttpRequest(); new WebSocket("wss://x"); new EventSource("/x"); navigator.sendBeacon("/x"); localStorage.setItem("x", "1"); useLoader(FileLoader, "x"); export default { output: "server", adapter: edge() };',
      emitted: 'FingerprintJS.load(); const api = "/api/x"; import app from "@example-internal/pilot"; const repo = "github.com/example-internal/private-app"; const key = OPENAI_API_KEY; const email = "person@example.test"; const vin = "WVWZZZ1JZXW000001"; const plate = "AB-12-CD";',
      entry: 'dist/server/entry.cjs',
    };

    expect(inspectHtml('dist/en/index.html', unsafe.html, new Set()).map(({ rule }) => rule)).toEqual([
      'form_forbidden',
      'form_action_forbidden',
      'data_collection_control',
      'analytics_tracker',
      'base_path_escape',
      'unapproved_external_url',
      'unapproved_external_url',
      'base_path_escape',
      'unapproved_local_brand_asset',
      'invalid_url',
    ]);
    expect(inspectFirstPartyModule('astro.config.ts', unsafe.source).map(({ rule }) => rule)).toEqual([
      'network_fetch',
      'network_xhr',
      'network_websocket',
      'network_eventsource',
      'network_beacon',
      'browser_storage',
      'three_loader',
      'server_output',
      'server_adapter',
    ]);
    expect(inspectEmittedModule('dist/_astro/unsafe.js', unsafe.emitted).map(({ rule }) => rule)).toEqual([
      'fingerprinting',
      'private_api',
      'private_package',
      'private_repository',
      'secret_name',
      'email_value',
      'vin_value',
      'nl_plate_value',
    ]);
    expect(inspectDistEntry(unsafe.entry).map(({ rule }) => rule)).toEqual(['server_output']);
  });
});
