import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { mkdir, rename, rm } from 'node:fs/promises';
import { SITE } from './src/config/site';

const emittedClientManifest = '_astro/manifest-client-assets.json';
const privateClientManifest = new URL('./.astro/manifest-client-assets.json', import.meta.url);

export default defineConfig({
  site: SITE.origin,
  base: SITE.base,
  output: SITE.output,
  trailingSlash: SITE.trailingSlash,
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "media-src 'none'",
        "worker-src 'none'",
        "manifest-src 'self'",
        "form-action 'none'",
        "base-uri 'none'",
      ],
    },
  },
  integrations: [
    react(),
    {
      name: 'flowsolve-client-asset-manifest',
      hooks: {
        'astro:build:start': async () => {
          await rm(privateClientManifest, { force: true });
        },
        'astro:build:done': async ({ dir }) => {
          await mkdir(new URL('./', privateClientManifest), { recursive: true });
          await rename(new URL(emittedClientManifest, dir), privateClientManifest);
        },
      },
    },
  ],
  vite: {
    plugins: [{
      name: 'flowsolve:vite-client-asset-manifest',
      applyToEnvironment(environment) {
        return environment.name === 'client';
      },
      configEnvironment(name) {
        if (name === 'client') {
          return {
            build: { manifest: emittedClientManifest },
          };
        }
        return undefined;
      },
    }],
    build: {
      sourcemap: 'hidden',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{
              name: 'scene-dependencies',
              test: /[\\/]node_modules[\\/]/,
            }],
          },
        },
      },
    },
  },
});
