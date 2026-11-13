import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" }
    })
  ],
  test: {
    include: ["src/match-room/durable-object-sqlite.integration.do.mjs"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
