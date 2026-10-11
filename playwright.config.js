import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "trace-e2e-"));
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
    env: {
      PORT: "3100",
      TRACE_ORIGIN: "http://127.0.0.1:3100",
      TRACE_PASSWORD: "e2e-workspace-password",
      TRACE_DB: join(directory, "trace.db"),
    },
  },
});
