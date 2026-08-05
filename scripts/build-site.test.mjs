import assert from 'node:assert/strict';
import test from 'node:test';

import { runBuildPipeline } from './build-site.mjs';

test('runs compilation, provenance scanning, and artifact finalization in order', async () => {
  const calls = [];

  await runBuildPipeline(async ({ label }) => {
    calls.push(label);
  });

  assert.deepEqual(calls, [
    'compile static site',
    'scan static output with source-map provenance',
    'remove deployable source maps',
  ]);
});

test('does not finalize an artifact when provenance scanning fails', async () => {
  const calls = [];
  const scanError = new Error('unsafe static output');

  await assert.rejects(
    () => runBuildPipeline(async ({ label }) => {
      calls.push(label);
      if (label === 'scan static output with source-map provenance') throw scanError;
    }),
    scanError,
  );

  assert.deepEqual(calls, [
    'compile static site',
    'scan static output with source-map provenance',
  ]);
});

test('does not scan or finalize a failed compilation', async () => {
  const calls = [];
  const compileError = new Error('compilation failed');

  await assert.rejects(
    () => runBuildPipeline(async ({ label }) => {
      calls.push(label);
      throw compileError;
    }),
    compileError,
  );

  assert.deepEqual(calls, ['compile static site']);
});
