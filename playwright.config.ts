import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Testai paleidžia programą bandomajame režime (duomenys atmintyje, netikras AI) – tikri duomenys neliečiami.
const localChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5174',
    ...devices['Pixel 7'],
    locale: 'lt-LT',
    timezoneId: 'Europe/Vilnius',
    launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : {},
  },
  webServer: {
    command: 'npx vite --mode mock --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
