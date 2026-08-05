import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const steps = [
  {
    label: 'compile static site',
    command: process.execPath,
    args: [fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), 'build'],
  },
  {
    label: 'scan static output with source-map provenance',
    command: process.execPath,
    args: [fileURLToPath(new URL('./check-static-output.mjs', import.meta.url))],
  },
  {
    label: 'remove deployable source maps',
    command: process.execPath,
    args: [fileURLToPath(new URL('./finalize-build.mjs', import.meta.url))],
  },
];

function executeStep({ label, command, args }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      reject(new Error(`Could not start build step "${label}": ${error.message}`, { cause: error }));
    });
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(new Error(
          `Build step "${label}" failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        ));
      }
    });
  });
}

export async function runBuildPipeline(runStep = executeStep) {
  for (const step of steps) await runStep(step);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runBuildPipeline();
}
