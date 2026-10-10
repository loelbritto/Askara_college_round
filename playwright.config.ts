import { defineConfig, devices } from "@playwright/test";
const baseURL=process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{name: "chromium", use: {...devices["Desktop Chrome"], channel: process.platform === "win32" && !process.env.CI ? "msedge" : undefined}}],
  webServer: { command: process.env.CI ? "npm run start" : "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
