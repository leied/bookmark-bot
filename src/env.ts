import { EnvironmentVariableNotFound } from "./errors.js";

/**
 * Bindings available to the worker. Declared on `Cloudflare.Env` so that both
 * the worker and the Vitest `cloudflare:test` environment see the same shape.
 *
 * All three Discord values are secrets: set them with
 * `wrangler secret put <NAME>` (or in `.dev.vars` locally), never in
 * `wrangler.jsonc`.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** Bot token, from the Discord application's Bot page. */
      DISCORD_TOKEN: string;
      /** Hex-encoded Ed25519 public key used to verify interaction signatures. */
      DISCORD_PUBLIC_KEY: string;
      /** Application (client) id. */
      DISCORD_APPLICATION_ID: string;
      /** Optional shared secret required by POST /register. */
      REGISTER_SECRET?: string;
    }
  }
}

export type Env = Cloudflare.Env;

/** Reads a variable from the environment, failing loudly when it is unset. */
export function requireVar(env: Env, key: keyof Env): string {
  const value = env[key];
  if (!value) throw new EnvironmentVariableNotFound(String(key));
  return value;
}
