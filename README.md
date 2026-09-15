# Bookmark Bot

A serverless Discord bot running on Cloudflare Workers, written in TypeScript.
Right click any message → **Apps** → **Bookmark**, and the bot DMs you a copy
with buttons to recolour, delete, or jump back to the original.

This is a TypeScript port of the original Rust/WebAssembly implementation,
which is preserved as the first commit in this repository's history. It has
no runtime dependencies: interaction
signatures are verified with the runtime's built-in Ed25519 WebCrypto support,
and Discord is called with plain `fetch`.

## Deploy with Cloudflare Workers Builds

Workers Builds watches the repo and deploys on every push. Set it up once:

1. **Create the Worker.** Workers Builds deploys an existing Worker, so run one
   deploy from your machine first:

   ```bash
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

   This creates `bookmark-bot` and prints its
   `https://bookmark-bot.<your-subdomain>.workers.dev` URL.

2. **Add the runtime secrets.** In the dashboard, go to **Workers & Pages →
   bookmark-bot → Settings → Variables & Secrets** and add three **Secret**
   entries from your app at
   [discord.com/developers/applications](https://discord.com/developers/applications):

   | Name | Where to find it |
   | --- | --- |
   | `DISCORD_TOKEN` | Bot → Reset Token |
   | `DISCORD_PUBLIC_KEY` | General Information → Public Key |
   | `DISCORD_APPLICATION_ID` | General Information → Application ID |

   These must be **Variables & Secrets**, not build variables. Build variables
   are not available at runtime, so setting them there leaves the bot unable to
   verify a single interaction.

3. **Connect the repo.** **Settings → Builds → Connect**, pick this repository,
   and set:

   | Setting | Value |
   | --- | --- |
   | Branch | `main` |
   | Root directory | `/` |
   | Build command | *(leave empty — there is no build step)* |
   | Deploy command | `npx wrangler deploy` |

   Dependencies are installed automatically from `package-lock.json`. Pushes to
   any *other* branch build a preview version with `npx wrangler versions
   upload` instead of deploying.

4. **Point Discord at the Worker.** On the application's General Information
   page, set **Interactions Endpoint URL** to
   `https://bookmark-bot.<your-subdomain>.workers.dev`. Discord verifies it by
   sending a signed PING, which the Worker answers with a PONG. Saving fails if
   the secrets from step 2 are missing or wrong.

5. **Register the commands.** Needed after the first deploy, and after any
   change to a command's name, description, or options:

   ```bash
   curl -X POST https://bookmark-bot.<your-subdomain>.workers.dev/register
   ```

6. **Invite the bot** with the OAuth2 URL from the developer portal, using the
   `bot` and `applications.commands` scopes.

From then on, `git push` deploys. Global commands can take up to an hour to
appear in every server, so step 5 is not instant.

### Deploying by hand

```bash
npm run deploy
```

Secrets can also be set from the CLI with `npx wrangler secret put DISCORD_TOKEN`
(and the other two) instead of via the dashboard.

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

## Continuous integration

Deploys come from Workers Builds, so `.github/workflows/ci.yml` only typechecks
and tests on pushes and pull requests. It holds no Cloudflare credentials, and
its actions are pinned to commit SHAs — bump them with Dependabot or Renovate.

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

Discord discards any interaction that is not acknowledged within **3 seconds**.
A command that calls the Discord API (or anything else over the network) should
set `deferred: true`, as `bookmark` does:

```ts
export const slow: Command = {
  name: "slow",
  description: "Does some real work",
  deferred: true,
  async respond(input) {
    /* ... */
  },
};
```

The Worker then replies immediately with a "thinking..." placeholder, runs
`respond` in the background via `waitUntil`, and edits the placeholder with the
result — including a generic error message if `respond` throws, so the user is
never left waiting forever. Ephemerality is decided by the deferral, so `flags`
in the returned data is ignored on a deferred command. Leave `deferred` unset
for commands that only assemble a reply, like `help`.

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
