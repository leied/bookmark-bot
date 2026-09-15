# Bookmark Bot

A serverless Discord bot running on Cloudflare Workers, written in TypeScript.
Right click any message → **Apps** → **Bookmark**, and the bot DMs you a copy
with buttons to recolour, delete, or jump back to the original.

This is a TypeScript port of the original Rust/WebAssembly implementation
(still on the `master` branch). It has no runtime dependencies: interaction
signatures are verified with the runtime's built-in Ed25519 WebCrypto support,
and Discord is called with plain `fetch`.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Squidtoon99/bookmark-bot)

Or from a clone:

```bash
npm install
npx wrangler login

# Create the Discord app at https://discord.com/developers/applications,
# then paste each value when prompted:
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID

npm run deploy
```

Then finish the Discord side:

1. Set **Interactions Endpoint URL** on your application's General Information
   page to `https://bookmark-bot.<your-subdomain>.workers.dev`. Discord verifies
   it by sending a signed PING, which the worker answers with a PONG.
2. Register the commands with Discord — needed after the first deploy and after
   any change to a command's name, description, or options:

   ```bash
   curl -X POST https://bookmark-bot.<your-subdomain>.workers.dev/register
   ```

3. Invite the bot using the OAuth2 URL from the developer portal with the
   `bot` and `applications.commands` scopes.

Global commands can take up to an hour to appear in every server.

### Locking down `/register`

`/register` is public by default, matching the original deployment. To require
a token, set a secret and pass it as a bearer token:

```bash
npx wrangler secret put REGISTER_SECRET
curl -X POST -H "Authorization: Bearer <secret>" https://<worker>/register
```

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in your Discord credentials
npm run dev                      # http://localhost:8787
```

Discord must reach your machine to deliver interactions, so tunnel the local
server with something like `ngrok http 8787` and point the Interactions
Endpoint URL at the tunnel while developing.

```bash
npm test         # Vitest, running inside workerd
npm run typecheck
```

## Continuous deployment

`.github/workflows/deploy.yml` typechecks, tests, and deploys on every push to
the `typescript` branch. Add a `CLOUDFLARE_API_TOKEN` repository secret with the
**Edit Cloudflare Workers** permission to enable it.

## Project layout

```
src/
  index.ts        fetch handler: POST / (interactions) and POST /register
  bot.ts          signature verification, then dispatch
  verify.ts       Ed25519 verification via WebCrypto
  interaction.ts  routes an interaction to a command or component
  command.ts      Command interface + CommandInput helpers
  component.ts    Component interface + ComponentInput helpers
  commands/       help, bookmark  (registry in commands/index.ts)
  components/     color, delete   (registry in components/index.ts)
  discord.ts      minimal Discord REST client
  embed.ts        embed size limits and validation
  shared.ts       the button row attached to every bookmark
  env.ts          typed bindings
```

## Adding a command

1. Create `src/commands/ping.ts`:

   ```ts
   import { MessageFlags, type APIInteractionResponseCallbackData } from "discord-api-types/v10";
   import type { Command, CommandInput } from "../command.js";

   export const ping: Command = {
     name: "ping",
     description: "Send a ping",

     async respond(input: CommandInput): Promise<APIInteractionResponseCallbackData> {
       return { content: "Pong", flags: MessageFlags.Ephemeral };
     },
   };
   ```

2. Add it to the `commands` array in `src/commands/index.ts`.
3. `npm run deploy`, then re-run the `/register` curl above.

Commands receive a `CommandInput` with the interaction data plus helpers:
`input.getOption(name)`, `input.uid()`, `input.rest()` for authenticated
Discord API calls, and `input.kvGet` / `input.kvPut` for KV (bind a namespace
in `wrangler.jsonc` first).

To add a button or select menu, implement `Component` in `src/components/` and
add it to the registry there. Components match on `custom_id` *prefix*, so they
can carry state after their name — see `color`, which encodes the chosen colour
and the jump URL.

## Credits

Based on [stateless-discord-bot](https://github.com/siketyan/stateless-discord-bot).

## License

MIT — see [LICENSE.md](LICENSE.md).
