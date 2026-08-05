import { isIP } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PREVIEW_KEY = 'PUBLIC_PREVIEW_MODE';
const REQUEST_KEY = 'PUBLIC_PILOT_REQUEST_URL';
const SIGN_IN_KEY = 'PUBLIC_PILOT_SIGN_IN_URL';
const PAGES_HOST = 'corsinlo.github.io';
const RESERVED_HOSTS = [
  'test',
  'invalid',
  'localhost',
  'example',
  'example.com',
  'example.net',
  'example.org',
];

class PagesCtaValidationError extends Error {}

function fail(reason) {
  throw new PagesCtaValidationError(`Pages CTA preflight failed: ${reason}`);
}

function stripIpv6Brackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function isReservedHostname(hostname) {
  return RESERVED_HOSTS.some(
    (reserved) => hostname === reserved || hostname.endsWith(`.${reserved}`),
  );
}

function destinationComparisonKey(destination) {
  return destination.replace(/%([0-9a-f]{2})/giu, (triplet, hexadecimal) => {
    const character = String.fromCharCode(Number.parseInt(hexadecimal, 16));
    return /^[a-z0-9\-._~]$/iu.test(character)
      ? character
      : triplet.toUpperCase();
  });
}

function parseDestination(rawValue, key) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    fail(`${key} is required`);
  }

  if (rawValue !== rawValue.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(rawValue)) {
    fail(`${key} contains forbidden whitespace or control characters`);
  }

  if (rawValue.includes('?') || rawValue.includes('#')) {
    fail(`${key} must not contain a query or fragment delimiter`);
  }

  let destination;
  try {
    destination = new URL(rawValue);
  } catch {
    fail(`${key} is not a valid absolute URL`);
  }

  if (destination.protocol !== 'https:') {
    fail(`${key} must use HTTPS`);
  }

  if (destination.username || destination.password) {
    fail(`${key} must not contain credentials`);
  }

  const hostname = destination.hostname.toLowerCase().replace(/\.+$/u, '');
  const ipCandidate = stripIpv6Brackets(hostname);

  if (!hostname) {
    fail(`${key} must contain a hostname`);
  }

  if (isIP(ipCandidate) !== 0) {
    fail(`${key} must not use an IP-literal hostname`);
  }

  if (isReservedHostname(hostname)) {
    fail(`${key} must use a non-reserved hostname`);
  }

  if (hostname === PAGES_HOST) {
    fail(`${key} must not point back to the Pages preview`);
  }

  destination.hostname = hostname;
  return destination.href;
}

export function validatePagesCtas(env) {
  const requestPilot = parseDestination(env[REQUEST_KEY], REQUEST_KEY);
  const pilotSignIn = parseDestination(env[SIGN_IN_KEY], SIGN_IN_KEY);

  if (destinationComparisonKey(requestPilot) === destinationComparisonKey(pilotSignIn)) {
    fail('the request and sign-in destinations must be distinct');
  }

  return { requestPilot, pilotSignIn };
}

export function validatePagesRelease(env) {
  if (env[PREVIEW_KEY] === 'true') {
    if (env[REQUEST_KEY] !== undefined || env[SIGN_IN_KEY] !== undefined) {
      fail(`${REQUEST_KEY} and ${SIGN_IN_KEY} must be absent in preview mode`);
    }
    return { mode: 'preview' };
  }

  if (env[PREVIEW_KEY]) {
    fail(`${PREVIEW_KEY} must be exactly true when set`);
  }

  return { mode: 'live', ...validatePagesCtas(env) };
}

function isExecutedDirectly() {
  return Boolean(
    process.argv[1]
      && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
  );
}

if (isExecutedDirectly()) {
  try {
    const release = validatePagesRelease(process.env);
    console.log(release.mode === 'preview'
      ? 'Pages preview preflight passed'
      : 'Pages CTA preflight passed');
  } catch (error) {
    const message = error instanceof PagesCtaValidationError
      ? error.message
      : 'Pages CTA preflight failed: validation could not be completed';
    console.error(message);
    process.exitCode = 1;
  }
}
