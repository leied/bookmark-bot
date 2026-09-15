import { handleInteraction } from "./bot.js";
import type { Env } from "./env.js";
import { messageOf, statusOf } from "./errors.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The only public surface: Discord's signed interaction webhook. Command
    // registration is done from a developer's machine with `npm run register`,
    // so there is no unauthenticated endpoint that can spend the bot's token.
    if (request.method === "POST" && url.pathname === "/") {
      try {
        const response = await handleInteraction(request, env, ctx);
        return Response.json(response);
      } catch (error) {
        console.log(`Error response: ${messageOf(error)}`);
        return new Response(messageOf(error), { status: statusOf(error) });
      }
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
