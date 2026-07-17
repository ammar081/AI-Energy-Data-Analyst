import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", grepInvert: /mobile fleet/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", grep: /mobile fleet/, use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 30_000
  }
});
