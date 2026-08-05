import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validatePagesCtas, validatePagesRelease } from './check-pages-cta.mjs';

const PREVIEW_KEY = 'PUBLIC_PREVIEW_MODE';
const REQUEST_KEY = 'PUBLIC_PILOT_REQUEST_URL';
const SIGN_IN_KEY = 'PUBLIC_PILOT_SIGN_IN_URL';
const SCRIPT_PATH = fileURLToPath(new URL('./check-pages-cta.mjs', import.meta.url));

const validEnv = (overrides = {}) => ({
  [REQUEST_KEY]: 'https://github.com/corsinlo/flowsolve-site/issues/new',
  [SIGN_IN_KEY]: 'https://www.linkedin.com/login',
  ...overrides,
});

const rejectionCases = [
  ['a missing request URL', REQUEST_KEY, undefined],
  ['a missing sign-in URL', SIGN_IN_KEY, undefined],
  ['an empty URL', REQUEST_KEY, ''],
  ['a non-string URL', REQUEST_KEY, 42],
  ['a malformed URL', REQUEST_KEY, 'not-a-url'],
  ['an incomplete HTTPS URL', REQUEST_KEY, 'https://'],
  ['leading whitespace', REQUEST_KEY, ' https://github.com/corsinlo'],
  ['trailing whitespace', REQUEST_KEY, 'https://github.com/corsinlo\n'],
  ['an ASCII control character', REQUEST_KEY, 'https://github.com/co\u0000rsinlo'],
  ['HTTP', REQUEST_KEY, 'http://github.com/corsinlo'],
  ['FTP', REQUEST_KEY, 'ftp://github.com/corsinlo'],
  ['a username', REQUEST_KEY, ['https://user@', 'github.com/corsinlo'].join('')],
  ['a password', REQUEST_KEY, ['https://user:password@', 'github.com/corsinlo'].join('')],
  ['an empty query delimiter', REQUEST_KEY, 'https://github.com/corsinlo?'],
  ['a query string', REQUEST_KEY, 'https://github.com/corsinlo?token=private-value'],
  ['an empty fragment delimiter', REQUEST_KEY, 'https://github.com/corsinlo#'],
  ['a fragment', REQUEST_KEY, 'https://github.com/corsinlo#private-value'],
  ['the exact .test name', REQUEST_KEY, 'https://test/pilot'],
  ['a .test domain', REQUEST_KEY, 'https://flowsolve.test/pilot'],
  ['a .test subdomain', REQUEST_KEY, 'https://api.flowsolve.test/pilot'],
  ['a trailing-dot .test domain', REQUEST_KEY, 'https://flowsolve.test./pilot'],
  ['an .invalid domain', REQUEST_KEY, 'https://flowsolve.invalid/pilot'],
  ['an .localhost domain', REQUEST_KEY, 'https://app.localhost/pilot'],
  ['an .example domain', REQUEST_KEY, 'https://flowsolve.example/pilot'],
  ['example.com', REQUEST_KEY, 'https://example.com/pilot'],
  ['an example.com subdomain', REQUEST_KEY, 'https://pilot.example.com/request'],
  ['example.net', REQUEST_KEY, 'https://example.net/pilot'],
  ['an example.net trailing-dot subdomain', REQUEST_KEY, 'https://pilot.example.net./request'],
  ['example.org', REQUEST_KEY, 'https://example.org/pilot'],
  ['an example.org subdomain', REQUEST_KEY, 'https://pilot.example.org/request'],
  ['localhost', REQUEST_KEY, 'https://localhost/pilot'],
  ['localhost with a trailing dot', REQUEST_KEY, 'https://localhost./pilot'],
  ['an IPv4 loopback literal', REQUEST_KEY, 'https://127.0.0.1/pilot'],
  ['a public IPv4 literal', REQUEST_KEY, 'https://192.0.2.1/pilot'],
  ['an abbreviated IPv4 literal', REQUEST_KEY, 'https://127.1/pilot'],
  ['an IPv6 loopback literal', REQUEST_KEY, 'https://[::1]/pilot'],
  ['a public IPv6 literal', REQUEST_KEY, 'https://[2001:db8::1]/pilot'],
  ['the Pages preview origin', REQUEST_KEY, 'https://corsinlo.github.io/other'],
  ['the trailing-dot Pages preview origin', REQUEST_KEY, 'https://corsinlo.github.io./other'],
];

for (const [description, key, value] of rejectionCases) {
  test(`rejects ${description}`, () => {
    assert.throws(() => validatePagesCtas(validEnv({ [key]: value })), /Pages CTA preflight failed/);
  });
}

const duplicateCases = [
  ['identical URLs', 'https://github.com/corsinlo', 'https://github.com/corsinlo'],
  ['implicit and explicit root slashes', 'https://github.com', 'https://github.com/'],
  ['implicit and explicit HTTPS ports', 'https://github.com/corsinlo', 'https://github.com:443/corsinlo'],
  ['plain and trailing-dot hosts', 'https://github.com/corsinlo', 'https://github.com./corsinlo'],
  ['literal and encoded path letters', 'https://github.com/pilot', 'https://github.com/%70ilot'],
  ['uppercase and lowercase percent triplets', 'https://github.com/%7Epilot', 'https://github.com/%7epilot'],
  ['literal and encoded unreserved punctuation', 'https://github.com/pilot_user', 'https://github.com/pilot%5Fuser'],
];

for (const [description, requestUrl, signInUrl] of duplicateCases) {
  test(`rejects duplicate destinations with ${description}`, () => {
    assert.throws(
      () => validatePagesCtas(validEnv({ [REQUEST_KEY]: requestUrl, [SIGN_IN_KEY]: signInUrl })),
      /Pages CTA preflight failed/,
    );
  });
}

test('accepts two distinct non-reserved HTTPS destinations and returns normalized URLs', () => {
  assert.deepEqual(validatePagesCtas(validEnv()), {
    requestPilot: 'https://github.com/corsinlo/flowsolve-site/issues/new',
    pilotSignIn: 'https://www.linkedin.com/login',
  });
});

test('accepts an explicit CTA-less preview release', () => {
  assert.deepEqual(validatePagesRelease({ [PREVIEW_KEY]: 'true' }), { mode: 'preview' });
});

test('rejects CTA destinations in preview mode', () => {
  assert.throws(() => validatePagesRelease({
    [PREVIEW_KEY]: 'true',
    [REQUEST_KEY]: 'https://github.com/example/request',
  }), /must be absent/);
});

test('rejects sign-in destinations in preview mode', () => {
  assert.throws(() => validatePagesRelease({
    [PREVIEW_KEY]: 'true',
    [SIGN_IN_KEY]: 'https://www.linkedin.com/login',
  }), /must be absent/);
});

test('rejects non-canonical preview mode values', () => {
  assert.throws(() => validatePagesRelease({ [PREVIEW_KEY]: 'yes' }), /must be exactly true/);
});

test('keeps an encoded reserved delimiter distinct and preserves returned URLs', () => {
  const requestPilot = 'https://github.com/pilot%2Frequest';
  const pilotSignIn = 'https://github.com/pilot/request';

  assert.deepEqual(
    validatePagesCtas(validEnv({ [REQUEST_KEY]: requestPilot, [SIGN_IN_KEY]: pilotSignIn })),
    { requestPilot, pilotSignIn },
  );
});

test('reads only the two public CTA environment keys', () => {
  const reads = [];
  const source = validEnv();
  const guardedEnv = new Proxy(source, {
    get(target, property) {
      assert.ok(
        property === REQUEST_KEY || property === SIGN_IN_KEY,
        `unexpected environment read: ${String(property)}`,
      );
      reads.push(property);
      return target[property];
    },
  });

  validatePagesCtas(guardedEnv);

  assert.deepEqual(reads.sort(), [REQUEST_KEY, SIGN_IN_KEY].sort());
});

test('CLI failure output redacts credentials, query data, and native parser details', () => {
  const secretMarkers = ['private-user', 'private-password', 'private-token'];
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
    env: {
      [REQUEST_KEY]: ['https://private-user:private-password@', 'github.com/corsinlo?token=private-token'].join(''),
      [SIGN_IN_KEY]: 'https://www.linkedin.com/login',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pages CTA preflight failed/);
  for (const marker of secretMarkers) {
    assert.doesNotMatch(result.stderr, new RegExp(marker));
  }
  assert.doesNotMatch(result.stderr, /Invalid URL|ERR_INVALID_URL|input/i);
  assert.equal(result.stdout, '');
});

test('CLI success prints the stable preflight confirmation', () => {
  const liveResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
    env: validEnv(),
  });

  assert.equal(liveResult.status, 0, liveResult.stderr);
  assert.equal(liveResult.stderr, '');
  assert.equal(liveResult.stdout, 'Pages CTA preflight passed\n');

  const previewResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
    env: { [PREVIEW_KEY]: 'true' },
  });

  assert.equal(previewResult.status, 0, previewResult.stderr);
  assert.equal(previewResult.stderr, '');
  assert.equal(previewResult.stdout, 'Pages preview preflight passed\n');
});
