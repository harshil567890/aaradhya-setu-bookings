import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 35_000,
  expect: { timeout: 7_000 },
  reporter: "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
