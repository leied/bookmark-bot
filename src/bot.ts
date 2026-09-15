import type { APIInteraction, APIInteractionResponse } from "discord-api-types/v10";

import type { Env } from "./env.js";
import { requireVar } from "./env.js";
import { HeaderNotFound, InvalidPayload } from "./errors.js";
import { perform } from "./interaction.js";
import { verifySignature } from "./verify.js";

function header(request: Request, key: string): string {
  const value = request.headers.get(key);
  if (!value) throw new HeaderNotFound(key);
  return value;
}

/**
 * Verifies Discord's signature over the raw body, then dispatches the
 * interaction. Discord rejects an endpoint that does not 401 unsigned
 * requests, so verification always runs before parsing.
 */
export async function handleInteraction(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
  const publicKey = requireVar(env, "DISCORD_PUBLIC_KEY");
  const signature = header(request, "x-signature-ed25519");
  const timestamp = header(request, "x-signature-timestamp");

  const body = await request.text();
  await verifySignature(publicKey, signature, timestamp, body);

  let interaction: APIInteraction;
  try {
    interaction = JSON.parse(body) as APIInteraction;
  } catch {
    throw new InvalidPayload("body is not valid JSON");
  }

  return perform(interaction, env, ctx);
}
