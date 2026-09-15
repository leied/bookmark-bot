/**
 * Registers this bot's commands with Discord.
 *
 * Run with `npm run register`. Credentials come from .env or .dev.vars (or the
 * real environment, for CI), so registration never needs a public endpoint on
 * the Worker — it is a deploy-time task, not a runtime one.
 *
 * Pass --dry-run to print the payload without sending it.
 */
import { toRegisteredCommand } from "../src/command.js";
import { commands } from "../src/commands/index.js";

const ENV_FILES = [".env", ".dev.vars"];
const dryRun = process.argv.includes("--dry-run");

for (const file of ENV_FILES) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Optional: the value may already be in the environment.
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Add it to .env or .dev.vars, or set it in your shell.\n` +
        `Both files are gitignored; see .dev.vars.example.`,
    );
    process.exit(1);
  }
  return value;
}

const payload = commands.map(toRegisteredCommand);

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\n--dry-run: ${payload.length} commands not sent.`);
  process.exit(0);
}

const token = required("DISCORD_TOKEN");
const applicationId = required("DISCORD_APPLICATION_ID");

console.log(`Registering ${payload.length} commands for application ${applicationId}:`);
for (const command of payload) {
  console.log(`  - ${command.name}  (contexts ${command.contexts.join(",")})`);
}

const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await response.text();

if (!response.ok) {
  console.error(`\nDiscord rejected the registration (${response.status}):\n${body}`);
  process.exit(1);
}

console.log(`\nRegistered. Global commands can take up to an hour to propagate.`);
