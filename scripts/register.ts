/**
 * Registers this bot's commands with Discord.
 *
 * Runs automatically after `pnpm run deploy`, or on its own with
 * `pnpm run register`. Credentials come from .env or .dev.vars (or the real
 * environment, for CI), so registration never needs a public endpoint on the
 * Worker — it is a deploy-time task, not a runtime one.
 *
 *   --dry-run  print the payload without contacting Discord
 *   --force    overwrite even when Discord already holds this registration
 */
import { registrationMatches, toRegisteredCommand, type RegisteredCommand } from "../src/command.js";
import { commands } from "../src/commands/index.js";

const ENV_FILES = [".env", ".dev.vars"];
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

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
const endpoint = `https://discord.com/api/v10/applications/${applicationId}/commands`;
const auth = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };

// Bulk overwrite is rate limited, and this runs on every deploy, so skip the
// write when Discord already holds exactly this registration.
if (!force) {
  const current = await fetch(endpoint, { headers: auth });

  if (current.ok) {
    const existing = (await current.json()) as Partial<RegisteredCommand>[];
    if (registrationMatches(payload, existing)) {
      console.log(`Commands already up to date (${payload.length}); nothing to register.`);
      process.exit(0);
    }
  } else {
    // Not fatal: fall through and let the overwrite report the real problem.
    console.warn(`Could not read current commands (${current.status}); registering anyway.`);
  }
}

console.log(`Registering ${payload.length} commands for application ${applicationId}:`);
for (const command of payload) {
  console.log(`  - ${command.name}  (contexts ${command.contexts.join(",")})`);
}

const response = await fetch(endpoint, {
  method: "PUT",
  headers: auth,
  body: JSON.stringify(payload),
});

const body = await response.text();

if (!response.ok) {
  console.error(`\nDiscord rejected the registration (${response.status}):\n${body}`);
  process.exit(1);
}

console.log(`\nRegistered. Global commands can take up to an hour to propagate.`);
