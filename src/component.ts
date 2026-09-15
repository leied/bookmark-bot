import type {
  APIInteractionResponse,
  APIInteractionGuildMember,
  APIMessage,
  APIMessageComponentInteraction,
  ComponentType,
  Snowflake,
} from "discord-api-types/v10";

import type { Env } from "./env.js";
import { DiscordRest } from "./discord.js";
import { InteractionFailed } from "./errors.js";
import { defaultComponents } from "./shared.js";

/** Everything a message-component (button/select) handler is given. */
export class ComponentInput {
  readonly customId: string;
  readonly componentType: ComponentType;
  readonly values: string[];
  readonly guildId?: Snowflake;
  readonly channelId?: Snowflake;
  readonly member?: APIInteractionGuildMember;
  readonly message: APIMessage;

  constructor(
    interaction: APIMessageComponentInteraction,
    readonly env: Env,
    readonly ctx: ExecutionContext,
  ) {
    const data = interaction.data;
    this.customId = data.custom_id;
    this.componentType = data.component_type;
    this.values = "values" in data && data.values ? [...data.values] : [];
    this.guildId = interaction.guild_id;
    // `channel` is the modern field; `channel_id` is kept as a fallback.
    this.channelId = interaction.channel?.id ?? interaction.channel_id;
    this.member = interaction.member;
    this.message = interaction.message;
  }

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
 * A handler for message component interactions.
 *
 * Handlers are matched by `custom_id` prefix, so a component can encode state
 * after its name (as `color` does with `color:<rgb>:<guild>/<channel>/<msg>`).
 */
export interface Component {
  readonly customId: string;
  respond(input: ComponentInput): Promise<APIInteractionResponse>;
}
