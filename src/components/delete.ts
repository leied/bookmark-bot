import {
  InteractionResponseType,
  MessageFlags,
  type APIInteractionResponse,
} from "discord-api-types/v10";

import type { Component, ComponentInput } from "../component.js";

export const del: Component = {
  customId: "delete",

  async respond(input: ComponentInput): Promise<APIInteractionResponse> {
    const response = await input
      .rest()
      .delete(`/channels/${input.channelId}/messages/${input.message.id}`);

    if (!response.ok) {
      console.log(`[DELETE MESSAGE] failed: ${response.status} ${await response.text()}`);
    }

    // The original message is gone either way; tell the user so rather than
    // leaving the interaction unacknowledged.
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "Bookmark Deleted", flags: MessageFlags.Ephemeral },
    };
  },
};
