import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4176', viewport: { width: 1440, height: 1000 } },
  outputDir: join(tmpdir(), 'gnftato-browser-results'),
  webServer: {
    command: 'node e2e/serve-build.js',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false
  }
});
