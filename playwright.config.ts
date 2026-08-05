import { chromium, defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321/flowsolve-site/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /fallbacks\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromium.executablePath(),
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'javascript-disabled',
      testMatch: /fallbacks\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
    },
    {
      name: 'reduced-motion',
      testMatch: /fallbacks\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
    {
      name: 'get-context-null',
      testMatch: /fallbacks\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webgl-context-lost',
      testMatch: /fallbacks\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromium.executablePath(),
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
});
