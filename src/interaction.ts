import {
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandInteraction,
  type APIInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";

import { CommandInput, type Command } from "./command.js";
import { editOriginalInteractionResponse } from "./discord.js";
import { ComponentInput } from "./component.js";
import { findCommand } from "./commands/index.js";
import { findComponent } from "./components/index.js";
import { InvalidPayload, UnknownCommand } from "./errors.js";
import type { Env } from "./env.js";

/** Routes a verified interaction to the command or component that handles it. */
export async function perform(
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
  switch (interaction.type) {
    case InteractionType.Ping:
      return { type: InteractionResponseType.Pong };

    case InteractionType.ApplicationCommand: {
      const command = findCommand(interaction.data.name);
      if (!command) throw new UnknownCommand(interaction.data.name);

      const input = new CommandInput(interaction, env, ctx);

      if (command.deferred) {
        // Acknowledge now and keep the isolate alive for the real work, so a
        // slow Discord API call cannot blow the 3 second interaction deadline.
        ctx.waitUntil(completeDeferred(command, input, interaction, env));
        return {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        };
      }

      const data = await command.respond(input);
      return { type: InteractionResponseType.ChannelMessageWithSource, data };
    }

    case InteractionType.ApplicationCommandAutocomplete: {
      const command = findCommand(interaction.data.name);
      if (!command) throw new UnknownCommand(interaction.data.name);

      const data = await command.autocomplete?.(new CommandInput(interaction, env, ctx));
      return {
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: data ?? { choices: [] },
      };
    }

    case InteractionType.MessageComponent: {
      const component = findComponent(interaction.data.custom_id);
      if (!component) throw new UnknownCommand(interaction.data.custom_id);

      return component.respond(new ComponentInput(interaction, env, ctx));
    }

    default:
      throw new InvalidPayload("Not implemented");
  }
}

/**
 * Runs a deferred command and edits its placeholder with the result. Any
 * failure is reported in the placeholder too — otherwise the user is left
 * staring at "thinking..." forever.
 */
async function completeDeferred(
  command: Command,
  input: CommandInput,
  interaction: APIApplicationCommandInteraction,
  env: Env,
): Promise<void> {
  const applicationId = interaction.application_id || env.DISCORD_APPLICATION_ID;

  let data: Record<string, unknown>;
  try {
    data = (await command.respond(input)) as Record<string, unknown>;
  } catch (error) {
    console.log(`Deferred command '${command.name}' failed: ${error}`);
    data = { content: "Something went wrong running that command." };
  }

  try {
    const response = await editOriginalInteractionResponse(
      applicationId,
      interaction.token,
      data,
    );
    if (!response.ok) {
      console.log(`Follow-up edit failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.log(`Follow-up edit threw: ${error}`);
  }
}
