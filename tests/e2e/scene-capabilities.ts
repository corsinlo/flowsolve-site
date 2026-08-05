import type { Page } from '@playwright/test';

export async function installHighCapabilitySceneProfile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      deviceMemory: { configurable: true, value: 8 },
      hardwareConcurrency: { configurable: true, value: 8 },
    });
  });
}

export async function installLowPowerSceneProfile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      deviceMemory: { configurable: true, value: 8 },
      hardwareConcurrency: { configurable: true, value: 2 },
    });
  });
}
