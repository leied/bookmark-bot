import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  // Runs the tests inside workerd, against the real wrangler config, so
  // Ed25519 verification and the fetch handler are exercised as deployed.
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    // discord-api-types' enum entrypoints are not resolvable by workerd
    // directly; pre-bundling them keeps the runtime imports working.
    // https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/
    deps: {
      optimizer: {
        ssr: { enabled: true, include: ["discord-api-types/v10"] },
      },
    },
  },
});
