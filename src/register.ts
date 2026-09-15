import { commands } from "./commands/index.js";
import { toRegisteredCommand } from "./command.js";
import { DiscordRest } from "./discord.js";
import type { Env } from "./env.js";
import { requireVar } from "./env.js";

/**
 * Bulk-overwrites the application's global commands with whatever is in
 * `src/commands/index.ts`. Run after every deploy that adds or changes a
 * command; global commands can take up to an hour to propagate.
 */
export async function registerCommands(env: Env): Promise<Response> {
  const applicationId = requireVar(env, "DISCORD_APPLICATION_ID");
  const rest = new DiscordRest(requireVar(env, "DISCORD_TOKEN"));

  const payload = commands.map(toRegisteredCommand);
  const response = await rest.put(`/applications/${applicationId}/commands`, payload);
  const text = await response.text();

  console.log(`[REGISTER] ${response.status}: ${text}`);
  return new Response(text, {
    status: response.ok ? 200 : 502,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * When REGISTER_SECRET is set, `/register` requires it as a bearer token. It is
 * optional so the plain `curl -X POST .../register` flow keeps working, but
 * setting it stops anyone else from triggering re-registration.
 */
export function registerAuthorized(request: Request, env: Env): boolean {
  if (!env.REGISTER_SECRET) return true;
  return request.headers.get("Authorization") === `Bearer ${env.REGISTER_SECRET}`;
}
