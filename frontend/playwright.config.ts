import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const API_PORT = 8001;
const WEB_PORT = 3001;
const dbUrl = `postgresql+psycopg://${os.userInfo().username}@localhost:5432/edurag_e2e`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Real database and embeddings; the LLM is replaced by a deterministic script (no Groq key needed)
      command: "../backend/.venv/bin/python -m app.tests.e2e_server",
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: dbUrl,
        SECRET_KEY: "e2e-secret-key",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        UPLOAD_DIR: path.join(os.tmpdir(), "edurag-e2e-uploads"),
      },
    },
    {
      // Production build (no dev overlay), in its own folder so a running dev server is untouched
      command: `npm run build && npm run start -- -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_API_BASE_URL: `http://localhost:${API_PORT}/api/v1`,
      },
    },
  ],
});
