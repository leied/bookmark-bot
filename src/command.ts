import {
  ApplicationCommandType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIApplicationCommandInteractionDataOption,
  type APIApplicationCommandOption,
  type APICommandAutocompleteInteractionResponseCallbackData,
  type APIInteractionDataResolved,
  type APIMessage,
  type APIInteractionGuildMember,
  type APIInteractionResponseCallbackData,
  type APIUser,
  type Snowflake,
} from "discord-api-types/v10";

/**
 * Resolved entities attached to the interaction. Message context-menu commands
 * additionally receive `messages`, which the base type does not declare.
 */
export type ResolvedData = APIInteractionDataResolved & {
  messages?: Record<Snowflake, APIMessage>;
};

import type { Env } from "./env.js";
import { DiscordRest } from "./discord.js";
import { InteractionFailed } from "./errors.js";
import { defaultComponents } from "./shared.js";

/**
 * Everything a command handler is given: the interaction payload plus the
 * worker environment, with convenience accessors for options, KV and the
 * Discord REST API.
 */
export class CommandInput {
  readonly id: Snowflake;
  readonly name: string;
  readonly type: ApplicationCommandType;
  readonly options: APIApplicationCommandInteractionDataOption[];
  readonly resolved?: ResolvedData;
  readonly targetId?: Snowflake;
  readonly guildId?: Snowflake;
  readonly channelId?: Snowflake;
  readonly user?: APIUser;
  readonly member?: APIInteractionGuildMember;

  constructor(
    interaction: APIApplicationCommandInteraction | APIApplicationCommandAutocompleteInteraction,
    readonly env: Env,
    readonly ctx: ExecutionContext,
  ) {
    const data = interaction.data;
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.options = "options" in data && data.options ? [...data.options] : [];
    this.resolved = "resolved" in data ? (data.resolved as ResolvedData) : undefined;
    this.targetId = "target_id" in data ? data.target_id : undefined;
    this.guildId = interaction.guild_id;
    this.channelId = interaction.channel?.id;
    this.user = interaction.user;
    this.member = interaction.member;
  }

  /** Looks up a command option by name. */
  getOption(name: string): APIApplicationCommandInteractionDataOption | undefined {
    return this.options.find((option) => option.name === name);
  }

  /** The invoking user's id, whether the command came from a guild or a DM. */
  uid(): Snowflake {
    const id = this.member?.user?.id ?? this.user?.id;
    if (!id) throw new InteractionFailed("No member or user on the interaction");
    return id;
  }

  /** An authenticated Discord REST client. */
  rest(): DiscordRest {
    return new DiscordRest(this.env.DISCORD_TOKEN);
  }

  defaultComponents(jumpUrl: string) {
    return defaultComponents(jumpUrl);
  }

  private kv(binding: string): KVNamespace {
    const namespace = (this.env as unknown as Record<string, unknown>)[binding];
    if (!namespace) throw new InteractionFailed(`KV binding '${binding}' not found`);
    return namespace as KVNamespace;
  }

  async kvGet(binding: string, key: string): Promise<string | null> {
    return this.kv(binding).get(key);
  }

  async kvPut(binding: string, key: string, value: string): Promise<void> {
    await this.kv(binding).put(key, value);
  }
}

/**
 * A slash command or message/user context-menu command.
 *
 * To add one: implement this interface in `src/commands/<name>.ts`, export it
 * from `src/commands/index.ts`, then re-run the `/register` endpoint.
 */
export interface Command {
  /** Command name, e.g. `help` for `/help`. */
  readonly name: string;
  /** Short description. Required for chat-input commands, empty otherwise. */
  readonly description?: string;
  /** Defaults to a chat-input (slash) command. */
  readonly type?: ApplicationCommandType;
  /** Arguments/choices, if any. */
  readonly options?: APIApplicationCommandOption[];

  respond(input: CommandInput): Promise<APIInteractionResponseCallbackData>;

  /** Implement to support autocomplete on this command's options. */
  autocomplete?(
    input: CommandInput,
  ): Promise<APICommandAutocompleteInteractionResponseCallbackData | null>;
}

/** The JSON body shape Discord expects when bulk-registering commands. */
export interface RegisteredCommand {
  name: string;
  description: string;
  options?: APIApplicationCommandOption[];
  type: ApplicationCommandType;
}

export function toRegisteredCommand(command: Command): RegisteredCommand {
  const type = command.type ?? ApplicationCommandType.ChatInput;
  return {
    name: command.name,
    // Discord rejects a non-empty description on context-menu commands.
    description: type === ApplicationCommandType.ChatInput ? (command.description ?? "") : "",
    options: command.options,
    type,
  };
}
