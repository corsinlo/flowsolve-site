const { chromium } = require('@playwright/test');

module.exports = {
  ci: {
    collect: {
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4321',
      startServerReadyPattern: 'Local',
      numberOfRuns: 3,
      url: [
        'http://127.0.0.1:4321/flowsolve-site/en/',
        'http://127.0.0.1:4321/flowsolve-site/it/',
        'http://127.0.0.1:4321/flowsolve-site/nl/',
      ],
      settings: {
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        ...(process.env.GITHUB_ACTIONS === 'true' ? { chromeFlags: '--no-sandbox' } : {}),
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', {
          aggregationMethod: 'median',
          maxNumericValue: 2500,
        }],
        'cumulative-layout-shift': ['error', {
          aggregationMethod: 'median',
          maxNumericValue: 0.1,
        }],
      },
    },
    upload:
      process.env.PAGES_PREVIEW_APPROVED === 'true'
        ? { target: 'temporary-public-storage' }
        : { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
