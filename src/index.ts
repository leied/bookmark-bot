import { handleInteraction } from "./bot.js";
import type { Env } from "./env.js";
import { messageOf, statusOf } from "./errors.js";
import { registerAuthorized, registerCommands } from "./register.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/") {
      try {
        const response = await handleInteraction(request, env, ctx);
        return Response.json(response);
      } catch (error) {
        console.log(`Error response: ${messageOf(error)}`);
        return new Response(messageOf(error), { status: statusOf(error) });
      }
    }

    if (request.method === "POST" && url.pathname === "/register") {
      if (!registerAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      return registerCommands(env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
