import {
  InteractionResponseType,
  InteractionType,
  type APIInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";

import { CommandInput } from "./command.js";
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

      const data = await command.respond(new CommandInput(interaction, env, ctx));
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
