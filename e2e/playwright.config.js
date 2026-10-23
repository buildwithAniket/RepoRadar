const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  // Software WebGL starves when spec files run in parallel pages; keep one worker.
  workers: 1,
  use: {
    baseURL: 'http://localhost:8123',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'python3 -m http.server 8123 --directory ../ui',
    url: 'http://localhost:8123/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
