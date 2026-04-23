import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, "../..");
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "pnpm --filter @ept/api-gateway dev",
      cwd: repoRoot,
      env: {
        ...process.env,
        POLYMARKET_USE_FIXTURES: "true"
      } as Record<string, string>,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      url: "http://127.0.0.1:4000/healthz"
    },
    {
      command: "pnpm --filter @ept/web dev",
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4000"
      } as Record<string, string>,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      url: "http://127.0.0.1:3000"
    }
  ]
});
