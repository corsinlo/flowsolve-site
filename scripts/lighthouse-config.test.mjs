import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../lighthouserc.cjs');

function loadConfig(githubActions) {
  const previous = process.env.GITHUB_ACTIONS;
  if (githubActions === undefined) delete process.env.GITHUB_ACTIONS;
  else process.env.GITHUB_ACTIONS = githubActions;
  delete require.cache[configPath];

  try {
    return require(configPath);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
    delete require.cache[configPath];
  }
}

test('disables the Chromium sandbox only for the GitHub Actions Lighthouse launch', () => {
  const githubConfig = loadConfig('true');
  const localConfig = loadConfig(undefined);

  assert.match(githubConfig.ci.collect.settings.chromeFlags, /(?:^|\s)--no-sandbox(?:\s|$)/);
  assert.equal(localConfig.ci.collect.settings.chromeFlags, undefined);
});
